begin;

create extension if not exists pgtap with schema extensions;
create schema sync02_test;
set local search_path = sync02_test, public, extensions;

create temporary table sync02_tap_results(
  result text not null
) on commit drop;

create function sync02_test.ok(boolean, text)
returns text
language plpgsql
as $$
declare
  tap_result text;
begin
  tap_result := extensions.ok($1, $2);
  insert into sync02_tap_results values (tap_result);
  return tap_result;
end;
$$;

create function sync02_test.is(anyelement, anyelement, text)
returns text
language plpgsql
as $$
declare
  tap_result text;
begin
  tap_result := extensions.is($1, $2, $3);
  insert into sync02_tap_results values (tap_result);
  return tap_result;
end;
$$;

create function sync02_test.throws_ok(text, text, text, text)
returns text
language plpgsql
as $$
declare
  tap_result text;
begin
  tap_result := extensions.throws_ok($1, $2, $3, $4);
  insert into sync02_tap_results values (tap_result);
  return tap_result;
end;
$$;

create function sync02_test.lives_ok(text, text)
returns text
language plpgsql
as $$
declare
  tap_result text;
begin
  tap_result := extensions.lives_ok($1, $2);
  insert into sync02_tap_results values (tap_result);
  return tap_result;
end;
$$;

select no_plan();

select has_column('public', 'sync_spaces', 'key_rotation_status', 'sync spaces record rotation state');
select has_column('public', 'devices', 'join_method', 'devices record their join method');
select has_column('public', 'pairing_invites', 'claimed_by_device', 'pairing invites record their claimed device');
select has_column('public', 'key_envelopes', 'envelope_purpose', 'key envelopes record their purpose');

select ok(
  (select count(*) = 15 from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(array[
     'lifeos_sync_create_first_space', 'lifeos_sync_create_pairing_invite',
     'lifeos_sync_cancel_pairing_invite', 'lifeos_sync_claim_pairing_invite',
     'lifeos_sync_list_my_pending_pairing_devices', 'lifeos_sync_publish_key_envelope',
     'lifeos_sync_fetch_my_pending_envelope', 'lifeos_sync_acknowledge_pairing',
     'lifeos_sync_fetch_my_rotation_envelope',
     'lifeos_sync_begin_recovery', 'lifeos_sync_complete_recovery',
     'lifeos_sync_list_devices', 'lifeos_sync_update_my_device_name',
     'lifeos_sync_revoke_device_and_advance_epoch', 'lifeos_sync_finalize_key_epoch_rotation'
   ])),
  'all narrow SYNC-02 RPCs exist'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'lifeos_sync_%'
      and (not p.prosecdef or not ('search_path=""' = any(p.proconfig)))
  ),
  'every SYNC-02 RPC is security definer with an empty search path'
);

select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name like 'lifeos_sync_%'
      and grantee in ('PUBLIC', 'anon') and privilege_type = 'EXECUTE'
  ),
  'PUBLIC and anon cannot execute SYNC-02 RPCs'
);

select ok(
  not exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = any(array[
        'sync_spaces', 'devices', 'pairing_invites', 'key_envelopes',
        'sync_events', 'sync_objects', 'device_cursors',
        'attachment_metadata', 'snapshot_metadata'
      ])
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
  ),
  'authenticated clients still have no direct sync-table writes'
);

select ok(
  (select count(*) = 1 from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'devices'
     and policyname = 'lifeos_sync_pending_device_self'
     and cmd = 'SELECT'
     and coalesce(qual, '') like '%is_anonymous_sync_identity%'
     and coalesce(qual, '') like '%supabase_auth_user_id%'),
  'pending access is a narrow anonymous-owned device self policy'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname in ('public', 'storage') and policyname like 'lifeos_sync_%'
      and cmd <> 'SELECT'
      and not (schemaname = 'storage' and tablename = 'objects'
        and policyname = 'lifeos_sync_storage_insert' and cmd = 'INSERT')
  ),
  'public writes remain forbidden; only the SYNC-05 immutable Storage insert is allowed'
);

insert into auth.users (id, aud, role)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_create_first_space(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    repeat('01', 32), repeat('02', 32), repeat('03', 24), 'windows',
    repeat('04', 32), repeat('05', 32), repeat('06', 24)
  )$$,
  '42501',
  'LifeOS technical identity is required',
  'non-anonymous authenticated identities are rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
select lives_ok(
  $$select * from public.lifeos_sync_create_first_space(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    repeat('01', 32), repeat('02', 32), repeat('03', 24), 'windows',
    encode(extensions.digest(decode(repeat('44', 32), 'hex'), 'sha256'), 'hex'),
    repeat('05', 32), repeat('06', 24)
  )$$,
  'anonymous technical identity creates the first active device'
);

select is(
  (select status from public.devices where device_id = '30000000-0000-4000-8000-000000000001'),
  'active',
  'first device is active'
);
select is(
  (select current_key_epoch from public.sync_spaces where space_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'first space starts at epoch one'
);

create temporary table sync02_test_state(
  invite_id uuid,
  expires_at timestamptz
) on commit drop;

insert into sync02_test_state
select * from public.lifeos_sync_create_pairing_invite(
  encode(extensions.digest(decode(repeat('ab', 32), 'hex'), 'sha256'), 'hex')
);

select ok(
  (select expires_at between statement_timestamp() + interval '4 minutes 50 seconds'
                         and statement_timestamp() + interval '5 minutes 10 seconds'
   from sync02_test_state),
  'pairing invite expires in about five minutes'
);
select ok(
  (select secret_hash = extensions.digest(decode(repeat('ab', 32), 'hex'), 'sha256')
   from public.pairing_invites where invite_id = (select invite_id from sync02_test_state)),
  'server stores only the pairing secret hash'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
select throws_ok(
  format(
    $$select * from public.lifeos_sync_claim_pairing_invite('%s', %L,
      '30000000-0000-4000-8000-000000000002', repeat('07', 32), 'android')$$,
    (select invite_id from sync02_test_state), repeat('ac', 32)
  ),
  '42501', 'Pairing invitation is invalid', 'wrong invite secret is rejected'
);
select lives_ok(
  format(
    $$select * from public.lifeos_sync_claim_pairing_invite('%s', %L,
      '30000000-0000-4000-8000-000000000002', repeat('07', 32), 'android')$$,
    (select invite_id from sync02_test_state), repeat('ab', 32)
  ),
  'correct one-time secret creates a pending device'
);
select is(
  (select status from public.devices where device_id = '30000000-0000-4000-8000-000000000002'),
  'pending',
  'claimed device remains pending before its envelope'
);

set local role authenticated;
select is((select count(*) from public.devices), 1::bigint, 'pending sees only its own device row');
select is((select count(*) from public.sync_spaces), 0::bigint, 'pending sees no sync space');
-- SYNC-03 restricts pilot tables to narrow RPCs, even for authenticated clients.
select throws_ok(
  'select * from public.sync_events', '42501', 'permission denied for table sync_events',
  'pending cannot read events directly'
);
select throws_ok(
  'select * from public.sync_objects', '42501', 'permission denied for table sync_objects',
  'pending cannot read objects directly'
);
select throws_ok(
  'select * from public.lifeos_sync_pull_pilot_events(0, 100)',
  '42501', 'Active LifeOS device is required', 'pending cannot read events through the pilot RPC'
);
select is((select count(*) from public.snapshot_metadata), 0::bigint, 'pending sees no snapshots');
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
select lives_ok(
  $$select public.lifeos_sync_publish_key_envelope(
    '30000000-0000-4000-8000-000000000002', 1, 'pairing', repeat('08', 32), repeat('09', 24)
  )$$,
  'trusted device publishes an opaque pairing envelope'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
select is(
  (select count(*) from public.lifeos_sync_fetch_my_pending_envelope()),
  1::bigint,
  'pending recipient fetches only its current envelope through RPC'
);
select lives_ok(
  $$select public.lifeos_sync_acknowledge_pairing(
    '30000000-0000-4000-8000-000000000002',
    encode(extensions.digest(decode(repeat('08', 32) || repeat('09', 24), 'hex'), 'sha256'), 'hex'),
    repeat('0a', 32), repeat('0b', 24)
  )$$,
  'valid local-decrypt acknowledgement activates the pending device'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
select is((select count(*) from public.lifeos_sync_list_devices()), 2::bigint, 'My Devices returns real membership');

create temporary table sync02_rotation(
  new_key_epoch integer,
  device_id uuid,
  public_key bytea
) on commit drop;
insert into sync02_rotation
select * from public.lifeos_sync_revoke_device_and_advance_epoch(
  '30000000-0000-4000-8000-000000000002', 1
);
select is((select distinct new_key_epoch from sync02_rotation), 2, 'revocation advances exactly one epoch');
select is(
  (select status from public.devices where device_id = '30000000-0000-4000-8000-000000000002'),
  'revoked',
  'target device is immediately revoked'
);
select is(
  (select key_rotation_status from public.sync_spaces where space_id = '20000000-0000-4000-8000-000000000001'),
  'pending',
  'rotation remains visibly pending until all envelopes exist'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":true}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_begin_recovery(
    '20000000-0000-4000-8000-000000000001', repeat('44', 32),
    '30000000-0000-4000-8000-000000000004', repeat('0c', 32), 'android'
  )$$,
  '42501', 'Recovery authorization failed', 'recovery is blocked during an incomplete rotation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
select lives_ok(
  $$select public.lifeos_sync_publish_key_envelope(
    '30000000-0000-4000-8000-000000000001', 2, 'rotation', repeat('0d', 32), repeat('0e', 24)
  )$$,
  'rotation envelope is published only for a remaining active device'
);
select is(
  (select count(*) from public.lifeos_sync_fetch_my_rotation_envelope(1)),
  1::bigint,
  'remaining active device can fetch its next-epoch rotation envelope'
);
select lives_ok(
  $$select public.lifeos_sync_finalize_key_epoch_rotation(2, repeat('0f', 32), repeat('10', 24))$$,
  'complete active-device coverage finalizes rotation'
);
select is(
  (select key_rotation_status from public.sync_spaces where space_id = '20000000-0000-4000-8000-000000000001'),
  'stable',
  'rotation returns to stable only after finalization'
);
select is(
  (select count(*) from public.key_envelopes
   where key_epoch = 2 and recipient_device_id = '30000000-0000-4000-8000-000000000002'),
  0::bigint,
  'revoked device receives no new epoch envelope'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local role authenticated;
select is((select count(*) from public.sync_spaces), 0::bigint, 'revoked device has no space access');
select is((select count(*) from public.devices), 0::bigint, 'revoked device has no membership access');
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_begin_recovery(
    '20000000-0000-4000-8000-000000000001',
    encode(extensions.digest(decode(repeat('44', 32), 'hex'), 'sha256'), 'hex'),
    '30000000-0000-4000-8000-000000000003', repeat('11', 32), 'windows'
  )$$,
  '42501', 'Recovery authorization failed', 'stored verifier cannot be replayed as recovery proof'
);
select lives_ok(
  $$select * from public.lifeos_sync_begin_recovery(
    '20000000-0000-4000-8000-000000000001', repeat('44', 32),
    '30000000-0000-4000-8000-000000000003', repeat('11', 32), 'windows'
  )$$,
  'correct derived recovery proof creates a replacement pending device'
);
select lives_ok(
  $$select public.lifeos_sync_complete_recovery(
    '30000000-0000-4000-8000-000000000003', repeat('44', 32),
    encode(extensions.digest(decode(repeat('0f', 32) || repeat('10', 24), 'hex'), 'sha256'), 'hex'),
    repeat('12', 32), repeat('13', 24)
  )$$,
  'replacement activates only after binding to the exact recovery envelope'
);
select is(
  (select status from public.devices where device_id = '30000000-0000-4000-8000-000000000003'),
  'active',
  'recovery replacement becomes active'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = any(array['sync_spaces', 'devices', 'pairing_invites', 'key_envelopes'])
      and column_name = any(array[
        'private_key', 'space_key', 'recovery_root', 'pairing_secret', 'master_key',
        'title', 'content', 'body', 'journal_text'
      ])
  ),
  'server schema contains no plaintext LifeOS content or permanent secret columns'
);

select * from extensions.finish();
rollback;
