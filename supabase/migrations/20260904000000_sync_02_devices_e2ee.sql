create extension if not exists pgcrypto with schema extensions;

alter table public.sync_spaces
  add column recovery_protocol_version smallint not null default 1,
  add column key_rotation_status text not null default 'stable',
  add column rotation_started_at timestamptz,
  add column rotation_started_by_device_id uuid,
  add column rotation_revoked_device_id uuid,
  add column rotation_completed_at timestamptz;

alter table public.sync_spaces
  add constraint sync_spaces_recovery_protocol_check
    check (recovery_protocol_version = 1),
  add constraint sync_spaces_recovery_bundle_check
    check (
      (recovery_auth_verifier is null and recovery_envelope_ciphertext is null and recovery_envelope_nonce is null)
      or (
        recovery_auth_verifier is not null
        and recovery_envelope_ciphertext is not null
        and recovery_envelope_nonce is not null
        and octet_length(recovery_auth_verifier) = 32
        and octet_length(recovery_envelope_ciphertext) >= 16
        and octet_length(recovery_envelope_nonce) = 24
      )
    ),
  add constraint sync_spaces_rotation_state_check
    check (
      (key_rotation_status = 'stable' and rotation_started_at is null and rotation_started_by_device_id is null and rotation_revoked_device_id is null)
      or
      (key_rotation_status = 'pending' and rotation_started_at is not null and rotation_started_by_device_id is not null and rotation_revoked_device_id is not null)
    ),
  add constraint sync_spaces_rotation_status_check
    check (key_rotation_status in ('stable', 'pending'));

create unique index sync_spaces_recovery_verifier_unique_idx
  on public.sync_spaces(recovery_auth_verifier)
  where recovery_auth_verifier is not null;

alter table public.devices
  add column join_method text not null default 'first',
  add column device_name_key_epoch integer;

alter table public.devices
  alter column device_name_ciphertext drop not null,
  alter column device_name_nonce drop not null;

update public.devices
set activated_at = created_at
where status in ('active', 'revoked') and activated_at is null;

update public.devices
set revoked_at = created_at
where status = 'revoked' and revoked_at is null;

update public.devices
set join_method = case when status = 'pending' then 'pairing' else 'first' end;

update public.devices
set device_name_key_epoch = 1
where device_name_ciphertext is not null;

alter table public.devices
  add constraint devices_space_device_unique unique (space_id, device_id),
  add constraint devices_public_key_size_check check (octet_length(public_key) = 32),
  add constraint devices_encrypted_name_check check (
    (status = 'pending' and device_name_ciphertext is null and device_name_nonce is null and device_name_key_epoch is null)
    or (
      status in ('active', 'revoked')
      and device_name_ciphertext is not null
      and device_name_nonce is not null
      and device_name_key_epoch is not null
      and octet_length(device_name_ciphertext) >= 16
      and octet_length(device_name_nonce) = 24
      and device_name_key_epoch >= 1
    )
  ),
  add constraint devices_status_timestamps_check check (
    (status = 'pending' and activated_at is null and revoked_at is null)
    or (status = 'active' and activated_at is not null and revoked_at is null)
    or (status = 'revoked' and activated_at is not null and revoked_at is not null)
  ),
  add constraint devices_join_method_check check (join_method in ('first', 'pairing', 'recovery'));

alter table public.sync_spaces
  add constraint sync_spaces_rotation_started_by_fk
    foreign key (space_id, rotation_started_by_device_id)
    references public.devices(space_id, device_id),
  add constraint sync_spaces_rotation_revoked_device_fk
    foreign key (space_id, rotation_revoked_device_id)
    references public.devices(space_id, device_id);

alter table public.pairing_invites
  add column claimed_by_device uuid,
  add constraint pairing_invites_secret_hash_size_check check (octet_length(secret_hash) = 32),
  add constraint pairing_invites_secret_hash_unique unique (secret_hash),
  add constraint pairing_invites_terminal_state_check check (not (used_at is not null and cancelled_at is not null)),
  add constraint pairing_invites_claim_state_check check ((used_at is null) = (claimed_by_device is null)),
  add constraint pairing_invites_creator_space_fk
    foreign key (space_id, created_by_device)
    references public.devices(space_id, device_id),
  add constraint pairing_invites_claimed_space_fk
    foreign key (space_id, claimed_by_device)
    references public.devices(space_id, device_id);

alter table public.key_envelopes
  add column protocol_version smallint not null default 1,
  add column envelope_purpose text not null default 'pairing',
  add constraint key_envelopes_protocol_check check (protocol_version = 1),
  add constraint key_envelopes_purpose_check check (envelope_purpose in ('pairing', 'rotation')),
  add constraint key_envelopes_ciphertext_check check (octet_length(encrypted_key) >= 16),
  add constraint key_envelopes_nonce_check check (octet_length(nonce) = 24),
  add constraint key_envelopes_recipient_space_fk
    foreign key (space_id, recipient_device_id)
    references public.devices(space_id, device_id),
  add constraint key_envelopes_sender_space_fk
    foreign key (space_id, sender_device_id)
    references public.devices(space_id, device_id);

alter table public.sync_events
  add constraint sync_events_device_space_fk
    foreign key (space_id, device_id)
    references public.devices(space_id, device_id);

alter table public.sync_objects
  add constraint sync_objects_device_space_fk
    foreign key (space_id, device_id)
    references public.devices(space_id, device_id);

alter table public.device_cursors
  add constraint device_cursors_device_space_fk
    foreign key (space_id, device_id)
    references public.devices(space_id, device_id);

create or replace function private.is_anonymous_sync_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;

create or replace function private.is_active_sync_device(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_anonymous_sync_identity()
    and exists (
      select 1
      from public.devices device_record
      where device_record.space_id = target_space_id
        and device_record.supabase_auth_user_id = (select auth.uid())
        and device_record.status = 'active'
    );
$$;

create or replace function private.require_anonymous_sync_identity()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not private.is_anonymous_sync_identity() then
    raise exception 'LifeOS technical identity is required' using errcode = '42501';
  end if;
  return current_user_id;
end;
$$;

create or replace function private.decode_hex(input_value text, expected_bytes integer)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  decoded bytea;
begin
  if input_value is null or input_value !~ '^[0-9a-f]+$' or length(input_value) <> expected_bytes * 2 then
    raise exception 'Invalid encrypted field' using errcode = '22023';
  end if;
  decoded := decode(input_value, 'hex');
  return decoded;
end;
$$;

create or replace function private.current_active_device(target_space_id uuid default null)
returns public.devices
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
  result public.devices;
begin
  select device_record.* into result
  from public.devices device_record
  where device_record.supabase_auth_user_id = identity_id
    and device_record.status = 'active'
    and (target_space_id is null or device_record.space_id = target_space_id);
  if not found then
    raise exception 'Active LifeOS device is required' using errcode = '42501';
  end if;
  return result;
end;
$$;

create or replace function public.lifeos_sync_create_first_space(
  p_space_id uuid,
  p_device_id uuid,
  p_public_key_hex text,
  p_device_name_ciphertext_hex text,
  p_device_name_nonce_hex text,
  p_platform text,
  p_recovery_auth_verifier_hex text,
  p_recovery_envelope_ciphertext_hex text,
  p_recovery_envelope_nonce_hex text
)
returns table(space_id uuid, device_id uuid, current_key_epoch integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
begin
  if p_platform not in ('windows', 'android') then
    raise exception 'Unsupported platform' using errcode = '22023';
  end if;
  if exists (select 1 from public.devices d where d.supabase_auth_user_id = identity_id) then
    raise exception 'Technical identity already owns a device' using errcode = '23505';
  end if;
  insert into public.sync_spaces(
    space_id, current_key_epoch, recovery_auth_verifier,
    recovery_envelope_ciphertext, recovery_envelope_nonce
  ) values (
    p_space_id, 1, private.decode_hex(p_recovery_auth_verifier_hex, 32),
    private.decode_hex(p_recovery_envelope_ciphertext_hex, length(p_recovery_envelope_ciphertext_hex) / 2),
    private.decode_hex(p_recovery_envelope_nonce_hex, 24)
  );
  insert into public.devices(
    device_id, space_id, supabase_auth_user_id, public_key,
    device_name_ciphertext, device_name_nonce, device_name_key_epoch, platform, status,
    activated_at, join_method
  ) values (
    p_device_id, p_space_id, identity_id, private.decode_hex(p_public_key_hex, 32),
    private.decode_hex(p_device_name_ciphertext_hex, length(p_device_name_ciphertext_hex) / 2),
    private.decode_hex(p_device_name_nonce_hex, 24), 1, p_platform, 'active', statement_timestamp(), 'first'
  );
  return query select p_space_id, p_device_id, 1;
end;
$$;

create or replace function public.lifeos_sync_create_pairing_invite(p_secret_hash_hex text)
returns table(invite_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  created_id uuid := extensions.gen_random_uuid();
  created_expiry timestamptz := statement_timestamp() + interval '5 minutes';
begin
  insert into public.pairing_invites(
    invite_id, space_id, created_by_device, secret_hash, expires_at
  ) values (
    created_id, caller.space_id, caller.device_id,
    private.decode_hex(p_secret_hash_hex, 32), created_expiry
  );
  return query select created_id, created_expiry;
end;
$$;

create or replace function public.lifeos_sync_cancel_pairing_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  invitation public.pairing_invites;
begin
  select * into invitation from public.pairing_invites i
  where i.invite_id = p_invite_id for update;
  if not found or invitation.created_by_device <> caller.device_id
    or invitation.space_id <> caller.space_id or invitation.used_at is not null then
    raise exception 'Pairing invitation cannot be cancelled' using errcode = '42501';
  end if;
  update public.pairing_invites set cancelled_at = coalesce(cancelled_at, statement_timestamp())
  where pairing_invites.invite_id = p_invite_id;
end;
$$;

create or replace function public.lifeos_sync_claim_pairing_invite(
  p_invite_id uuid,
  p_secret_hex text,
  p_device_id uuid,
  p_public_key_hex text,
  p_platform text
)
returns table(space_id uuid, current_key_epoch integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
  invitation public.pairing_invites;
  existing public.devices;
  epoch integer;
begin
  if p_platform not in ('windows', 'android') then
    raise exception 'Unsupported platform' using errcode = '22023';
  end if;
  select * into invitation from public.pairing_invites i
  where i.invite_id = p_invite_id for update;
  if not found or invitation.cancelled_at is not null or invitation.expires_at <= statement_timestamp()
    or extensions.digest(private.decode_hex(p_secret_hex, 32), 'sha256') <> invitation.secret_hash then
    raise exception 'Pairing invitation is invalid' using errcode = '42501';
  end if;
  select * into existing from public.devices d
  where d.supabase_auth_user_id = identity_id;
  if found then
    if existing.device_id = p_device_id and existing.status = 'pending'
      and invitation.claimed_by_device = p_device_id then
      select s.current_key_epoch into epoch from public.sync_spaces s where s.space_id = existing.space_id;
      return query select existing.space_id, epoch, existing.status;
      return;
    end if;
    raise exception 'Technical identity already owns a device' using errcode = '23505';
  end if;
  if invitation.used_at is not null then
    raise exception 'Pairing invitation was already consumed' using errcode = '42501';
  end if;
  insert into public.devices(
    device_id, space_id, supabase_auth_user_id, public_key,
    device_name_ciphertext, device_name_nonce, platform, status, join_method
  ) values (
    p_device_id, invitation.space_id, identity_id,
    private.decode_hex(p_public_key_hex, 32), null, null, p_platform, 'pending', 'pairing'
  );
  update public.pairing_invites
  set used_at = statement_timestamp(), claimed_by_device = p_device_id
  where pairing_invites.invite_id = p_invite_id;
  select s.current_key_epoch into epoch from public.sync_spaces s where s.space_id = invitation.space_id;
  return query select invitation.space_id, epoch, 'pending'::text;
end;
$$;

create or replace function public.lifeos_sync_list_my_pending_pairing_devices()
returns table(device_id uuid, public_key bytea, platform text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  return query
  select d.device_id, d.public_key, d.platform, d.created_at
  from public.devices d
  join public.pairing_invites i on i.claimed_by_device = d.device_id and i.space_id = d.space_id
  where d.space_id = caller.space_id and d.status = 'pending'
    and d.join_method = 'pairing' and i.created_by_device = caller.device_id
  order by d.created_at;
end;
$$;

create or replace function public.lifeos_sync_publish_key_envelope(
  p_recipient_device_id uuid,
  p_key_epoch integer,
  p_purpose text,
  p_ciphertext_hex text,
  p_nonce_hex text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  recipient public.devices;
  space_record public.sync_spaces;
begin
  select * into space_record from public.sync_spaces s where s.space_id = caller.space_id for update;
  select * into recipient from public.devices d
  where d.device_id = p_recipient_device_id and d.space_id = caller.space_id for update;
  if not found or recipient.status = 'revoked' or p_key_epoch <> space_record.current_key_epoch then
    raise exception 'Envelope recipient or epoch is invalid' using errcode = '42501';
  end if;
  if p_purpose = 'pairing' then
    if recipient.status <> 'pending' or not exists (
      select 1 from public.pairing_invites i
      where i.claimed_by_device = recipient.device_id and i.created_by_device = caller.device_id
        and i.used_at is not null and i.cancelled_at is null
    ) then
      raise exception 'Pairing envelope relationship is invalid' using errcode = '42501';
    end if;
  elsif p_purpose = 'rotation' then
    if recipient.status <> 'active' or space_record.key_rotation_status <> 'pending'
      or space_record.rotation_started_by_device_id <> caller.device_id then
      raise exception 'Rotation envelope relationship is invalid' using errcode = '42501';
    end if;
  else
    raise exception 'Envelope purpose is invalid' using errcode = '22023';
  end if;
  insert into public.key_envelopes(
    space_id, key_epoch, recipient_device_id, sender_device_id,
    encrypted_key, nonce, protocol_version, envelope_purpose
  ) values (
    caller.space_id, p_key_epoch, recipient.device_id, caller.device_id,
    private.decode_hex(p_ciphertext_hex, length(p_ciphertext_hex) / 2),
    private.decode_hex(p_nonce_hex, 24), 1, p_purpose
  ) on conflict (space_id, key_epoch, recipient_device_id) do update
  set sender_device_id = excluded.sender_device_id,
      encrypted_key = excluded.encrypted_key,
      nonce = excluded.nonce,
      protocol_version = excluded.protocol_version,
      envelope_purpose = excluded.envelope_purpose,
      created_at = statement_timestamp();
end;
$$;

create or replace function public.lifeos_sync_fetch_my_pending_envelope()
returns table(
  space_id uuid, key_epoch integer, recipient_device_id uuid, sender_device_id uuid,
  sender_public_key bytea, encrypted_key bytea, nonce bytea, envelope_purpose text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
  pending public.devices;
begin
  select * into pending from public.devices d
  where d.supabase_auth_user_id = identity_id and d.status = 'pending';
  if not found then raise exception 'Pending device is required' using errcode = '42501'; end if;
  return query
  select e.space_id, e.key_epoch, e.recipient_device_id, e.sender_device_id,
         sender.public_key, e.encrypted_key, e.nonce, e.envelope_purpose
  from public.key_envelopes e
  join public.devices sender on sender.device_id = e.sender_device_id and sender.space_id = e.space_id
  join public.sync_spaces s on s.space_id = e.space_id
  where e.recipient_device_id = pending.device_id and e.space_id = pending.space_id
    and e.key_epoch = s.current_key_epoch and e.envelope_purpose = 'pairing'
    and sender.status = 'active';
end;
$$;

create or replace function public.lifeos_sync_fetch_my_rotation_envelope(p_after_key_epoch integer)
returns table(
  space_id uuid, current_key_epoch integer, recipient_device_id uuid,
  sender_device_id uuid, sender_public_key bytea, encrypted_key bytea, nonce bytea
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  if p_after_key_epoch < 1 then
    raise exception 'Invalid local key epoch' using errcode = '22023';
  end if;
  return query
  select e.space_id, s.current_key_epoch, e.recipient_device_id, e.sender_device_id,
         sender.public_key, e.encrypted_key, e.nonce
  from public.sync_spaces s
  join public.key_envelopes e on e.space_id = s.space_id
    and e.key_epoch = s.current_key_epoch
    and e.recipient_device_id = caller.device_id
    and e.envelope_purpose = 'rotation'
  join public.devices sender on sender.space_id = e.space_id
    and sender.device_id = e.sender_device_id and sender.status = 'active'
  where s.space_id = caller.space_id and s.current_key_epoch > p_after_key_epoch;
end;
$$;

create or replace function public.lifeos_sync_acknowledge_pairing(
  p_device_id uuid,
  p_envelope_sha256_hex text,
  p_device_name_ciphertext_hex text,
  p_device_name_nonce_hex text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
  pending public.devices;
  envelope public.key_envelopes;
begin
  select * into pending from public.devices d
  where d.device_id = p_device_id and d.supabase_auth_user_id = identity_id for update;
  if not found or pending.status <> 'pending' or pending.join_method <> 'pairing' then
    raise exception 'Pending pairing device is required' using errcode = '42501';
  end if;
  select e.* into envelope from public.key_envelopes e
  join public.sync_spaces s on s.space_id = e.space_id and s.current_key_epoch = e.key_epoch
  where e.space_id = pending.space_id and e.recipient_device_id = pending.device_id
    and e.envelope_purpose = 'pairing';
  if not found or extensions.digest(envelope.encrypted_key || envelope.nonce, 'sha256')
    <> private.decode_hex(p_envelope_sha256_hex, 32) then
    raise exception 'Envelope acknowledgement is invalid' using errcode = '42501';
  end if;
  update public.devices set
    status = 'active', activated_at = statement_timestamp(),
    device_name_ciphertext = private.decode_hex(p_device_name_ciphertext_hex, length(p_device_name_ciphertext_hex) / 2),
    device_name_nonce = private.decode_hex(p_device_name_nonce_hex, 24),
    device_name_key_epoch = envelope.key_epoch
  where devices.device_id = p_device_id;
end;
$$;

create or replace function public.lifeos_sync_begin_recovery(
  p_space_id uuid,
  p_auth_proof_hex text,
  p_device_id uuid,
  p_public_key_hex text,
  p_platform text
)
returns table(
  current_key_epoch integer, recovery_protocol_version smallint,
  recovery_envelope_ciphertext bytea, recovery_envelope_nonce bytea
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
  space_record public.sync_spaces;
begin
  select * into space_record from public.sync_spaces s where s.space_id = p_space_id for update;
  if not found or space_record.key_rotation_status <> 'stable'
    or space_record.recovery_auth_verifier is null
    or space_record.recovery_envelope_ciphertext is null
    or space_record.recovery_envelope_nonce is null
    or extensions.digest(private.decode_hex(p_auth_proof_hex, 32), 'sha256') <> space_record.recovery_auth_verifier
    or p_platform not in ('windows', 'android')
    or exists (select 1 from public.devices d where d.supabase_auth_user_id = identity_id) then
    raise exception 'Recovery authorization failed' using errcode = '42501';
  end if;
  insert into public.devices(
    device_id, space_id, supabase_auth_user_id, public_key,
    device_name_ciphertext, device_name_nonce, platform, status, join_method
  ) values (
    p_device_id, p_space_id, identity_id, private.decode_hex(p_public_key_hex, 32),
    null, null, p_platform, 'pending', 'recovery'
  );
  return query select space_record.current_key_epoch, space_record.recovery_protocol_version,
    space_record.recovery_envelope_ciphertext, space_record.recovery_envelope_nonce;
end;
$$;

create or replace function public.lifeos_sync_complete_recovery(
  p_device_id uuid,
  p_auth_proof_hex text,
  p_recovery_envelope_sha256_hex text,
  p_device_name_ciphertext_hex text,
  p_device_name_nonce_hex text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := private.require_anonymous_sync_identity();
  pending public.devices;
  space_record public.sync_spaces;
begin
  select * into pending from public.devices d
  where d.device_id = p_device_id and d.supabase_auth_user_id = identity_id for update;
  if not found or pending.status <> 'pending' or pending.join_method <> 'recovery' then
    raise exception 'Pending recovery device is required' using errcode = '42501';
  end if;
  select * into space_record from public.sync_spaces s where s.space_id = pending.space_id for update;
  if extensions.digest(private.decode_hex(p_auth_proof_hex, 32), 'sha256') <> space_record.recovery_auth_verifier
    or extensions.digest(space_record.recovery_envelope_ciphertext || space_record.recovery_envelope_nonce, 'sha256')
      <> private.decode_hex(p_recovery_envelope_sha256_hex, 32) then
    raise exception 'Recovery completion failed' using errcode = '42501';
  end if;
  update public.devices set
    status = 'active', activated_at = statement_timestamp(),
    device_name_ciphertext = private.decode_hex(p_device_name_ciphertext_hex, length(p_device_name_ciphertext_hex) / 2),
    device_name_nonce = private.decode_hex(p_device_name_nonce_hex, 24),
    device_name_key_epoch = space_record.current_key_epoch
  where devices.device_id = p_device_id;
end;
$$;

create or replace function public.lifeos_sync_list_devices()
returns table(
  device_id uuid, device_name_ciphertext bytea, device_name_nonce bytea, device_name_key_epoch integer, platform text,
  status text, public_key bytea, created_at timestamptz, activated_at timestamptz,
  last_seen_at timestamptz, revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  return query select d.device_id, d.device_name_ciphertext, d.device_name_nonce, d.device_name_key_epoch,
    d.platform, d.status, d.public_key, d.created_at, d.activated_at, d.last_seen_at, d.revoked_at
  from public.devices d where d.space_id = caller.space_id order by d.created_at;
end;
$$;

create or replace function public.lifeos_sync_update_my_device_name(
  p_ciphertext_hex text,
  p_nonce_hex text,
  p_key_epoch integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  if p_key_epoch <> (select s.current_key_epoch from public.sync_spaces s where s.space_id = caller.space_id) then
    raise exception 'Device name key epoch is stale' using errcode = '40001';
  end if;
  update public.devices set
    device_name_ciphertext = private.decode_hex(p_ciphertext_hex, length(p_ciphertext_hex) / 2),
    device_name_nonce = private.decode_hex(p_nonce_hex, 24),
    device_name_key_epoch = p_key_epoch
  where devices.device_id = caller.device_id;
end;
$$;

create or replace function public.lifeos_sync_revoke_device_and_advance_epoch(
  p_target_device_id uuid,
  p_expected_epoch integer
)
returns table(new_key_epoch integer, device_id uuid, public_key bytea)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  space_record public.sync_spaces;
  target public.devices;
begin
  select * into space_record from public.sync_spaces s where s.space_id = caller.space_id for update;
  select * into target from public.devices d
  where d.space_id = caller.space_id and d.device_id = p_target_device_id for update;
  if space_record.key_rotation_status = 'pending'
    and space_record.rotation_started_by_device_id = caller.device_id
    and space_record.rotation_revoked_device_id = p_target_device_id
    and space_record.current_key_epoch = p_expected_epoch + 1
    and target.status = 'revoked' then
    return query select space_record.current_key_epoch, d.device_id, d.public_key
      from public.devices d where d.space_id = caller.space_id and d.status = 'active';
    return;
  end if;
  if not found or target.status <> 'active' or target.device_id = caller.device_id
    or space_record.key_rotation_status <> 'stable' or space_record.current_key_epoch <> p_expected_epoch then
    raise exception 'Device cannot be revoked' using errcode = '42501';
  end if;
  update public.devices set status = 'revoked', revoked_at = statement_timestamp()
  where devices.device_id = p_target_device_id;
  update public.sync_spaces set
    current_key_epoch = current_key_epoch + 1,
    key_rotation_status = 'pending', rotation_started_at = statement_timestamp(),
    rotation_started_by_device_id = caller.device_id,
    rotation_revoked_device_id = p_target_device_id,
    rotation_completed_at = null
  where sync_spaces.space_id = caller.space_id
  returning sync_spaces.current_key_epoch into space_record.current_key_epoch;
  return query select space_record.current_key_epoch, d.device_id, d.public_key
    from public.devices d where d.space_id = caller.space_id and d.status = 'active';
end;
$$;

create or replace function public.lifeos_sync_finalize_key_epoch_rotation(
  p_expected_epoch integer,
  p_recovery_envelope_ciphertext_hex text,
  p_recovery_envelope_nonce_hex text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  space_record public.sync_spaces;
  active_count integer;
  envelope_count integer;
begin
  select * into space_record from public.sync_spaces s where s.space_id = caller.space_id for update;
  if space_record.key_rotation_status <> 'pending'
    or space_record.rotation_started_by_device_id <> caller.device_id
    or space_record.current_key_epoch <> p_expected_epoch then
    raise exception 'Rotation cannot be finalized' using errcode = '42501';
  end if;
  select count(*) into active_count from public.devices d
  where d.space_id = caller.space_id and d.status = 'active';
  select count(*) into envelope_count from public.key_envelopes e
  join public.devices d on d.space_id = e.space_id and d.device_id = e.recipient_device_id
  where e.space_id = caller.space_id and e.key_epoch = p_expected_epoch
    and e.envelope_purpose = 'rotation' and d.status = 'active';
  if envelope_count <> active_count or exists (
    select 1 from public.key_envelopes e
    where e.space_id = caller.space_id and e.key_epoch = p_expected_epoch
      and e.recipient_device_id = space_record.rotation_revoked_device_id
  ) then
    raise exception 'Rotation envelopes are incomplete' using errcode = '23514';
  end if;
  update public.sync_spaces set
    recovery_envelope_ciphertext = private.decode_hex(
      p_recovery_envelope_ciphertext_hex, length(p_recovery_envelope_ciphertext_hex) / 2
    ),
    recovery_envelope_nonce = private.decode_hex(p_recovery_envelope_nonce_hex, 24),
    key_rotation_status = 'stable', rotation_completed_at = statement_timestamp(),
    rotation_started_at = null, rotation_started_by_device_id = null, rotation_revoked_device_id = null
  where sync_spaces.space_id = caller.space_id;
end;
$$;

drop policy if exists lifeos_sync_pending_device_self on public.devices;
create policy lifeos_sync_pending_device_self
on public.devices for select to authenticated
using (
  private.is_anonymous_sync_identity()
  and supabase_auth_user_id = (select auth.uid())
  and status = 'pending'
);

revoke all on function private.is_anonymous_sync_identity() from public, anon;
revoke all on function private.require_anonymous_sync_identity() from public, anon, authenticated;
revoke all on function private.decode_hex(text, integer) from public, anon, authenticated;
revoke all on function private.current_active_device(uuid) from public, anon, authenticated;
grant execute on function private.is_anonymous_sync_identity() to authenticated;

revoke execute on function public.lifeos_sync_create_first_space(uuid, uuid, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.lifeos_sync_create_pairing_invite(text) from public, anon;
revoke execute on function public.lifeos_sync_cancel_pairing_invite(uuid) from public, anon;
revoke execute on function public.lifeos_sync_claim_pairing_invite(uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.lifeos_sync_list_my_pending_pairing_devices() from public, anon;
revoke execute on function public.lifeos_sync_publish_key_envelope(uuid, integer, text, text, text) from public, anon;
revoke execute on function public.lifeos_sync_fetch_my_pending_envelope() from public, anon;
revoke execute on function public.lifeos_sync_fetch_my_rotation_envelope(integer) from public, anon;
revoke execute on function public.lifeos_sync_acknowledge_pairing(uuid, text, text, text) from public, anon;
revoke execute on function public.lifeos_sync_begin_recovery(uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.lifeos_sync_complete_recovery(uuid, text, text, text, text) from public, anon;
revoke execute on function public.lifeos_sync_list_devices() from public, anon;
revoke execute on function public.lifeos_sync_update_my_device_name(text, text, integer) from public, anon;
revoke execute on function public.lifeos_sync_revoke_device_and_advance_epoch(uuid, integer) from public, anon;
revoke execute on function public.lifeos_sync_finalize_key_epoch_rotation(integer, text, text) from public, anon;

grant execute on function public.lifeos_sync_create_first_space(uuid, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.lifeos_sync_create_pairing_invite(text) to authenticated;
grant execute on function public.lifeos_sync_cancel_pairing_invite(uuid) to authenticated;
grant execute on function public.lifeos_sync_claim_pairing_invite(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.lifeos_sync_list_my_pending_pairing_devices() to authenticated;
grant execute on function public.lifeos_sync_publish_key_envelope(uuid, integer, text, text, text) to authenticated;
grant execute on function public.lifeos_sync_fetch_my_pending_envelope() to authenticated;
grant execute on function public.lifeos_sync_fetch_my_rotation_envelope(integer) to authenticated;
grant execute on function public.lifeos_sync_acknowledge_pairing(uuid, text, text, text) to authenticated;
grant execute on function public.lifeos_sync_begin_recovery(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.lifeos_sync_complete_recovery(uuid, text, text, text, text) to authenticated;
grant execute on function public.lifeos_sync_list_devices() to authenticated;
grant execute on function public.lifeos_sync_update_my_device_name(text, text, integer) to authenticated;
grant execute on function public.lifeos_sync_revoke_device_and_advance_epoch(uuid, integer) to authenticated;
grant execute on function public.lifeos_sync_finalize_key_epoch_rotation(integer, text, text) to authenticated;
