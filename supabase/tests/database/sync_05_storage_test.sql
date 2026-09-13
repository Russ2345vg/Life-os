-- Synthetic authorization contract; transaction always rolls back, no Storage object manipulation.
begin;
do $$
begin
  if (select count(*) from storage.buckets where id in ('lifeos-attachments','lifeos-snapshots') and not public) <> 2 then
    raise exception 'SYNC05 buckets must remain private';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='lifeos_sync_storage_insert' and cmd='INSERT' and with_check like '%is_active_sync_device%') then
    raise exception 'SYNC05 active-device insert policy missing';
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and policyname like 'lifeos_sync_storage_%' and cmd in ('UPDATE','DELETE','ALL')) then
    raise exception 'SYNC05 blobs must be immutable and retained';
  end if;
end $$;
insert into auth.users(id,aud,role) values
('15000000-0000-4000-8000-000000000001','authenticated','authenticated'),
('15000000-0000-4000-8000-000000000002','authenticated','authenticated'),
('15000000-0000-4000-8000-000000000003','authenticated','authenticated');
insert into public.sync_spaces(space_id) values ('25000000-0000-4000-8000-000000000001');
insert into public.devices(device_id,space_id,supabase_auth_user_id,public_key,platform,status,activated_at,revoked_at,device_name_ciphertext,device_name_nonce,device_name_key_epoch) values
('35000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',decode(repeat('01',32),'hex'),'windows','active',now(),null,decode(repeat('11',16),'hex'),decode(repeat('12',24),'hex'),1),
('35000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002',decode(repeat('02',32),'hex'),'android','pending',null,null,null,null,null),
('35000000-0000-4000-8000-000000000003','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000003',decode(repeat('03',32),'hex'),'android','revoked',now(),now(),decode(repeat('31',16),'hex'),decode(repeat('32',24),'hex'),1);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true}',true);
do $$
declare
  policy text;
  allowed boolean;
  actor text;
begin
  select with_check into policy from pg_policies where schemaname='storage' and policyname='lifeos_sync_storage_insert';
  foreach actor in array array['15000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000003'] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    execute 'select ' || policy || ' from (select ''lifeos-attachments''::text as bucket_id, ''25000000-0000-4000-8000-000000000001/45000000-0000-4000-8000-000000000001/1''::text as name) objects' into allowed;
    if coalesce(allowed,false) <> (actor='15000000-0000-4000-8000-000000000001') then raise exception 'SYNC05 membership policy failure'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000001',true);
  execute 'select ' || policy || ' from (select ''lifeos-attachments''::text as bucket_id, ''25000000-0000-4000-8000-000000000002/45000000-0000-4000-8000-000000000001/1''::text as name) objects' into allowed;
  if coalesce(allowed,false) then raise exception 'SYNC05 foreign policy failure'; end if;
  execute 'select ' || policy || ' from (select ''lifeos-attachments''::text as bucket_id, ''25000000-0000-4000-8000-000000000001/secret-filename.jpg/1''::text as name) objects' into allowed;
  if coalesce(allowed,false) then raise exception 'SYNC05 plaintext path accepted'; end if;
end $$;
select 'SYNC05 private / active / pending / revoked / foreign / opaque paths PASS' as result;
rollback;
