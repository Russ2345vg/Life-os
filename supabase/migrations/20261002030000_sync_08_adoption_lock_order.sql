-- Keep adoption in the same space -> device lock order as format promotion.
-- The initial lookup is only a locator; authorization is rechecked under both locks.
create or replace function public.lifeos_sync_adopt_current_space(p_device_id uuid)
returns table(space_id uuid, current_key_epoch integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  target_space_id uuid;
  device_record public.devices;
  space_record public.sync_spaces;
begin
  if identity_id is null
    or private.is_anonymous_sync_identity()
    or session_id is null then
    raise exception 'Permanent account session is required' using errcode = '42501';
  end if;

  select d.space_id into target_space_id
  from public.devices d where d.device_id = p_device_id;
  if target_space_id is null then
    raise exception 'Space adoption is not authorized' using errcode = '42501';
  end if;

  select s.* into space_record
  from public.sync_spaces s where s.space_id = target_space_id for update;
  select d.* into device_record
  from public.devices d where d.device_id = p_device_id for update;
  if not found or device_record.space_id <> space_record.space_id
    or device_record.supabase_auth_user_id <> identity_id then
    raise exception 'Space adoption is not authorized' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.sync_spaces owned
    where owned.owner_user_id = identity_id
      and owned.space_id <> space_record.space_id
  ) then
    raise exception 'Space adoption is not authorized' using errcode = '42501';
  end if;

  if space_record.owner_user_id = identity_id
    and device_record.account_user_id = identity_id
    and device_record.auth_session_id = session_id
    and device_record.status = 'active' then
    return query select space_record.space_id, space_record.current_key_epoch;
    return;
  end if;

  if space_record.owner_user_id is not null
    or device_record.account_user_id is not null
    or device_record.auth_session_id is not null
    or device_record.status <> 'active' then
    raise exception 'Space adoption is not authorized' using errcode = '42501';
  end if;

  update public.sync_spaces
  set owner_user_id = identity_id
  where sync_spaces.space_id = space_record.space_id;

  update public.devices
  set account_user_id = identity_id,
      auth_session_id = session_id
  where devices.device_id = device_record.device_id;

  return query select space_record.space_id, space_record.current_key_epoch;
exception
  when unique_violation then
    raise exception 'Space adoption is not authorized' using errcode = '42501';
end;
$$;
