alter table public.sync_events
  add column if not exists operation text not null default 'upsert',
  add column if not exists hlc_wall_time bigint not null default 0,
  add column if not exists hlc_logical integer not null default 0;

update public.sync_events
set base_revision = revision - 1
where revision <> base_revision + 1;

alter table public.sync_events
  drop constraint if exists sync_events_operation_check,
  add constraint sync_events_operation_check check (operation in ('upsert', 'tombstone')),
  drop constraint if exists sync_events_revision_step_check,
  add constraint sync_events_revision_step_check check (revision = base_revision + 1),
  drop constraint if exists sync_events_hlc_check,
  add constraint sync_events_hlc_check check (hlc_wall_time >= 0 and hlc_logical >= 0 and hlc_logical <= 65535),
  drop constraint if exists sync_events_cipher_size_check,
  add constraint sync_events_cipher_size_check check (
    octet_length(ciphertext) between 17 and 262160 and octet_length(nonce) = 24
  );

alter table public.sync_objects
  add column if not exists event_id uuid,
  add column if not exists base_revision bigint not null default 0,
  add column if not exists hlc_wall_time bigint not null default 0,
  add column if not exists hlc_logical integer not null default 0;

with matching_events as (
  select distinct on (space_id, object_id, revision)
    space_id, object_id, revision, event_id, base_revision, hlc_wall_time, hlc_logical
  from public.sync_events
  order by space_id, object_id, revision, sequence desc
)
update public.sync_objects object_record
set event_id = matching_event.event_id,
    base_revision = matching_event.base_revision,
    hlc_wall_time = matching_event.hlc_wall_time,
    hlc_logical = matching_event.hlc_logical
from matching_events matching_event
where object_record.event_id is null
  and matching_event.space_id = object_record.space_id
  and matching_event.object_id = object_record.object_id
  and matching_event.revision = object_record.revision;

update public.sync_objects
set event_id = extensions.gen_random_uuid()
where event_id is null;

update public.sync_objects
set base_revision = revision - 1
where revision <> base_revision + 1;

alter table public.sync_objects
  alter column event_id set not null,
  drop constraint if exists sync_objects_revision_step_check,
  add constraint sync_objects_revision_step_check check (revision = base_revision + 1),
  drop constraint if exists sync_objects_hlc_check,
  add constraint sync_objects_hlc_check check (hlc_wall_time >= 0 and hlc_logical >= 0 and hlc_logical <= 65535),
  drop constraint if exists sync_objects_cipher_size_check,
  add constraint sync_objects_cipher_size_check check (
    octet_length(ciphertext) between 17 and 262160 and octet_length(nonce) = 24
  );

create index if not exists sync_events_space_object_winner_idx
  on public.sync_events(space_id, object_id, hlc_wall_time desc, hlc_logical desc, device_id desc);

create or replace function public.lifeos_sync_push_pilot_event(
  p_event_id uuid,
  p_object_id uuid,
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
    or space_record.key_rotation_status <> 'stable'
    or p_key_epoch <> space_record.current_key_epoch
    or p_revision <> p_base_revision + 1
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
      or existing.base_revision <> p_base_revision
      or existing.revision <> p_revision
      or existing.device_id <> caller.device_id
      or existing.key_epoch <> p_key_epoch
      or existing.operation <> p_operation
      or existing.hlc_wall_time <> p_hlc_wall_time
      or existing.hlc_logical <> p_hlc_logical
      or existing.ciphertext <> decoded_ciphertext
      or existing.nonce <> decoded_nonce then
      raise exception 'event id content mismatch';
    end if;
    return query select existing.sequence,
      exists(select 1 from public.sync_objects o where o.space_id = caller.space_id and o.object_id = p_object_id and o.event_id = p_event_id);
    return;
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
    exists(select 1 from public.sync_objects o where o.space_id = caller.space_id and o.object_id = p_object_id and o.event_id = p_event_id);
end;
$$;

create or replace function public.lifeos_sync_pull_pilot_events(
  p_after_sequence bigint,
  p_limit integer default 100
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
declare
  caller public.devices := private.current_active_device();
  space_record public.sync_spaces;
begin
  if p_after_sequence < 0 or p_limit < 1 or p_limit > 250 then
    raise exception 'invalid pilot pull';
  end if;
  select * into space_record from public.sync_spaces s where s.space_id = caller.space_id;
  if not found or space_record.key_rotation_status <> 'stable' then
    raise exception 'pilot pull denied';
  end if;
  return query
  select e.sequence, e.space_id, e.event_id, e.object_id, e.device_id,
    e.key_epoch, e.operation, e.base_revision, e.revision,
    e.hlc_wall_time, e.hlc_logical, e.ciphertext, e.nonce
  from public.sync_events e
  where e.space_id = caller.space_id and e.sequence > p_after_sequence
  order by e.sequence asc
  limit p_limit;
end;
$$;

create or replace function public.lifeos_sync_ack_pilot_cursor(p_last_sequence bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  if p_last_sequence < 0 or p_last_sequence > coalesce((
    select max(e.sequence) from public.sync_events e where e.space_id = caller.space_id
  ), 0) then
    raise exception 'invalid pilot cursor';
  end if;
  insert into public.device_cursors(space_id, device_id, last_sequence, updated_at)
  values (caller.space_id, caller.device_id, p_last_sequence, statement_timestamp())
  on conflict (space_id, device_id) do update set
    last_sequence = greatest(device_cursors.last_sequence, excluded.last_sequence),
    updated_at = statement_timestamp();
end;
$$;

drop policy if exists lifeos_sync_pilot_realtime_receive on realtime.messages;
create policy lifeos_sync_pilot_realtime_receive
on realtime.messages for select to authenticated
using (
  case
    when realtime.topic() ~ '^lifeos-sync:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[1-9][0-9]*$'
    then private.is_active_sync_device((split_part(realtime.topic(), ':', 2))::uuid)
      and (split_part(realtime.topic(), ':', 3))::integer = (
        select s.current_key_epoch from public.sync_spaces s
        where s.space_id = (split_part(realtime.topic(), ':', 2))::uuid
      )
    else false
  end
);

revoke all on function public.lifeos_sync_push_pilot_event(uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text) from public, anon;
revoke all on function public.lifeos_sync_pull_pilot_events(bigint, integer) from public, anon;
revoke all on function public.lifeos_sync_ack_pilot_cursor(bigint) from public, anon;
grant execute on function public.lifeos_sync_push_pilot_event(uuid, uuid, bigint, bigint, integer, text, bigint, integer, text, text) to authenticated;
grant execute on function public.lifeos_sync_pull_pilot_events(bigint, integer) to authenticated;
grant execute on function public.lifeos_sync_ack_pilot_cursor(bigint) to authenticated;

revoke all on table public.sync_events from anon, authenticated;
revoke all on table public.sync_objects from anon, authenticated;
revoke all on table public.device_cursors from anon, authenticated;
