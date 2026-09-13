begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(54);

select has_table('public', table_name, table_name || ' exists')
from unnest(array[
  'sync_spaces',
  'devices',
  'pairing_invites',
  'key_envelopes',
  'sync_events',
  'sync_objects',
  'device_cursors',
  'attachment_metadata',
  'snapshot_metadata'
]) as discovered(table_name);

select ok(c.relrowsecurity, c.relname || ' has RLS enabled')
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'sync_spaces',
    'devices',
    'pairing_invites',
    'key_envelopes',
    'sync_events',
    'sync_objects',
    'device_cursors',
    'attachment_metadata',
    'snapshot_metadata'
  ]);

select ok(c.relforcerowsecurity, c.relname || ' forces RLS for table owners')
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'sync_spaces',
    'devices',
    'pairing_invites',
    'key_envelopes',
    'sync_events',
    'sync_objects',
    'device_cursors',
    'attachment_metadata',
    'snapshot_metadata'
  ]);

select ok(
  not exists (
    select 1
    from information_schema.table_privileges
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name = any(array[
        'sync_spaces',
        'devices',
        'pairing_invites',
        'key_envelopes',
        'sync_events',
        'sync_objects',
        'device_cursors',
        'attachment_metadata',
        'snapshot_metadata'
      ])
  ),
  'anon has no privileges on sync tables'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = any(array[
        'sync_spaces',
        'devices',
        'pairing_invites',
        'key_envelopes',
        'sync_events',
        'sync_objects',
        'device_cursors',
        'attachment_metadata',
        'snapshot_metadata'
      ])
      and column_name = any(array['title', 'content', 'body', 'filename', 'journal_text'])
  ),
  'sync schema exposes no plaintext LifeOS content columns'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class table_record on table_record.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and table_record.relname = 'sync_events'
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid) = 'UNIQUE (event_id)'
  ),
  'sync_events.event_id is unique'
);

select ok(
  (
    select column_record.is_identity = 'YES'
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'sync_events'
      and column_record.column_name = 'sequence'
  ),
  'sync_events.sequence is an identity column'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'lifeos-attachments' and public = false
  ),
  'lifeos-attachments bucket is private'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'lifeos-snapshots' and public = false
  ),
  'lifeos-snapshots bucket is private'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname in ('public', 'storage')
      and policyname like 'lifeos_sync_%'
      and (coalesce(qual, '') ~ '^\(?true\)?$' or coalesce(with_check, '') ~ '^\(?true\)?$')
  ),
  'LifeOS sync policies contain no unconditional true access'
);

select ok(
  (
    select count(*) = 8
      and bool_and(cmd = 'SELECT')
      and bool_and(coalesce(qual, '') like '%is_active_sync_device%')
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname like 'lifeos_sync_active_device_%'
  ),
  'client-readable sync tables use select-only active-device policies'
);

select ok(
  (
    select count(*) = 2
      and bool_and(tablename = 'objects' and roles = array['authenticated']::name[])
      and bool_and((policyname = 'lifeos_sync_storage_select' and cmd = 'SELECT')
        or (policyname = 'lifeos_sync_storage_insert' and cmd = 'INSERT'))
      and bool_and(coalesce(qual, with_check, '') like '%is_active_sync_device%')
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and policyname like 'lifeos_sync_storage_%'
  ),
  'final storage allows only active-device reads and immutable inserts'
);

select ok(
  not exists (
    select 1
    from information_schema.table_privileges
    where grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
      and table_schema = 'public'
      and table_name = any(array[
        'sync_spaces',
        'devices',
        'pairing_invites',
        'key_envelopes',
        'sync_events',
        'sync_objects',
        'device_cursors',
        'attachment_metadata',
        'snapshot_metadata'
      ])
  ),
  'authenticated clients have no direct write grants in SYNC-01'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'pairing_invites'
  ),
  'pairing invites remain client-locked until narrow SYNC-02 RPCs exist'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname in ('public', 'storage')
      and policyname like 'lifeos_sync_%'
      and cmd <> 'SELECT'
      and not (schemaname = 'storage' and tablename = 'objects'
        and policyname = 'lifeos_sync_storage_insert' and cmd = 'INSERT')
  ),
  'public writes remain forbidden; only the SYNC-05 immutable Storage insert is allowed'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'private'
      and procedure_record.proname = 'is_active_sync_device'
      and procedure_record.prosecdef
      and 'search_path=""' = any(procedure_record.proconfig)
  ),
  'membership helper is security definer with an empty search path'
);

insert into auth.users (id, aud, role)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated');

insert into public.sync_spaces (space_id)
values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');

insert into public.devices (
  device_id,
  space_id,
  supabase_auth_user_id,
  public_key,
  device_name_ciphertext,
  device_name_nonce,
  platform,
  status,
  device_name_key_epoch,
  activated_at,
  revoked_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex'),
    decode(repeat('01', 32), 'hex'),
    decode(repeat('01', 24), 'hex'),
    'windows',
    'active',
    1,
    statement_timestamp(),
    null
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    decode(repeat('02', 32), 'hex'),
    null,
    null,
    'android',
    'pending',
    null,
    null,
    null
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    decode(repeat('03', 32), 'hex'),
    decode(repeat('03', 32), 'hex'),
    decode(repeat('03', 24), 'hex'),
    'android',
    'revoked',
    1,
    statement_timestamp(),
    statement_timestamp()
  );

insert into storage.objects (bucket_id, name)
values
  ('lifeos-attachments', '20000000-0000-4000-8000-000000000001/opaque-a/1'),
  ('lifeos-attachments', '20000000-0000-4000-8000-000000000002/opaque-b/1');

-- SYNC-02 requires an anonymous technical identity as well as active membership.
select set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select ok(
  private.is_active_sync_device('20000000-0000-4000-8000-000000000001'),
  'active device membership is accepted for its own space'
);
select ok(
  not private.is_active_sync_device('20000000-0000-4000-8000-000000000002'),
  'active device membership is denied for another space'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select ok(
  not private.is_active_sync_device('20000000-0000-4000-8000-000000000001'),
  'pending device membership is denied'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select ok(
  not private.is_active_sync_device('20000000-0000-4000-8000-000000000001'),
  'revoked device membership is denied'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select count(*) from public.sync_spaces),
  1::bigint,
  'active client reads only its own space through RLS'
);
select is(
  (
    select count(*)
    from public.sync_spaces
    where space_id = '20000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'active client cannot read another space'
);
select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'lifeos-attachments'
  ),
  1::bigint,
  'active client reads only storage objects for its own space'
);
select throws_ok(
  $$insert into public.sync_objects (
      space_id, object_id, revision, device_id, key_epoch, hlc, ciphertext, nonce
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      1,
      '30000000-0000-4000-8000-000000000001',
      1,
      '0-0-device',
      decode('01', 'hex'),
      decode('01', 'hex')
    )$$,
  '42501',
  'permission denied for table sync_objects',
  'active client has no direct sync table write access in SYNC-01'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values (
      'lifeos-attachments',
      '20000000-0000-4000-8000-000000000001/opaque-write/1'
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'nonopaque Storage path is denied'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*) from public.sync_spaces),
  0::bigint,
  'pending client reads no sync space rows'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'lifeos-attachments'),
  0::bigint,
  'pending client reads no storage rows'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is(
  (select count(*) from public.sync_spaces),
  0::bigint,
  'revoked client reads no sync space rows'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok(
  'select * from public.sync_spaces',
  '42501',
  'permission denied for table sync_spaces',
  'anonymous client cannot read sync tables'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'lifeos-attachments'),
  0::bigint,
  'anonymous client reads no LifeOS storage rows'
);
reset role;

do $$
declare
  line text;
  diagnostics text := '';
begin
  for line in select * from extensions.finish() loop
    if line like 'not ok%' or line like '#%' or line ~ '^1\.\.0([[:space:]]|$)' then
      diagnostics := diagnostics || E'\n' || line;
    end if;
  end loop;
  if diagnostics <> '' then
    raise exception 'pgTAP failed:%', diagnostics;
  end if;
end;
$$;
select 'All pgTAP assertions PASS' as result;
rollback;
