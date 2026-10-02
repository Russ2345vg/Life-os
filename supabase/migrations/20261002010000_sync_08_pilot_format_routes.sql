-- SYNC-08 phase 2: distinguish legacy and format-2 callers at the RPC boundary.
-- No space is promoted by this migration. The existing RPC signatures remain legacy.

alter function public.lifeos_sync_push_pilot_event(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) set schema private;
alter function private.lifeos_sync_push_pilot_event(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) rename to push_pilot_event_impl;

alter function public.lifeos_sync_pull_pilot_events(bigint, integer) set schema private;
alter function private.lifeos_sync_pull_pilot_events(bigint, integer)
  rename to pull_pilot_events_impl;

revoke all on function private.push_pilot_event_impl(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) from public, anon, authenticated;
revoke all on function private.pull_pilot_events_impl(bigint, integer)
  from public, anon, authenticated;

create function private.require_pilot_data_format(
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
    or (p_requested_format = 2 and supported < 2) then
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
revoke all on function private.require_pilot_data_format(smallint, uuid)
  from public, anon, authenticated;

create function public.lifeos_sync_push_pilot_event(
  p_event_id uuid, p_object_id uuid, p_origin_device_id uuid,
  p_base_revision bigint, p_revision bigint, p_key_epoch integer,
  p_operation text, p_hlc_wall_time bigint, p_hlc_logical integer,
  p_ciphertext_hex text, p_nonce_hex text
)
returns table(sequence bigint, is_current_winner boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_pilot_data_format(1::smallint, p_event_id);
  return query select * from private.push_pilot_event_impl(
    p_event_id, p_object_id, p_origin_device_id, p_base_revision, p_revision,
    p_key_epoch, p_operation, p_hlc_wall_time, p_hlc_logical,
    p_ciphertext_hex, p_nonce_hex
  );
end;
$$;

create function public.lifeos_sync_push_pilot_event_v2(
  p_event_id uuid, p_object_id uuid, p_origin_device_id uuid,
  p_base_revision bigint, p_revision bigint, p_key_epoch integer,
  p_operation text, p_hlc_wall_time bigint, p_hlc_logical integer,
  p_ciphertext_hex text, p_nonce_hex text
)
returns table(sequence bigint, is_current_winner boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_pilot_data_format(2::smallint, p_event_id);
  return query select * from private.push_pilot_event_impl(
    p_event_id, p_object_id, p_origin_device_id, p_base_revision, p_revision,
    p_key_epoch, p_operation, p_hlc_wall_time, p_hlc_logical,
    p_ciphertext_hex, p_nonce_hex
  );
end;
$$;

create function public.lifeos_sync_pull_pilot_events(
  p_after_sequence bigint, p_limit integer default 100
)
returns table(
  sequence bigint, space_id uuid, event_id uuid, object_id uuid, device_id uuid,
  key_epoch integer, operation text, base_revision bigint, revision bigint,
  hlc_wall_time bigint, hlc_logical integer, ciphertext bytea, nonce bytea
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_pilot_data_format(1::smallint);
  return query select * from private.pull_pilot_events_impl(p_after_sequence, p_limit);
end;
$$;

create function public.lifeos_sync_pull_pilot_events_v2(
  p_after_sequence bigint, p_limit integer default 100
)
returns table(
  sequence bigint, space_id uuid, event_id uuid, object_id uuid, device_id uuid,
  key_epoch integer, operation text, base_revision bigint, revision bigint,
  hlc_wall_time bigint, hlc_logical integer, ciphertext bytea, nonce bytea
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_pilot_data_format(2::smallint);
  return query select * from private.pull_pilot_events_impl(p_after_sequence, p_limit);
end;
$$;

revoke all on function public.lifeos_sync_push_pilot_event(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) from public, anon;
revoke all on function public.lifeos_sync_push_pilot_event_v2(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) from public, anon;
revoke all on function public.lifeos_sync_pull_pilot_events(bigint, integer)
  from public, anon;
revoke all on function public.lifeos_sync_pull_pilot_events_v2(bigint, integer)
  from public, anon;
grant execute on function public.lifeos_sync_push_pilot_event(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) to authenticated;
grant execute on function public.lifeos_sync_push_pilot_event_v2(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) to authenticated;
grant execute on function public.lifeos_sync_pull_pilot_events(bigint, integer)
  to authenticated;
grant execute on function public.lifeos_sync_pull_pilot_events_v2(bigint, integer)
  to authenticated;
