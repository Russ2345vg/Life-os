-- SYNC-05: immutable encrypted blobs. Existing private buckets and active membership reused.
-- No UPDATE/DELETE policy: current objects, tombstones and snapshots retain historical versions.
create policy lifeos_sync_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id in ('lifeos-attachments', 'lifeos-snapshots')
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[1-9][0-9]*$'
  and private.is_active_sync_device(private.storage_object_space_id(name))
);
