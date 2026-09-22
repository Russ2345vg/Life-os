-- SYNC-07: account-owned encrypted spaces and per-auth-session device authorization.
-- Legacy anonymous installations remain valid until they are explicitly adopted.

alter table public.sync_spaces
  add column owner_user_id uuid null references auth.users(id) on delete cascade;

alter table public.devices
  add column account_user_id uuid null references auth.users(id) on delete cascade,
  add column auth_session_id uuid null;

alter table public.devices
  drop constraint if exists devices_supabase_auth_user_id_key,
  add constraint devices_account_binding_check check (
    (account_user_id is null and auth_session_id is null)
    or
    (account_user_id is not null
      and auth_session_id is not null
      and account_user_id = supabase_auth_user_id)
  );

create unique index sync_spaces_owner_unique
  on public.sync_spaces(owner_user_id)
  where owner_user_id is not null;

create unique index devices_active_auth_session_unique
  on public.devices(auth_session_id)
  where auth_session_id is not null and status = 'active';

create index devices_account_session_idx
  on public.devices(account_user_id, auth_session_id, status)
  where account_user_id is not null;

create or replace function private.current_auth_session_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when coalesce((select auth.jwt()) ->> 'session_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((select auth.jwt()) ->> 'session_id')::uuid
    else null
  end
$$;

create or replace function private.is_active_sync_device(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.devices d
    join public.sync_spaces s on s.space_id = d.space_id
    where d.space_id = target_space_id
      and d.status = 'active'
      and (
        (
          s.owner_user_id is not null
          and s.owner_user_id = (select auth.uid())
          and d.account_user_id = (select auth.uid())
          and d.auth_session_id = private.current_auth_session_id()
        )
        or
        (
          s.owner_user_id is null
          and d.account_user_id is null
          and d.auth_session_id is null
          and d.supabase_auth_user_id = (select auth.uid())
          and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
        )
      )
  )
$$;

create or replace function private.current_active_device(target_space_id uuid default null)
returns public.devices
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  anonymous_identity boolean := coalesce(
    ((select auth.jwt()) ->> 'is_anonymous')::boolean,
    false
  );
  result public.devices;
begin
  if identity_id is null then
    raise exception 'Active LifeOS device is required' using errcode = '42501';
  end if;

  select d.* into result
  from public.devices d
  join public.sync_spaces s on s.space_id = d.space_id
  where d.status = 'active'
    and (target_space_id is null or d.space_id = target_space_id)
    and (
      (
        s.owner_user_id is not null
        and not anonymous_identity
        and session_id is not null
        and s.owner_user_id = identity_id
        and d.account_user_id = identity_id
        and d.auth_session_id = session_id
      )
      or
      (
        s.owner_user_id is null
        and anonymous_identity
        and d.account_user_id is null
        and d.auth_session_id is null
        and d.supabase_auth_user_id = identity_id
      )
    );

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
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  anonymous_identity boolean := private.is_anonymous_sync_identity();
begin
  if identity_id is null
    or p_platform not in ('windows', 'android')
    or (not anonymous_identity and session_id is null) then
    raise exception 'LifeOS technical identity is required' using errcode = '42501';
  end if;

  if anonymous_identity then
    if exists (
      select 1 from public.devices d
      where d.supabase_auth_user_id = identity_id
        and d.account_user_id is null
    ) then
      raise exception 'Technical identity already owns a device' using errcode = '23505';
    end if;
  elsif exists (
    select 1 from public.sync_spaces s where s.owner_user_id = identity_id
  ) then
    raise exception 'Account already owns a sync space' using errcode = '23505';
  end if;

  insert into public.sync_spaces(
    space_id, owner_user_id, current_key_epoch, recovery_auth_verifier,
    recovery_envelope_ciphertext, recovery_envelope_nonce
  ) values (
    p_space_id, case when anonymous_identity then null else identity_id end, 1,
    private.decode_hex(p_recovery_auth_verifier_hex, 32),
    private.decode_hex(
      p_recovery_envelope_ciphertext_hex,
      length(p_recovery_envelope_ciphertext_hex) / 2
    ),
    private.decode_hex(p_recovery_envelope_nonce_hex, 24)
  );

  insert into public.devices(
    device_id, space_id, supabase_auth_user_id, account_user_id, auth_session_id,
    public_key, device_name_ciphertext, device_name_nonce, device_name_key_epoch,
    platform, status, activated_at, join_method
  ) values (
    p_device_id, p_space_id, identity_id,
    case when anonymous_identity then null else identity_id end,
    case when anonymous_identity then null else session_id end,
    private.decode_hex(p_public_key_hex, 32),
    private.decode_hex(
      p_device_name_ciphertext_hex,
      length(p_device_name_ciphertext_hex) / 2
    ),
    private.decode_hex(p_device_name_nonce_hex, 24),
    1, p_platform, 'active', statement_timestamp(), 'first'
  );

  return query select p_space_id, p_device_id, 1;
end;
$$;

create or replace function public.lifeos_sync_adopt_current_space(p_device_id uuid)
returns table(space_id uuid, current_key_epoch integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_id uuid := (select auth.uid());
  session_id uuid := private.current_auth_session_id();
  device_record public.devices;
  space_record public.sync_spaces;
begin
  if identity_id is null
    or private.is_anonymous_sync_identity()
    or session_id is null then
    raise exception 'Permanent account session is required' using errcode = '42501';
  end if;

  select d.* into device_record
  from public.devices d
  where d.device_id = p_device_id
  for update;

  if not found or device_record.supabase_auth_user_id <> identity_id then
    raise exception 'Space adoption is not authorized' using errcode = '42501';
  end if;

  select s.* into space_record
  from public.sync_spaces s
  where s.space_id = device_record.space_id
  for update;

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
  elsif session_id is null
    or space_record.owner_user_id <> identity_id
    or exists (
      select 1 from public.devices d
      where d.account_user_id = identity_id
        and d.auth_session_id = session_id
    ) then
    raise exception 'Recovery authorization failed' using errcode = '42501';
  end if;

  insert into public.devices(
    device_id, space_id, supabase_auth_user_id, account_user_id, auth_session_id,
    public_key, device_name_ciphertext, device_name_nonce,
    platform, status, join_method
  ) values (
    p_device_id, p_space_id, identity_id,
    case when anonymous_identity then null else identity_id end,
    case when anonymous_identity then null else session_id end,
    private.decode_hex(p_public_key_hex, 32), null, null,
    p_platform, 'pending', 'recovery'
  );

  return query select
    space_record.current_key_epoch,
    space_record.recovery_protocol_version,
    space_record.recovery_envelope_ciphertext,
    space_record.recovery_envelope_nonce;
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
  pending public.devices;
  space_record public.sync_spaces;
begin
  select d.* into pending
  from public.devices d
  join public.sync_spaces s on s.space_id = d.space_id
  where d.device_id = p_device_id
    and d.status = 'pending'
    and d.join_method = 'recovery'
    and (
      (
        s.owner_user_id is not null
        and not anonymous_identity
        and session_id is not null
        and s.owner_user_id = identity_id
        and d.account_user_id = identity_id
        and d.auth_session_id = session_id
      )
      or
      (
        s.owner_user_id is null
        and anonymous_identity
        and d.account_user_id is null
        and d.auth_session_id is null
        and d.supabase_auth_user_id = identity_id
      )
    )
  for update of d;

  if not found then
    raise exception 'Pending recovery device is required' using errcode = '42501';
  end if;

  select * into space_record
  from public.sync_spaces s
  where s.space_id = pending.space_id
  for update;

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
        p_device_name_ciphertext_hex,
        length(p_device_name_ciphertext_hex) / 2
      ),
      device_name_nonce = private.decode_hex(p_device_name_nonce_hex, 24),
      device_name_key_epoch = space_record.current_key_epoch
  where devices.device_id = p_device_id;
end;
$$;

create or replace function public.lifeos_sync_revoke_current_device()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.devices := private.current_active_device();
begin
  if caller.account_user_id is null or caller.auth_session_id is null then
    raise exception 'Account device is required' using errcode = '42501';
  end if;

  update public.devices
  set status = 'revoked', revoked_at = statement_timestamp()
  where devices.device_id = caller.device_id
    and devices.status = 'active';

  if not found then
    raise exception 'Active device is required' using errcode = '42501';
  end if;
end;
$$;

drop policy if exists lifeos_sync_active_device_key_envelopes on public.key_envelopes;
create policy lifeos_sync_active_device_key_envelopes
on public.key_envelopes for select to authenticated
using (
  private.is_active_sync_device(space_id)
  and exists (
    select 1
    from public.devices d
    join public.sync_spaces s on s.space_id = d.space_id
    where d.device_id = key_envelopes.recipient_device_id
      and d.space_id = key_envelopes.space_id
      and d.status = 'active'
      and (
        (
          s.owner_user_id is not null
          and s.owner_user_id = (select auth.uid())
          and d.account_user_id = (select auth.uid())
          and d.auth_session_id = private.current_auth_session_id()
        )
        or
        (
          s.owner_user_id is null
          and d.supabase_auth_user_id = (select auth.uid())
          and d.account_user_id is null
          and d.auth_session_id is null
          and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
        )
      )
  )
);

drop policy if exists lifeos_sync_pending_device_self on public.devices;
create policy lifeos_sync_pending_device_self
on public.devices for select to authenticated
using (
  status = 'pending'
  and (
    (
      account_user_id = (select auth.uid())
      and auth_session_id = private.current_auth_session_id()
      and exists (
        select 1 from public.sync_spaces s
        where s.space_id = devices.space_id
          and s.owner_user_id = (select auth.uid())
      )
    )
    or
    (
      account_user_id is null
      and auth_session_id is null
      and supabase_auth_user_id = (select auth.uid())
      and private.is_anonymous_sync_identity()
      and exists (
        select 1 from public.sync_spaces s
        where s.space_id = devices.space_id
          and s.owner_user_id is null
      )
    )
  )
);

revoke all on function private.current_auth_session_id() from public, anon, authenticated;
revoke all on function private.is_active_sync_device(uuid) from public, anon, authenticated;
revoke all on function private.current_active_device(uuid) from public, anon, authenticated;
grant execute on function private.current_auth_session_id() to authenticated;
grant execute on function private.is_active_sync_device(uuid) to authenticated;

revoke all on function public.lifeos_sync_adopt_current_space(uuid) from public, anon;
revoke all on function public.lifeos_sync_revoke_current_device() from public, anon;
grant execute on function public.lifeos_sync_adopt_current_space(uuid) to authenticated;
grant execute on function public.lifeos_sync_revoke_current_device() to authenticated;
