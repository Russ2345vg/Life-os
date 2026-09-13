-- Read-only acceptance of stored envelopes and paths. No payloads/secrets are returned.
begin;
set transaction read only;
do $$
begin
  if exists (select 1 from public.sync_events where octet_length(ciphertext) < 16
    or octet_length(nonce) <> 24) then raise exception 'Invalid encrypted event envelope'; end if;
  if exists (select 1 from public.sync_objects where octet_length(ciphertext) < 16
    or octet_length(nonce) <> 24) then raise exception 'Invalid encrypted object envelope'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name in ('sync_events','sync_objects','attachment_metadata','snapshot_metadata',
      'devices','sync_spaces','key_envelopes','pairing_invites')
    and column_name in ('title','content','body','journal_text','original_filename',
      'private_key','space_key','recovery_root','pairing_secret','service_role_key'))
    then raise exception 'Forbidden plaintext or secret column'; end if;
  if (select count(*) from storage.buckets where id in ('lifeos-attachments','lifeos-snapshots')
    and public = false) <> 2 then raise exception 'Private buckets missing'; end if;
  if exists (select 1 from storage.objects where bucket_id in ('lifeos-attachments','lifeos-snapshots')
    and name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[1-9][0-9]*$')
    then raise exception 'Nonopaque Storage path'; end if;
end;
$$;
select 'Ciphertext envelope / schema / private bucket / opaque path assertions PASS' as result,
  (select count(*) from public.sync_events) as encrypted_events,
  (select count(*) from public.sync_objects) as encrypted_objects,
  (select count(*) from storage.objects where bucket_id = 'lifeos-attachments') as attachment_blobs,
  (select count(*) from storage.objects where bucket_id = 'lifeos-snapshots') as snapshot_blobs;
rollback;
