-- SYNC-08 phase 3: a format floor may rise only when active devices can read it.
-- Pending/recovered devices must pass the same floor before becoming active.

create function private.reset_device_data_format()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.public_key is distinct from old.public_key
    or (old.status = 'active' and new.status = 'pending') then
    new.supported_data_format := 1;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_device_data_format() from public, anon, authenticated;
create trigger reset_device_data_format_before_recovery
before update of public_key, status on public.devices
for each row execute function private.reset_device_data_format();

create function public.lifeos_sync_raise_data_format()
returns table(minimum_data_format smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  space_record public.sync_spaces;
begin
  select s.* into space_record
  from public.sync_spaces s where s.space_id = caller.space_id for update;
  if not found
    or space_record.key_rotation_status <> 'stable'
    or not exists (
      select 1 from public.devices d
      where d.device_id = caller.device_id and d.status = 'active'
        and d.supported_data_format = 2
    )
    or exists (
      select 1 from public.devices d
      where d.space_id = caller.space_id and d.status = 'active'
        and d.supported_data_format < 2
    ) then
    raise exception 'Data format promotion denied' using errcode = '42501';
  end if;
  update public.sync_spaces s set minimum_data_format = 2
  where s.space_id = caller.space_id;
  return query select 2::smallint;
end;
$$;
revoke all on function public.lifeos_sync_raise_data_format() from public, anon;
grant execute on function public.lifeos_sync_raise_data_format() to authenticated;

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
  target_space_id uuid;
  space_record public.sync_spaces;
  pending public.devices;
  envelope public.key_envelopes;
begin
  select d.space_id into target_space_id from public.devices d
  where d.device_id = p_device_id and d.supabase_auth_user_id = identity_id;
  if target_space_id is null then
    raise exception 'Pending pairing device is required' using errcode = '42501';
  end if;

  -- All activations and promotions lock the space before the device.
  select s.* into space_record from public.sync_spaces s
  where s.space_id = target_space_id for update;
  select d.* into pending from public.devices d
  where d.device_id = p_device_id and d.supabase_auth_user_id = identity_id for update;
  if not found or pending.space_id <> space_record.space_id
    or pending.status <> 'pending' or pending.join_method <> 'pairing'
    or pending.supported_data_format < space_record.minimum_data_format then
    raise exception 'Pending pairing device is required' using errcode = '42501';
  end if;
  select e.* into envelope from public.key_envelopes e
  where e.space_id = pending.space_id and e.key_epoch = space_record.current_key_epoch
    and e.recipient_device_id = pending.device_id and e.envelope_purpose = 'pairing';
  if not found or extensions.digest(envelope.encrypted_key || envelope.nonce, 'sha256')
    <> private.decode_hex(p_envelope_sha256_hex, 32) then
    raise exception 'Envelope acknowledgement is invalid' using errcode = '42501';
  end if;
  update public.devices set
    status = 'active', activated_at = statement_timestamp(),
    device_name_ciphertext = private.decode_hex(
      p_device_name_ciphertext_hex, length(p_device_name_ciphertext_hex) / 2
    ),
    device_name_nonce = private.decode_hex(p_device_name_nonce_hex, 24),
    device_name_key_epoch = envelope.key_epoch
  where devices.device_id = p_device_id;
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
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  anonymous_identity boolean := private.is_anonymous_sync_identity();
  target_space_id uuid;
  pending public.devices;
  space_record public.sync_spaces;
begin
  select d.space_id into target_space_id
  from public.devices d
  join public.sync_spaces s on s.space_id = d.space_id
  where d.device_id = p_device_id
    and (
      (s.owner_user_id is not null and not anonymous_identity and session_id is not null
        and s.owner_user_id = identity_id and d.account_user_id = identity_id
        and d.auth_session_id = session_id)
      or
      (s.owner_user_id is null and anonymous_identity
        and d.account_user_id is null and d.auth_session_id is null
        and d.supabase_auth_user_id = identity_id)
    );
  if target_space_id is null then
    raise exception 'Pending recovery device is required' using errcode = '42501';
  end if;

  select s.* into space_record from public.sync_spaces s
  where s.space_id = target_space_id for update;
  select d.* into pending from public.devices d
  where d.device_id = p_device_id and d.space_id = target_space_id
    and d.status = 'pending' and d.join_method = 'recovery'
    and (
      (space_record.owner_user_id is not null and not anonymous_identity
        and session_id is not null and space_record.owner_user_id = identity_id
        and d.account_user_id = identity_id and d.auth_session_id = session_id)
      or
      (space_record.owner_user_id is null and anonymous_identity
        and d.account_user_id is null and d.auth_session_id is null
        and d.supabase_auth_user_id = identity_id)
    )
  for update;
  if not found or pending.supported_data_format < space_record.minimum_data_format then
    raise exception 'Pending recovery device is required' using errcode = '42501';
  end if;
  if extensions.digest(private.decode_hex(p_auth_proof_hex, 32), 'sha256')
      <> space_record.recovery_auth_verifier
    or extensions.digest(
      space_record.recovery_envelope_ciphertext || space_record.recovery_envelope_nonce,
      'sha256'
    ) <> private.decode_hex(p_recovery_envelope_sha256_hex, 32) then
    raise exception 'Recovery completion failed' using errcode = '42501';
  end if;

  update public.devices
  set status = 'active',
      activated_at = statement_timestamp(),
      device_name_ciphertext = private.decode_hex(
        p_device_name_ciphertext_hex, length(p_device_name_ciphertext_hex) / 2
      ),
      device_name_nonce = private.decode_hex(p_device_name_nonce_hex, 24),
      device_name_key_epoch = space_record.current_key_epoch
  where devices.device_id = p_device_id;
end;
$$;
