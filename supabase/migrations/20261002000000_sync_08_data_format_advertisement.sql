-- SYNC-08 phase 1: record client support without changing the current wire format.
-- The space floor remains 1 until activation and pilot RPC guards are installed.

alter table public.sync_spaces
  add column minimum_data_format smallint not null default 1
    check (minimum_data_format in (1, 2));

alter table public.devices
  add column supported_data_format smallint not null default 1
    check (supported_data_format in (1, 2));

create function public.lifeos_sync_advertise_data_format(
  p_device_id uuid,
  p_supported_data_format smallint
)
returns table(minimum_data_format smallint, supported_data_format smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  anonymous_identity boolean := private.is_anonymous_sync_identity();
  target_space_id uuid;
  space_record public.sync_spaces;
  device_record public.devices;
begin
  if identity_id is null or p_supported_data_format is distinct from 2 then
    raise exception 'Data format advertisement is invalid' using errcode = '42501';
  end if;

  -- Discover the space without taking a device lock, then use space -> device order.
  select d.space_id into target_space_id
  from public.devices d
  where d.device_id = p_device_id
    and (
      (anonymous_identity and d.supabase_auth_user_id = identity_id
        and d.account_user_id is null and d.auth_session_id is null)
      or
      (not anonymous_identity and session_id is not null
        and d.account_user_id = identity_id and d.auth_session_id = session_id)
    );
  if target_space_id is null then
    raise exception 'Data format advertisement is not authorized' using errcode = '42501';
  end if;

  select s.* into space_record
  from public.sync_spaces s where s.space_id = target_space_id for update;
  select d.* into device_record
  from public.devices d where d.device_id = p_device_id for update;

  if not found
    or device_record.space_id <> space_record.space_id
    or device_record.status not in ('active', 'pending')
    or (
      (anonymous_identity and (device_record.supabase_auth_user_id <> identity_id
        or device_record.account_user_id is not null
        or device_record.auth_session_id is not null))
      or
      (not anonymous_identity and (session_id is null
        or device_record.account_user_id <> identity_id
        or device_record.auth_session_id <> session_id))
    ) then
    raise exception 'Data format advertisement is not authorized' using errcode = '42501';
  end if;

  update public.devices d
  set supported_data_format = p_supported_data_format
  where d.device_id = p_device_id;

  return query select space_record.minimum_data_format, p_supported_data_format;
end;
$$;

create function public.lifeos_sync_read_data_format()
returns table(
  minimum_data_format smallint,
  supported_data_format smallint,
  active_devices_ready boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  return query
  select s.minimum_data_format, d.supported_data_format,
    not exists (
      select 1 from public.devices peer
      where peer.space_id = caller.space_id
        and peer.status = 'active'
        and peer.supported_data_format < 2
    )
  from public.sync_spaces s
  join public.devices d on d.device_id = caller.device_id
  where s.space_id = caller.space_id;
end;
$$;

revoke all on function public.lifeos_sync_advertise_data_format(uuid, smallint)
  from public, anon;
revoke all on function public.lifeos_sync_read_data_format()
  from public, anon;
grant execute on function public.lifeos_sync_advertise_data_format(uuid, smallint)
  to authenticated;
grant execute on function public.lifeos_sync_read_data_format()
  to authenticated;
