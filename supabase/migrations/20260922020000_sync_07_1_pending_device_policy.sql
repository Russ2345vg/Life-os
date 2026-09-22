-- SYNC-07.1: pending devices must be visible to the exact recovery session.
-- The recovery RPC is the only writer and validates space ownership before creating the row.

drop policy if exists lifeos_sync_pending_device_self on public.devices;
create policy lifeos_sync_pending_device_self
on public.devices for select to authenticated
using (
  status = 'pending'
  and supabase_auth_user_id = (select auth.uid())
  and (
    (
      account_user_id = (select auth.uid())
      and auth_session_id = private.current_auth_session_id()
    )
    or
    (
      account_user_id is null
      and auth_session_id is null
      and private.is_anonymous_sync_identity()
    )
  )
);
