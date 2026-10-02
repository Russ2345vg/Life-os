begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'sync_spaces', 'minimum_data_format', 'space format floor exists');
select has_column('public', 'devices', 'supported_data_format', 'device format support exists');
select ok(
  to_regprocedure('public.lifeos_sync_advertise_data_format(uuid,smallint)') is not null
    and to_regprocedure('public.lifeos_sync_read_data_format()') is not null
    and not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name in (
          'lifeos_sync_advertise_data_format', 'lifeos_sync_read_data_format'
        )
        and grantee in ('PUBLIC', 'anon')
    ),
  'format RPCs exist without public or anonymous execute grants'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'lifeos_sync_advertise_data_format', 'lifeos_sync_read_data_format'
      )
      and (not p.prosecdef or not ('search_path=""' = any(p.proconfig)))
  ),
  'format RPCs have a fixed empty search path and security definer'
);

insert into auth.users (id, aud, role)
values
  ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated');

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"92000000-0000-4000-8000-000000000001"}',
  true
);

select * from public.lifeos_sync_create_first_space(
  '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  repeat('11', 32), repeat('12', 32), repeat('13', 24), 'windows',
  repeat('14', 32), repeat('15', 32), repeat('16', 24)
);

select ok(
  (select minimum_data_format = 1 from public.sync_spaces
   where space_id = '93000000-0000-4000-8000-000000000001')
    and (select supported_data_format = 1 from public.devices
         where device_id = '94000000-0000-4000-8000-000000000001'),
  'old creation RPCs default both format markers to legacy'
);
select ok(
  (select minimum_data_format = 1 and supported_data_format = 1
      and not active_devices_ready from public.lifeos_sync_read_data_format()),
  'the active device reads a legacy floor before advertising support'
);
select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event_v2(
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
  )$$,
  '42501', 'pilot data format denied',
  'a device cannot use the format-2 endpoint before advertising support'
);

select * from public.lifeos_sync_advertise_data_format(
  '94000000-0000-4000-8000-000000000001', 2::smallint
);
select ok(
  (select minimum_data_format = 1 and supported_data_format = 2
      and active_devices_ready from public.lifeos_sync_read_data_format()),
  'self-advertisement records support while the space floor stays legacy'
);
select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event_v2(
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
  )$$,
  '42501', 'pilot data format denied',
  'advertisement alone cannot send format-2 data to an unpromoted space'
);
select throws_ok(
  $$select * from public.lifeos_sync_pull_pilot_events_v2(0, 100)$$,
  '42501', 'pilot data format denied',
  'advertisement alone cannot pull through the format-2 route'
);
create temporary table sync08_first_event on commit drop as
select * from public.lifeos_sync_push_pilot_event(
  '95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
);

select is(
  (select minimum_data_format from public.lifeos_sync_raise_data_format()),
  2::smallint,
  'an advertised device promotes a space only when all active devices are ready'
);
select throws_ok(
  $$select * from public.lifeos_sync_push_pilot_event(
    '95000000-0000-4000-8000-000000000002',
    '96000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    1, 2, 1, 'upsert', 200, 0, repeat('cc', 17), repeat('dd', 24)
  )$$,
  '42501', 'pilot data format denied',
  'a promoted space rejects a new event through the legacy route'
);
select is(
  (select sequence from public.lifeos_sync_push_pilot_event(
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    0, 1, 1, 'upsert', 100, 0, repeat('aa', 17), repeat('bb', 24)
  )),
  (select sequence from sync08_first_event),
  'an exact pre-promotion envelope replay remains acknowledged'
);
select throws_ok(
  $$select * from public.lifeos_sync_pull_pilot_events(0, 100)$$,
  '42501', 'pilot data format denied',
  'a promoted space does not reveal new events through the legacy pull route'
);
select is(
  (select count(*) from public.lifeos_sync_pull_pilot_events_v2(0, 100)),
  1::bigint,
  'the promoted space stays readable through the format-2 pull route'
);
select throws_ok(
  $$select * from public.lifeos_sync_advertise_data_format(
    '94000000-0000-4000-8000-000000000001', 1::smallint
  )$$,
  '42501', 'Data format advertisement is invalid',
  'a client cannot downgrade its advertised support through the new RPC'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"92000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_advertise_data_format(
    '94000000-0000-4000-8000-000000000001', 2::smallint
  )$$,
  '42501', 'Data format advertisement is not authorized',
  'another account cannot advertise support for this device'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"92000000-0000-4000-8000-000000000099"}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_advertise_data_format(
    '94000000-0000-4000-8000-000000000001', 2::smallint
  )$$,
  '42501', 'Data format advertisement is not authorized',
  'another session of the same account cannot advertise device support'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"92000000-0000-4000-8000-000000000001"}',
  true
);
update public.devices set status = 'revoked', revoked_at = statement_timestamp()
where device_id = '94000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select * from public.lifeos_sync_advertise_data_format(
    '94000000-0000-4000-8000-000000000001', 2::smallint
  )$$,
  '42501', 'Data format advertisement is not authorized',
  'revoked devices cannot advertise support'
);

select * from finish();
rollback;
