-- SYNC-03.1: acknowledge an exact encrypted-envelope replay before current-epoch
-- validation. A rejected old envelope can then be rematerialized client-side.

drop function if exists public.lifeos_sync_push_pilot_event(
  uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
);

create function public.lifeos_sync_push_pilot_event(
  p_event_id uuid,
  p_object_id uuid,
  p_origin_device_id uuid,
  p_base_revision bigint,
  p_revision bigint,
  p_key_epoch integer,
  p_operation text,
  p_hlc_wall_time bigint,
  p_hlc_logical integer,
  p_ciphertext_hex text,
  p_nonce_hex text
)
returns table(sequence bigint, is_current_winner boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
  space_record public.sync_spaces;
  existing public.sync_events;
  decoded_ciphertext bytea;
  decoded_nonce bytea;
  stored_sequence bigint;
begin
  select * into space_record
  from public.sync_spaces s
  where s.space_id = caller.space_id
  for update;

  if not found
    or p_revision <> p_base_revision + 1
    or p_origin_device_id is null
    or p_operation not in ('upsert', 'tombstone')
    or p_hlc_wall_time < 0
    or p_hlc_logical < 0
    or p_hlc_logical > 65535
    or p_ciphertext_hex is null
    or p_ciphertext_hex !~ '^[0-9a-f]+$'
    or length(p_ciphertext_hex) % 2 <> 0
    or length(p_ciphertext_hex) < 34
    or length(p_ciphertext_hex) > 524320
    or p_nonce_hex is null
    or p_nonce_hex !~ '^[0-9a-f]{48}$' then
    raise exception 'pilot event rejected';
  end if;

  decoded_ciphertext := private.decode_hex(p_ciphertext_hex, length(p_ciphertext_hex) / 2);
  decoded_nonce := private.decode_hex(p_nonce_hex, 24);
  if octet_length(decoded_ciphertext) < 17 or octet_length(decoded_ciphertext) > 262160 then
    raise exception 'pilot event rejected';
  end if;

  select * into existing from public.sync_events e where e.event_id = p_event_id;
  if found then
    if existing.space_id <> caller.space_id
      or existing.object_id <> p_object_id
      or existing.device_id <> p_origin_device_id
      or existing.base_revision <> p_base_revision
      or existing.revision <> p_revision
      or existing.key_epoch <> p_key_epoch
      or existing.operation <> p_operation
      or existing.hlc_wall_time <> p_hlc_wall_time
      or existing.hlc_logical <> p_hlc_logical
      or existing.ciphertext <> decoded_ciphertext
      or existing.nonce <> decoded_nonce then
      raise exception 'event id content mismatch';
    end if;
    return query select existing.sequence,
      exists(select 1 from public.sync_objects o
        where o.space_id = caller.space_id
          and o.object_id = existing.object_id
          and o.event_id = existing.event_id);
    return;
  end if;

  if space_record.key_rotation_status <> 'stable'
    or p_key_epoch <> space_record.current_key_epoch
    or p_origin_device_id <> caller.device_id then
    raise exception 'pilot event rejected';
  end if;

  insert into public.sync_events(
    space_id, event_id, object_id, base_revision, revision, device_id, key_epoch,
    hlc, hlc_wall_time, hlc_logical, operation, ciphertext, nonce
  ) values (
    caller.space_id, p_event_id, p_object_id, p_base_revision, p_revision, caller.device_id,
    p_key_epoch, p_hlc_wall_time::text || ':' || p_hlc_logical::text,
    p_hlc_wall_time, p_hlc_logical, p_operation, decoded_ciphertext, decoded_nonce
  ) returning sync_events.sequence into stored_sequence;

  insert into public.sync_objects(
    space_id, object_id, event_id, base_revision, revision, device_id, key_epoch, hlc,
    hlc_wall_time, hlc_logical, ciphertext, nonce, is_tombstone, updated_at
  ) values (
    caller.space_id, p_object_id, p_event_id, p_base_revision, p_revision, caller.device_id,
    p_key_epoch, p_hlc_wall_time::text || ':' || p_hlc_logical::text,
    p_hlc_wall_time, p_hlc_logical, decoded_ciphertext, decoded_nonce,
    p_operation = 'tombstone', statement_timestamp()
  )
  on conflict (space_id, object_id) do update set
    event_id = excluded.event_id,
    base_revision = excluded.base_revision,
    revision = excluded.revision,
    device_id = excluded.device_id,
    key_epoch = excluded.key_epoch,
    hlc = excluded.hlc,
    hlc_wall_time = excluded.hlc_wall_time,
    hlc_logical = excluded.hlc_logical,
    ciphertext = excluded.ciphertext,
    nonce = excluded.nonce,
    is_tombstone = excluded.is_tombstone,
    updated_at = excluded.updated_at
  where (excluded.hlc_wall_time, excluded.hlc_logical, excluded.device_id::text)
      > (sync_objects.hlc_wall_time, sync_objects.hlc_logical, sync_objects.device_id::text)
    and not (
      sync_objects.is_tombstone
      and not excluded.is_tombstone
      and excluded.base_revision < sync_objects.revision
    );

  begin
    perform realtime.send(
      jsonb_build_object('sequence', stored_sequence),
      'pilot_changed',
      'lifeos-sync:' || caller.space_id::text || ':' || p_key_epoch::text,
      true
    );
  exception when others then
    null;
  end;

  return query select stored_sequence,
    exists(select 1 from public.sync_objects o
      where o.space_id = caller.space_id
        and o.object_id = p_object_id
        and o.event_id = p_event_id);
end;
$$;

revoke execute on function public.lifeos_sync_push_pilot_event(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) from public, anon;
grant execute on function public.lifeos_sync_push_pilot_event(
  uuid, uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text
) to authenticated;
