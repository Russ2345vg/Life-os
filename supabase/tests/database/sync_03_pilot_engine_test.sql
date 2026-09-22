begin;

create extension if not exists pgtap with schema extensions;
create schema sync03_test;
set local search_path = sync03_test, public, extensions;

create temporary table sync03_tap_results(result text not null) on commit drop;

create function sync03_test.ok(boolean, text) returns text language plpgsql as $$
declare tap_result text;
begin
  tap_result := extensions.ok($1, $2);
  insert into sync03_tap_results values (tap_result);
  return tap_result;
end;
$$;

create function sync03_test.is(anyelement, anyelement, text) returns text language plpgsql as $$
declare tap_result text;
begin
  tap_result := extensions.is($1, $2, $3);
  insert into sync03_tap_results values (tap_result);
  return tap_result;
end;
$$;

create function sync03_test.throws_ok(text, text, text, text) returns text language plpgsql as $$
declare tap_result text;
begin
  tap_result := extensions.throws_ok($1, $2, $3, $4);
  insert into sync03_tap_results values (tap_result);
  return tap_result;
end;
$$;

select no_plan();

select has_column('public', 'sync_events', 'operation', 'events distinguish upsert and tombstone');
select has_column('public', 'sync_events', 'hlc_wall_time', 'events persist HLC wall time');
select has_column('public', 'sync_events', 'hlc_logical', 'events persist HLC logical counter');
select has_column('public', 'sync_objects', 'event_id', 'current objects bind their winning event');

select ok(
  (select count(*) = 3 from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(array[
     'lifeos_sync_push_pilot_event',
     'lifeos_sync_pull_pilot_events',
     'lifeos_sync_ack_pilot_cursor'
   ])),
  'the three narrow pilot RPCs exist'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'lifeos_sync_push_pilot_event',
        'lifeos_sync_pull_pilot_events',
        'lifeos_sync_ack_pilot_cursor'
      ])
      and (not p.prosecdef or not ('search_path=""' = any(p.proconfig)))
  ),
  'pilot RPCs are security definer functions with empty search path'
);

select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name like 'lifeos_sync_%pilot%'
      and grantee in ('PUBLIC', 'anon')
  ),
  'PUBLIC and anon cannot execute pilot RPCs'
);

select ok(
  not exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = any(array['sync_events', 'sync_objects', 'device_cursors'])
      and grantee in ('anon', 'authenticated')
  ),
  'clients have no direct pilot table privileges'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = any(array['sync_events', 'sync_objects', 'device_cursors'])
      and column_name = any(array[
        'entity_type', 'title', 'name', 'description', 'content', 'body',
        'direction_id', 'project_id', 'goal_id', 'journal_text', 'cover_image'
      ])
  ),
  'pilot server schema contains no entity type, content, or relationship metadata'
);

insert into auth.users (id, aud, role)
values
  ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated'),
  ('71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated');

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);

select * from public.lifeos_sync_create_first_space(
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  repeat('01', 32), repeat('02', 32), repeat('03', 24), 'windows',
  repeat('04', 32), repeat('05', 32), repeat('06', 24)
);

create temporary table first_push on commit drop as
select * from public.lifeos_sync_push_pilot_event(
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
);

select is((select is_current_winner from first_push), true, 'first encrypted event becomes current');
select is(
  (select count(*) from public.sync_events where event_id = '74000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one immutable event is stored'
);
select is(
  (select operation from public.sync_events where event_id = '74000000-0000-4000-8000-000000000001'),
  'upsert',
  'only operation metadata is visible to the server'
);

create temporary table repeated_push on commit drop as
select * from public.lifeos_sync_push_pilot_event(
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
);

select is(
  (select sequence from repeated_push),
  (select sequence from first_push),
  'retrying an identical event is idempotent'
);

select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    0, 1, 1, 'upsert', 100, 0, repeat('cc', 17), repeat('bb', 24)
  )$$,
  'P0001', 'event id content mismatch', 'changed ciphertext cannot impersonate an existing event ID'
);
select is(
  encode((select ciphertext from public.sync_events
    where event_id = '74000000-0000-4000-8000-000000000001'), 'hex'),
  repeat('aa', 17),
  'a rejected changed envelope never overwrites the immutable stored event'
);

select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    0, 1, 1, 'upsert', 101, 0, repeat('cc', 17), repeat('bb', 24)
  )$$,
  'P0001', 'event id content mismatch', 'an event ID cannot be replayed with changed semantics'
);

select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000009',
    '75000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    1, 3, 1, 'upsert', 101, 0, repeat('aa', 17), repeat('bb', 24)
  )$$,
  'P0001', 'pilot event rejected', 'revision must advance by exactly one step'
);

select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000009',
    '75000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    1, 2, 1, 'upsert', 101, 0, 'xyz', repeat('bb', 24)
  )$$,
  'P0001', 'pilot event rejected', 'malformed ciphertext is rejected before decoding'
);

select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000009',
    '75000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    1, 2, 2, 'upsert', 101, 0, repeat('aa', 17), repeat('bb', 24)
  )$$,
  'P0001', 'pilot event rejected', 'unsupported future key epoch is rejected'
);

select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000008',
    '75000000-0000-4000-8000-000000000008',
    '73000000-0000-4000-8000-000000000003',
    0, 1, 1, 'upsert', 101, 0, repeat('aa', 17), repeat('bb', 24)
  )$$,
  'P0001', 'pilot event rejected', 'a new event must bind the authenticated current device identity'
);

select * from public.lifeos_sync_push_pilot_event(
  '74000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  1, 2, 1, 'tombstone', 200, 0, repeat('cc', 17), repeat('dd', 24)
);

create temporary table stale_upsert on commit drop as
select * from public.lifeos_sync_push_pilot_event(
  '74000000-0000-4000-8000-000000000003',
  '75000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  1, 2, 1, 'upsert', 300, 0, repeat('ee', 17), repeat('ff', 24)
);

select is((select is_current_winner from stale_upsert), false, 'a stale update cannot resurrect a newer tombstone');
select is(
  (select is_tombstone from public.sync_objects
   where space_id = '72000000-0000-4000-8000-000000000001'
     and object_id = '75000000-0000-4000-8000-000000000001'),
  true,
  'the materialized winner remains the tombstone'
);

update public.sync_spaces
set current_key_epoch = 2
where space_id = '72000000-0000-4000-8000-000000000001';

create temporary table rotated_epoch_retry on commit drop as
select * from public.lifeos_sync_push_pilot_event(
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
);

select is(
  (select sequence from rotated_epoch_retry),
  (select sequence from first_push),
  'the exact old envelope is safely acknowledged after a key epoch rotation'
);
select is(
  (select key_epoch from public.sync_events
    where event_id = '74000000-0000-4000-8000-000000000001'),
  1,
  'acknowledging an exact replay keeps the original stored key epoch immutable'
);
select is(
  (select count(*) from public.sync_events
    where event_id = '74000000-0000-4000-8000-000000000001'),
  1::bigint,
  'retries never create a second row for one event ID'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',
  true
);
select * from public.lifeos_sync_create_first_space(
  '72000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000003',
  repeat('11', 32), repeat('12', 32), repeat('13', 24), 'android',
  repeat('14', 32), repeat('15', 32), repeat('16', 24)
);
select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
  )$$,
  'P0001', 'event id content mismatch', 'an exact envelope cannot be replayed from another space'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);

select is(
  (select count(*) from public.lifeos_sync_pull_pilot_events(0, 100)),
  3::bigint,
  'pull returns the immutable ordered event stream, including the losing event'
);

select public.lifeos_sync_ack_pilot_cursor((select max(sequence) from public.sync_events));
select is(
  (select last_sequence from public.device_cursors
   where device_id = '73000000-0000-4000-8000-000000000001'),
  (select max(sequence) from public.sync_events),
  'active device advances only its own cursor'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
insert into public.devices(
  device_id, space_id, supabase_auth_user_id, public_key,
  device_name_ciphertext, device_name_nonce, platform, status, join_method
) values (
  '73000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  decode(repeat('77', 32), 'hex'), null, null, 'android', 'pending', 'pairing'
);
select throws_ok(
  $$select * from public.lifeos_sync_pull_pilot_events(0, 100)$$,
  '42501', 'Active LifeOS device is required', 'a pending device cannot pull pilot events'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
update public.devices set status = 'revoked', revoked_at = statement_timestamp()
where device_id = '73000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select * from public.lifeos_sync_pull_pilot_events(0, 100)$$,
  '42501', 'Active LifeOS device is required', 'a revoked device loses future pilot access'
);

select * from extensions.finish();
rollback;
