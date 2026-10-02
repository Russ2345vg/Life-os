-- Advertising support is not sufficient: format-2 data is safe only after
-- every active device passed promotion under the space lock.
create or replace function private.require_pilot_data_format(
  p_requested_format smallint,
  p_replay_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  space_record public.sync_spaces;
  supported smallint;
begin
  select s.* into space_record
  from public.sync_spaces s where s.space_id = caller.space_id for update;
  select d.supported_data_format into supported
  from public.devices d where d.device_id = caller.device_id;
  if not found or p_requested_format not in (1, 2)
    or (p_requested_format = 2 and (
      supported < 2 or space_record.minimum_data_format < 2
    )) then
    raise exception 'pilot data format denied' using errcode = '42501';
  end if;
  if space_record.minimum_data_format > p_requested_format
    and (p_replay_event_id is null or not exists (
      select 1 from public.sync_events e
      where e.space_id = caller.space_id and e.event_id = p_replay_event_id
    )) then
    raise exception 'pilot data format denied' using errcode = '42501';
  end if;
end;
$$;
