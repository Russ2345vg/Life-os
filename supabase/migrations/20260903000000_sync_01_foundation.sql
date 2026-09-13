create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.sync_spaces (
  space_id uuid primary key,
  current_key_epoch integer not null default 1 check (current_key_epoch > 0),
  recovery_auth_verifier bytea,
  recovery_envelope_ciphertext bytea,
  recovery_envelope_nonce bytea,
  created_at timestamptz not null default statement_timestamp()
);

create table public.devices (
  device_id uuid primary key,
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  supabase_auth_user_id uuid not null references auth.users(id) on delete cascade,
  public_key bytea not null,
  device_name_ciphertext bytea not null,
  device_name_nonce bytea not null,
  platform text not null check (platform in ('windows', 'android')),
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default statement_timestamp(),
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  unique (supabase_auth_user_id)
);

create index devices_space_status_idx on public.devices(space_id, status);

create table public.pairing_invites (
  invite_id uuid primary key,
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  created_by_device uuid not null references public.devices(device_id) on delete cascade,
  secret_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check (expires_at > created_at)
);

create index pairing_invites_space_expiry_idx
  on public.pairing_invites(space_id, expires_at);

create table public.key_envelopes (
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  key_epoch integer not null check (key_epoch > 0),
  recipient_device_id uuid not null references public.devices(device_id) on delete cascade,
  sender_device_id uuid not null references public.devices(device_id) on delete restrict,
  encrypted_key bytea not null,
  nonce bytea not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (space_id, key_epoch, recipient_device_id)
);

create table public.sync_events (
  sequence bigint generated always as identity primary key,
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  event_id uuid not null unique,
  object_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  revision bigint not null check (revision > base_revision),
  device_id uuid not null references public.devices(device_id) on delete restrict,
  key_epoch integer not null check (key_epoch > 0),
  hlc text not null,
  ciphertext bytea not null,
  nonce bytea not null,
  created_at timestamptz not null default statement_timestamp()
);

create index sync_events_space_sequence_idx on public.sync_events(space_id, sequence);
create index sync_events_space_object_idx on public.sync_events(space_id, object_id);

create table public.sync_objects (
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  object_id uuid not null,
  revision bigint not null check (revision > 0),
  device_id uuid not null references public.devices(device_id) on delete restrict,
  key_epoch integer not null check (key_epoch > 0),
  hlc text not null,
  ciphertext bytea not null,
  nonce bytea not null,
  is_tombstone boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (space_id, object_id)
);

create table public.device_cursors (
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  device_id uuid not null references public.devices(device_id) on delete cascade,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (space_id, device_id)
);

create table public.attachment_metadata (
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  attachment_id uuid not null,
  parent_object_id uuid not null,
  key_epoch integer not null check (key_epoch > 0),
  storage_path text not null,
  cipher_size bigint not null check (cipher_size > 0),
  cipher_sha256 text not null check (cipher_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_metadata bytea not null,
  nonce bytea not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (space_id, attachment_id),
  unique (storage_path)
);

create index attachment_metadata_parent_idx
  on public.attachment_metadata(space_id, parent_object_id);

create table public.snapshot_metadata (
  space_id uuid not null references public.sync_spaces(space_id) on delete cascade,
  snapshot_id uuid not null,
  key_epoch integer not null check (key_epoch > 0),
  storage_path text not null,
  cipher_sha256 text not null check (cipher_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_metadata bytea not null,
  nonce bytea not null,
  kind text not null check (kind in ('daily', 'weekly', 'manual', 'pre_migration')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (space_id, snapshot_id),
  unique (storage_path)
);

create or replace function private.is_active_sync_device(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.devices device_record
    where device_record.space_id = target_space_id
      and device_record.supabase_auth_user_id = (select auth.uid())
      and device_record.status = 'active'
  );
$$;

create or replace function private.storage_object_space_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate text := split_part(object_name, '/', 1);
begin
  if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return candidate::uuid;
  end if;
  return null;
end;
$$;

revoke all on function private.is_active_sync_device(uuid) from public, anon;
revoke all on function private.storage_object_space_id(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_sync_device(uuid) to authenticated;
grant execute on function private.storage_object_space_id(text) to authenticated;

alter table public.sync_spaces enable row level security;
alter table public.devices enable row level security;
alter table public.pairing_invites enable row level security;
alter table public.key_envelopes enable row level security;
alter table public.sync_events enable row level security;
alter table public.sync_objects enable row level security;
alter table public.device_cursors enable row level security;
alter table public.attachment_metadata enable row level security;
alter table public.snapshot_metadata enable row level security;

alter table public.sync_spaces force row level security;
alter table public.devices force row level security;
alter table public.pairing_invites force row level security;
alter table public.key_envelopes force row level security;
alter table public.sync_events force row level security;
alter table public.sync_objects force row level security;
alter table public.device_cursors force row level security;
alter table public.attachment_metadata force row level security;
alter table public.snapshot_metadata force row level security;

revoke all on table public.sync_spaces from anon, authenticated;
revoke all on table public.devices from anon, authenticated;
revoke all on table public.pairing_invites from anon, authenticated;
revoke all on table public.key_envelopes from anon, authenticated;
revoke all on table public.sync_events from anon, authenticated;
revoke all on table public.sync_objects from anon, authenticated;
revoke all on table public.device_cursors from anon, authenticated;
revoke all on table public.attachment_metadata from anon, authenticated;
revoke all on table public.snapshot_metadata from anon, authenticated;

grant select on table public.sync_spaces to authenticated;
grant select on table public.devices to authenticated;
grant select on table public.key_envelopes to authenticated;
grant select on table public.sync_events to authenticated;
grant select on table public.sync_objects to authenticated;
grant select on table public.device_cursors to authenticated;
grant select on table public.attachment_metadata to authenticated;
grant select on table public.snapshot_metadata to authenticated;

create policy lifeos_sync_active_device_sync_spaces
on public.sync_spaces for select to authenticated
using (private.is_active_sync_device(space_id));

create policy lifeos_sync_active_device_devices
on public.devices for select to authenticated
using (private.is_active_sync_device(space_id));

create policy lifeos_sync_active_device_key_envelopes
on public.key_envelopes for select to authenticated
using (
  private.is_active_sync_device(space_id)
  and recipient_device_id = (
    select device_record.device_id
    from public.devices device_record
    where device_record.space_id = key_envelopes.space_id
      and device_record.supabase_auth_user_id = (select auth.uid())
      and device_record.status = 'active'
  )
);

create policy lifeos_sync_active_device_sync_events
on public.sync_events for select to authenticated
using (private.is_active_sync_device(space_id));

create policy lifeos_sync_active_device_sync_objects
on public.sync_objects for select to authenticated
using (private.is_active_sync_device(space_id));

create policy lifeos_sync_active_device_device_cursors
on public.device_cursors for select to authenticated
using (private.is_active_sync_device(space_id));

create policy lifeos_sync_active_device_attachment_metadata
on public.attachment_metadata for select to authenticated
using (private.is_active_sync_device(space_id));

create policy lifeos_sync_active_device_snapshot_metadata
on public.snapshot_metadata for select to authenticated
using (private.is_active_sync_device(space_id));

insert into storage.buckets (id, name, public)
values
  ('lifeos-attachments', 'lifeos-attachments', false),
  ('lifeos-snapshots', 'lifeos-snapshots', false)
on conflict (id) do update set public = false;

create policy lifeos_sync_storage_select
on storage.objects for select to authenticated
using (
  bucket_id in ('lifeos-attachments', 'lifeos-snapshots')
  and private.is_active_sync_device(private.storage_object_space_id(name))
);
