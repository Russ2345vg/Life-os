-- SYNC-07.2: let one account session retry recovery for its exact device.
-- This repairs clients that completed trust before initial convergence failed.

create or replace function public.lifeos_sync_begin_recovery(
  p_space_id uuid,
  p_auth_proof_hex text,
  p_device_id uuid,
  p_public_key_hex text,
  p_platform text
)
returns table(
  current_key_epoch integer,
  recovery_protocol_version smallint,
  recovery_envelope_ciphertext bytea,
  recovery_envelope_nonce bytea
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  anonymous_identity boolean := private.is_anonymous_sync_identity();
  space_record public.sync_spaces;
  retry_device public.devices;
begin
  select * into space_record
  from public.sync_spaces s
  where s.space_id = p_space_id
  for update;

  if not found
    or identity_id is null
    or space_record.key_rotation_status <> 'stable'
    or space_record.recovery_auth_verifier is null
    or space_record.recovery_envelope_ciphertext is null
    or space_record.recovery_envelope_nonce is null
    or extensions.digest(private.decode_hex(p_auth_proof_hex, 32), 'sha256')
      <> space_record.recovery_auth_verifier
    or p_platform not in ('windows', 'android') then
    raise exception 'Recovery authorization failed' using errcode = '42501';
  end if;

  if anonymous_identity then
    if space_record.owner_user_id is not null
      or exists (
        select 1 from public.devices d
        where d.supabase_auth_user_id = identity_id
      ) then
      raise exception 'Recovery authorization failed' using errcode = '42501';
    end if;

    insert into public.devices(
      device_id, space_id, supabase_auth_user_id, account_user_id, auth_session_id,
      public_key, device_name_ciphertext, device_name_nonce,
      platform, status, join_method
    ) values (
      p_device_id, p_space_id, identity_id, null, null,
      private.decode_hex(p_public_key_hex, 32), null, null,
      p_platform, 'pending', 'recovery'
    );
  else
    if session_id is null or space_record.owner_user_id <> identity_id then
      raise exception 'Recovery authorization failed' using errcode = '42501';
    end if;

    select d.* into retry_device
    from public.devices d
    where d.device_id = p_device_id
    for update;

    if found and (
      retry_device.space_id <> p_space_id
      or retry_device.account_user_id <> identity_id
      or retry_device.auth_session_id <> session_id
      or retry_device.join_method <> 'recovery'
    ) then
      raise exception 'Recovery authorization failed' using errcode = '42501';
    end if;

    if exists (
      select 1 from public.devices d
      where d.account_user_id = identity_id
        and d.auth_session_id = session_id
        and d.device_id <> p_device_id
    ) then
      raise exception 'Recovery authorization failed' using errcode = '42501';
    end if;

    if retry_device.device_id is null then
      insert into public.devices(
        device_id, space_id, supabase_auth_user_id, account_user_id, auth_session_id,
        public_key, device_name_ciphertext, device_name_nonce,
        platform, status, join_method
      ) values (
        p_device_id, p_space_id, identity_id, identity_id, session_id,
        private.decode_hex(p_public_key_hex, 32), null, null,
        p_platform, 'pending', 'recovery'
      );
    else
      update public.devices
      set public_key = private.decode_hex(p_public_key_hex, 32),
          device_name_ciphertext = null,
          device_name_nonce = null,
          device_name_key_epoch = null,
          platform = p_platform,
          status = 'pending',
          activated_at = null,
          last_seen_at = null,
          revoked_at = null
      where devices.device_id = p_device_id;
    end if;
  end if;

  return query select
    space_record.current_key_epoch,
    space_record.recovery_protocol_version,
    space_record.recovery_envelope_ciphertext,
    space_record.recovery_envelope_nonce;
end;
$$;

revoke all on function public.lifeos_sync_begin_recovery(uuid, text, uuid, text, text)
  from public, anon;
grant execute on function public.lifeos_sync_begin_recovery(uuid, text, uuid, text, text)
  to authenticated;
