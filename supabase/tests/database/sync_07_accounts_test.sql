begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_column('public', 'sync_spaces', 'owner_user_id');
select has_column('public', 'devices', 'account_user_id');
select has_column('public', 'devices', 'auth_session_id');

select ok(
  to_regclass('public.sync_spaces_owner_unique') is not null
    and to_regclass('public.devices_active_auth_session_unique') is not null,
  'account spaces and active auth sessions are unique'
);

select ok(
  to_regprocedure('private.current_auth_session_id()') is not null
    and to_regprocedure('private.is_active_sync_device(uuid)') is not null
    and to_regprocedure('public.lifeos_sync_adopt_current_space(uuid)') is not null
    and to_regprocedure('public.lifeos_sync_revoke_current_device()') is not null
    and not exists (
      select 1
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name in ('sync_spaces', 'devices')
        and grantee = 'authenticated'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    )
    and not exists (
      select 1
      from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name in (
          'lifeos_sync_adopt_current_space',
          'lifeos_sync_revoke_current_device'
        )
        and grantee in ('PUBLIC', 'anon')
    ),
  'account helpers and RPCs exist without direct-write or public execute grants'
);

insert into auth.users (id, aud, role)
values
  ('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated'),
  ('81000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated');

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000003"}',
  true
);

create temporary table sync07_account_space(
  space_id uuid,
  device_id uuid,
  current_key_epoch integer
) on commit drop;

insert into sync07_account_space
select * from public.lifeos_sync_create_first_space(
  '84000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000002',
  repeat('21', 32), repeat('22', 32), repeat('23', 24), 'windows',
  encode(extensions.digest(decode(repeat('44', 32), 'hex'), 'sha256'), 'hex'),
  repeat('25', 32), repeat('26', 24)
);

select ok(
  exists (
    select 1
    from public.sync_spaces s
    join public.devices d on d.space_id = s.space_id
    where s.space_id = '84000000-0000-4000-8000-000000000002'
      and s.owner_user_id = '81000000-0000-4000-8000-000000000002'
      and d.device_id = '83000000-0000-4000-8000-000000000002'
      and d.supabase_auth_user_id = '81000000-0000-4000-8000-000000000002'
      and d.account_user_id = '81000000-0000-4000-8000-000000000002'
      and d.auth_session_id = '82000000-0000-4000-8000-000000000003'
      and d.status = 'active'
  )
    and (select count(*) from public.lifeos_sync_list_devices()) = 1,
  'a permanent account creates one bound active device in its owned space'
);

select throws_ok(
  $$select * from public.lifeos_sync_create_first_space(
    '84000000-0000-4000-8000-000000000003',
    '83000000-0000-4000-8000-000000000003',
    repeat('31', 32), repeat('32', 32), repeat('33', 24), 'android',
    repeat('34', 32), repeat('35', 32), repeat('36', 24)
  )$$,
  '23505',
  null,
  'one account cannot create a second sync space'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);

create temporary table sync07_legacy_space(
  space_id uuid,
  device_id uuid,
  current_key_epoch integer
) on commit drop;

insert into sync07_legacy_space
select * from public.lifeos_sync_create_first_space(
  '84000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  repeat('01', 32), repeat('02', 32), repeat('03', 24), 'windows',
  encode(extensions.digest(decode(repeat('14', 32), 'hex'), 'sha256'), 'hex'),
  repeat('05', 32), repeat('06', 24)
);

select ok(
  exists (
    select 1
    from public.sync_spaces s
    join public.devices d on d.space_id = s.space_id
    where s.space_id = '84000000-0000-4000-8000-000000000001'
      and s.owner_user_id is null
      and d.account_user_id is null
      and d.auth_session_id is null
  ),
  'legacy anonymous first-space creation keeps account columns null'
);

select is(
  (select count(*) from public.lifeos_sync_list_devices()),
  1::bigint,
  'legacy anonymous active-device access remains available before adoption'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000001"}',
  true
);

create temporary table sync07_adoption(
  space_id uuid,
  current_key_epoch integer
) on commit drop;

insert into sync07_adoption
select * from public.lifeos_sync_adopt_current_space(
  '83000000-0000-4000-8000-000000000001'
);

select ok(
  (select space_id = '84000000-0000-4000-8000-000000000001'
      and current_key_epoch = 1 from sync07_adoption)
    and exists (
      select 1
      from public.sync_spaces s
      join public.devices d on d.space_id = s.space_id
      where s.owner_user_id = '81000000-0000-4000-8000-000000000001'
        and d.device_id = '83000000-0000-4000-8000-000000000001'
        and d.account_user_id = '81000000-0000-4000-8000-000000000001'
        and d.auth_session_id = '82000000-0000-4000-8000-000000000001'
    ),
  'adoption keeps the space and key epoch while binding its first account session'
);

select is(
  (select row(result.space_id, result.current_key_epoch)::text
   from public.lifeos_sync_adopt_current_space('83000000-0000-4000-8000-000000000001') result),
  row('84000000-0000-4000-8000-000000000001'::uuid, 1)::text,
  'repeated adoption by the same session is idempotent'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000005"}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_adopt_current_space(
    '83000000-0000-4000-8000-000000000001'
  )$$,
  '42501', null, 'a foreign account cannot adopt the legacy device'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_adopt_current_space(
    '83000000-0000-4000-8000-000000000001'
  )$$,
  '42501', null, 'a different session cannot replay adoption'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000004"}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_list_devices()$$,
  '42501', null, 'an account session without an active bound device is denied'
);

do $sync07$
begin
  perform * from public.lifeos_sync_begin_recovery(
    '84000000-0000-4000-8000-000000000002', repeat('44', 32),
    '83000000-0000-4000-8000-000000000004', repeat('41', 32), 'android'
  );
end;
$sync07$;

select ok(
  exists (
    select 1 from public.devices d
    where d.device_id = '83000000-0000-4000-8000-000000000004'
      and d.status = 'pending'
      and d.join_method = 'recovery'
      and d.account_user_id = '81000000-0000-4000-8000-000000000002'
      and d.auth_session_id = '82000000-0000-4000-8000-000000000004'
  ),
  'account recovery creates a pending device bound to the current session'
);

set local role authenticated;
select is(
  (select count(*) from public.devices),
  1::bigint,
  'a pending recovery session sees only its own device row'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000006"}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.devices),
  0::bigint,
  'another session cannot see the pending recovery device'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000004"}',
  true
);
do $sync07$
begin
  perform public.lifeos_sync_complete_recovery(
    '83000000-0000-4000-8000-000000000004', repeat('44', 32),
    encode(
      extensions.digest(decode(repeat('25', 32) || repeat('26', 24), 'hex'),
      'sha256'
    ),
    'hex'),
    repeat('42', 32), repeat('43', 24)
  );
end;
$sync07$;

select is(
  (select status from public.devices where device_id = '83000000-0000-4000-8000-000000000004'),
  'active',
  'recovery completion activates the session-bound device'
);

select throws_ok(
  $$insert into public.devices(
    device_id, space_id, supabase_auth_user_id, account_user_id, auth_session_id,
    public_key, device_name_ciphertext, device_name_nonce, device_name_key_epoch,
    platform, status, activated_at, join_method
  ) values (
    '83000000-0000-4000-8000-000000000006',
    '84000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000004',
    decode(repeat('51', 32), 'hex'), decode(repeat('52', 32), 'hex'),
    decode(repeat('53', 24), 'hex'), 1, 'android', 'active', now(), 'recovery'
  )$$,
  '23505', null, 'one session cannot have two active device bindings'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.sync_spaces),
  0::bigint,
  'a foreign account cannot read another account space'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000004"}',
  true
);
do $sync07$
begin
  perform public.lifeos_sync_revoke_current_device();
end;
$sync07$;
select is(
  (select status from public.devices where device_id = '83000000-0000-4000-8000-000000000004'),
  'revoked',
  'current-device revocation changes only the bound device state'
);
select throws_ok(
  $$select * from public.lifeos_sync_pull_pilot_events(0, 100)$$,
  '42501', null, 'revoked current session is denied immediately'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000006"}',
  true
);
set local role authenticated;
select is(
  (select count(*) from storage.objects where bucket_id = 'lifeos-attachments'),
  0::bigint,
  'an unbound account session cannot read encrypted blobs'
);
select throws_ok(
  $$insert into storage.objects(bucket_id, name, owner_id, metadata)
    values (
      'lifeos-attachments',
      '84000000-0000-4000-8000-000000000002/85000000-0000-4000-8000-000000000001/1',
      '81000000-0000-4000-8000-000000000002',
      '{}'::jsonb
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an unbound account session cannot insert encrypted blobs'
);
reset role;

select * from finish();
rollback;
