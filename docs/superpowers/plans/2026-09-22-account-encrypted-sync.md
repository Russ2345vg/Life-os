# LifeOS Account and Encrypted Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one email/password LifeOS account whose existing local data can be adopted and then
end-to-end encrypted, synchronized, recovered and safely removed from any enrolled Windows or
Android device.

**Architecture:** Extend the existing IndexedDB outbox, encrypted Supabase transport, recovery
material and native secure stores. Convert the first device's anonymous Supabase user into a
permanent email identity, bind every enrolled device to the account's distinct JWT `session_id`, and
orchestrate registration, recovery and sign-out through application ports. Keep all domain payloads
encrypted outside the device and preserve local-first editing.

**Tech Stack:** TypeScript 6, React 19, IndexedDB/fake-indexeddb, Supabase JS 2.112, PostgreSQL/RLS/
pgTAP, Tauri 2, Rust native secure storage, Vitest 4 and Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-22-account-encrypted-sync-design.md`

## Global Constraints

- Read the spec and `AGENTS.md` before implementation; the spec's approved account, recovery and
  sign-out semantics are acceptance requirements.
- Preserve the current active worktree. Before Task 1, checkpoint the already verified V1-removal
  and recurring-action work because `PlannerWorkspace.tsx` and current E2E files overlap this plan.
  Never stage unrelated files in an account-sync commit.
- Add no dependency. Use the installed Supabase, React, Tauri, Vitest and Playwright packages.
- Add a new Supabase migration; never rewrite an applied migration.
- Keep `LIFE_OS_DATABASE_VERSION = 26` unless implementation proves a new object store or index is
  required. Optional fields in `sync_settings` do not require a version bump.
- Never write passwords, recovery material, auth tokens, private keys or decrypted domain payloads
  to IndexedDB, localStorage, logs, analytics, errors or Supabase domain tables.
- Keep UI → Presentation → Application → Domain dependency flow. Presentation never calls Supabase,
  IndexedDB or Tauri commands directly.
- Keep local-only LifeOS usable without an account.
- Production Supabase migration, auth-provider changes, release publication and installer rollout
  remain a final separately approved deployment step after all local and test-project gates pass.
- Use path-scoped `git add` and one commit per task. Do not include the dirty baseline accidentally.

## File Structure

New ownership units:

- `src/application/sync/account/AccountAuth.ts` — provider-independent account session and commands.
- `src/application/sync/account/AccountSyncService.ts` — resumable registration, adoption, recovery
  and sign-out orchestration.
- `src/application/sync/account/AccountLocalData.ts` — application port for scoped local purge.
- `src/infrastructure/sync/supabase/SupabaseAccountAuth.ts` — Supabase adapter for the auth port.
- `src/infrastructure/sync/IndexedDbAccountLocalData.ts` — IndexedDB/localStorage purge adapter.
- `src/presentation/planner-v2/AccountSyncPage.tsx` — account and sync settings flow.
- `src/presentation/planner-v2/account-sync.css` — account-page-only responsive styles.
- `supabase/migrations/20260922010000_sync_07_accounts.sql` — additive account/session authorization.
- `supabase/tests/database/sync_07_accounts_test.sql` — pgTAP/RLS regression contract.
- `tests/e2e/account-sync.spec.ts` — current-workspace desktop/mobile account UX acceptance.

Existing files change only where their ownership requires it: sync ports/services/transports,
`SyncStoreRecords.ts`, `IndexedDbSyncInstallationRepository.ts`, native secure commands,
composition, current routing and the `Ещё` menu.

## Review Focus

1. **Existing email plus local records:** registration conflict must preserve the local anonymous
   installation and offer sign-in; `SupabaseAccountAuth.test.ts` pins this behavior in Task 2.
2. **Restart between email verification and adoption:** persisted account setup state must resume
   without creating a second space; `AccountSyncService.test.ts` pins this in Task 5.
3. **Revoked session with an unexpired JWT:** every sync RPC must reject the inactive session/device
   tuple immediately; `sync_07_accounts_test.sql` pins this in Task 1.
4. **Sign-out while mutations or backups remain pending:** sign-out must retain the database and
   secrets; `AccountSignOut.test.ts` pins this in Task 7.
5. **Wrong or stale recovery material during rotation:** the new device must stay pending with no
   stored key ring or partial merge; `AccountSyncRecovery.test.ts` pins this in Task 6.

---

### Task 1: Account-owned spaces and session-bound device authorization

**Files:**

- Create: `supabase/migrations/20260922010000_sync_07_accounts.sql`
- Create: `supabase/tests/database/sync_07_accounts_test.sql`
- Modify: `supabase/config.toml`

**Interfaces:**

- Consumes: current `sync_spaces`, `devices`, trust RPCs, pilot RPCs, storage policies and Supabase
  JWT claims.
- Produces: `lifeos_sync_adopt_current_space(uuid)`, account-mode `lifeos_sync_create_first_space`,
  account-mode recovery enrollment and an active-device helper bound to `auth.uid()` plus JWT
  `session_id`.

- [ ] **Step 1: Write the pgTAP failure contract before the migration**

Create `sync_07_accounts_test.sql` with fixtures for one permanent user, two auth sessions, two
devices and one legacy anonymous device. Pin these cases:

```sql
select plan(24);

select has_column('public', 'sync_spaces', 'owner_user_id');
select has_column('public', 'devices', 'account_user_id');
select has_column('public', 'devices', 'auth_session_id');

-- Same account, different session: the session bound to device B cannot act as device A.
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"82000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select * from public.lifeos_sync_list_devices()$$,
  '42501',
  null,
  'an account session without an active bound device is denied'
);

-- A revoked binding is denied even while the JWT itself has not expired.
update public.devices
set status = 'revoked', revoked_at = now()
where auth_session_id = '82000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select * from public.lifeos_sync_pull_pilot_events(0, 100)$$,
  '42501',
  null,
  'revoked current session is denied immediately'
);

select * from finish();
```

Also assert: one account owns one space, one active device binding per session, foreign account
denial, anonymous legacy access before adoption, atomic adoption, repeated adoption idempotency,
pending recovery visibility only to its current session, and storage select/insert denial for an
unbound session.

- [ ] **Step 2: Run the database contract and observe the expected failure**

Run:

```powershell
.\node_modules\.bin\supabase.cmd db reset
.\node_modules\.bin\supabase.cmd test db
```

Expected: `sync_07_accounts_test.sql` fails because the three account columns and adoption RPC do
not exist. If Docker/local Supabase is unavailable, record the exact prerequisite and continue only
with static SQL review; do not report pgTAP as passing.

- [ ] **Step 3: Add the account/session schema and authorization helpers**

Implement an additive migration with nullable rolling-upgrade columns, validated indexes and
default-deny helpers:

```sql
alter table public.sync_spaces
  add column owner_user_id uuid null references auth.users(id) on delete cascade;

alter table public.devices
  add column account_user_id uuid null references auth.users(id) on delete cascade,
  add column auth_session_id uuid null;

create unique index devices_active_auth_session_unique
  on public.devices(auth_session_id)
  where auth_session_id is not null and status = 'active';

create unique index sync_spaces_owner_unique
  on public.sync_spaces(owner_user_id)
  where owner_user_id is not null;

create or replace function private.current_auth_session_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select nullif((select auth.jwt()) ->> 'session_id', '')::uuid
$$;

create or replace function private.is_active_sync_device(target_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.devices d
    join public.sync_spaces s on s.space_id = d.space_id
    where d.space_id = target_space_id
      and d.status = 'active'
      and (
        (s.owner_user_id is not null
          and s.owner_user_id = (select auth.uid())
          and d.account_user_id = (select auth.uid())
          and d.auth_session_id = private.current_auth_session_id())
        or
        (s.owner_user_id is null
          and d.supabase_auth_user_id = (select auth.uid())
          and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false))
      )
  )
$$;
```

`lifeos_sync_adopt_current_space(p_device_id uuid)` must lock the space and device, require the
current permanent user to have the same `auth.uid()` as the legacy device's
`supabase_auth_user_id`, set owner/account/session columns atomically, and return the unchanged
`space_id` and key epoch. A second identical call returns the same result; any different owner,
device or session raises `42501`.

- [ ] **Step 4: Replace every RPC's identity check consistently**

Update trust, event, cursor, snapshot metadata and storage policies in the new migration using
`create or replace function`/`drop policy` + `create policy`. For active operations, derive the
current device from `(auth.uid(), private.current_auth_session_id())`; never trust only a caller's
`p_device_id`. Recovery may create a pending row for the authenticated account session only after
the existing recovery verifier succeeds. Keep legacy anonymous branches only for spaces with
`owner_user_id is null`.

For current-device sign-out add:

```sql
create or replace function public.lifeos_sync_revoke_current_device()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.devices
  set status = 'revoked', revoked_at = now()
  where account_user_id = (select auth.uid())
    and auth_session_id = private.current_auth_session_id()
    and status = 'active';
  if not found then raise exception 'active device required' using errcode = '42501'; end if;
end
$$;
```

Grant only `execute` to `authenticated`; keep direct table writes revoked.

- [ ] **Step 5: Enable confirmed email locally and rerun pgTAP**

Add this exact local configuration:

```toml
[auth.email]
enable_confirmations = true
```

Run the same `supabase db reset` and `supabase test db`. Expected: all existing sync database tests
and all 24 account assertions pass.

- [ ] **Step 6: Commit the backend contract**

```powershell
git add -- supabase/config.toml supabase/migrations/20260922010000_sync_07_accounts.sql supabase/tests/database/sync_07_accounts_test.sql
git commit -m "feat(sync): authorize account device sessions"
```

### Task 2: Provider-independent account auth and Supabase adapter

**Files:**

- Create: `src/application/sync/account/AccountAuth.ts`
- Create: `src/infrastructure/sync/supabase/SupabaseAccountAuth.ts`
- Create: `src/infrastructure/sync/supabase/SupabaseAccountAuth.test.ts`
- Modify: `src/infrastructure/sync/supabase/createLifeOsSupabaseClient.ts`
- Modify: `src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts`

**Interfaces:**

- Consumes: Supabase `auth.getSession`, anonymous sign-in, `updateUser`, OTP verification,
  password sign-in/recovery and local sign-out.
- Produces: `AccountAuth` and `AccountSession`, used by Tasks 5–8.

- [ ] **Step 1: Define the application port and write failing adapter tests**

Use these exact public types:

```ts
export interface AccountSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly isAnonymous: boolean;
}

export interface AccountAuth {
  current(): Promise<AccountSession | null>;
  ensureAnonymous(): Promise<AccountSession>;
  beginRegistration(email: string): Promise<AccountSession>;
  resendVerification(email: string): Promise<void>;
  verifyEmail(email: string, token: string): Promise<AccountSession>;
  setPassword(password: string): Promise<AccountSession>;
  signIn(email: string, password: string): Promise<AccountSession>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<AccountSession>;
  signOutCurrent(): Promise<void>;
  close(): Promise<void>;
}
```

Tests must prove normalized lower-case email, UUID `session_id` parsing, verified-email detection,
anonymous-to-email conversion, six-digit verification OTP, password assignment only after
verification, password sign-in, generic public errors, local-only sign-out and no secret in error
metadata. The review-focus test uses an `updateUser({ email })` identity-conflict response and
asserts the original anonymous session remains current and no password call occurs.

- [ ] **Step 2: Run the adapter tests and observe failure**

Run:

```powershell
npm run test:target -- src/infrastructure/sync/supabase/SupabaseAccountAuth.test.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts
```

Expected: fail because `AccountAuth` and `SupabaseAccountAuth` do not exist.

- [ ] **Step 3: Implement strict session parsing and account commands**

Map Supabase provider types only inside the adapter. Decode `session.access_token` payload to read
`session_id`; validate `user.id`, `session_id`, email and timestamps. Use:

```ts
await client.auth.updateUser({ email: normalized });
await client.auth.verifyOtp({ email: normalized, token, type: 'email_change' });
await client.auth.updateUser({ password });
await client.auth.signInWithPassword({ email: normalized, password });
await client.auth.resetPasswordForEmail(normalized);
await client.auth.signOut({ scope: 'local' });
```

Password validation belongs in application code: 12–128 characters. OTP is exactly six ASCII
digits. Provider errors become stable `DomainError` codes such as `account.email_in_use`,
`account.invalid_credentials`, `account.verification_invalid` and `account.auth_unavailable`; do
not include provider messages or inputs in public metadata.

- [ ] **Step 4: Keep PKCE-safe native auth settings and make redirects explicit**

Extend `LIFE_OS_SUPABASE_AUTH_OPTIONS` with `flowType: 'pkce' as const`. Keep the existing native
`TauriSupabaseAuthStorage`, `persistSession`, auto-refresh and `detectSessionInUrl: false`; the app
uses OTP entry rather than a browser deep-link callback.

- [ ] **Step 5: Run targeted tests and commit**

Run the Task 2 command again. Expected: all tests pass.

```powershell
git add -- src/application/sync/account/AccountAuth.ts src/infrastructure/sync/supabase/SupabaseAccountAuth.ts src/infrastructure/sync/supabase/SupabaseAccountAuth.test.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts
git commit -m "feat(sync): add permanent account authentication"
```

### Task 3: Durable account migration state in existing sync settings

**Files:**

- Modify: `src/application/sync/ports/SyncInstallationRepository.ts`
- Modify: `src/infrastructure/persistence/records/SyncStoreRecords.ts`
- Modify: `src/infrastructure/sync/IndexedDbSyncInstallationRepository.ts`
- Modify: `src/infrastructure/sync/IndexedDbSyncRepositories.test.ts`
- Modify: `src/infrastructure/sync/IndexedDbSyncStatusSource.ts`
- Modify: `src/infrastructure/sync/IndexedDbSyncStatusSource.test.ts`

**Interfaces:**

- Consumes: existing `sync_settings` object store and `SyncInstallation`.
- Produces: resumable, non-secret `AccountSetupState` fields and account status projection.

- [ ] **Step 1: Write failing repository normalization tests**

Add fixtures for a legacy record without account fields and each account transition. Require this
type:

```ts
export type AccountSetupState =
  | 'local_anonymous'
  | 'email_verification_pending'
  | 'account_migration_pending'
  | 'recovery_confirmation_pending'
  | 'ready'
  | 'sign_out_pending';

export interface SyncAccountMetadata {
  readonly accountSetupState: AccountSetupState;
  readonly accountUserId: string | null;
  readonly accountSessionId: string | null;
  readonly accountEmail: string | null;
  readonly accountMigrationSnapshotId: string | null;
}
```

Assert legacy records normalize to `local_anonymous` with all nullable account fields `null` and are
not rewritten merely by reading. Assert invalid email, non-UUID IDs and impossible states fail
closed. `ready` requires user/session/email; `sign_out_pending` requires a snapshot id.

- [ ] **Step 2: Run the repository/status tests and observe failure**

```powershell
npm run test:target -- src/infrastructure/sync/IndexedDbSyncRepositories.test.ts src/infrastructure/sync/IndexedDbSyncStatusSource.test.ts
```

Expected: fail because account metadata is absent.

- [ ] **Step 3: Extend records without changing the database version**

Add optional account fields to `SyncSettingsRecord` for backward reads, then have the repository
always return a fully normalized `SyncInstallation & SyncAccountMetadata`. Do not add a store or
index. On `save`, persist all normalized fields.

Extend `SyncStatusSnapshot` with:

```ts
readonly accountState: AccountSetupState;
readonly accountEmail: string | null;
```

Project only those metadata fields; never project auth tokens or recovery material.

- [ ] **Step 4: Add restart-state matrix coverage**

For every setup state, save, close the fake database, create a new repository, read again and assert
the exact state survives. Include an interrupted `account_migration_pending` fixture with a snapshot
id and no second-space side effect.

- [ ] **Step 5: Run targeted tests and commit**

Run the Task 3 command again. Expected: pass.

```powershell
git add -- src/application/sync/ports/SyncInstallationRepository.ts src/infrastructure/persistence/records/SyncStoreRecords.ts src/infrastructure/sync/IndexedDbSyncInstallationRepository.ts src/infrastructure/sync/IndexedDbSyncRepositories.test.ts src/infrastructure/sync/IndexedDbSyncStatusSource.ts src/infrastructure/sync/IndexedDbSyncStatusSource.test.ts
git commit -m "feat(sync): persist account migration state"
```

### Task 4: Account-aware trust and event transports

**Files:**

- Modify: `src/application/sync/ports/SyncTrustTransport.ts`
- Modify: `src/infrastructure/sync/supabase/SupabaseSyncTrustTransport.ts`
- Modify: `src/infrastructure/sync/supabase/SupabaseSyncTrustTransport.test.ts`
- Modify: `src/infrastructure/sync/supabase/SupabasePilotSyncTransport.ts`
- Modify: `src/infrastructure/sync/supabase/SupabasePilotSyncTransport.test.ts`

**Interfaces:**

- Consumes: Task 1 RPCs.
- Produces: `adoptCurrentSpace`, `revokeCurrentDevice` and session-bound transport calls used by the
  account service.

- [ ] **Step 1: Add failing transport tests for the new RPC contract**

Extend the port:

```ts
adoptCurrentSpace(deviceId: string): Promise<{
  readonly spaceId: string;
  readonly currentKeyEpoch: number;
}>;
revokeCurrentDevice(): Promise<void>;
```

Assert `adoptCurrentSpace` invokes `lifeos_sync_adopt_current_space` with only
`p_device_id`; session id must come from the server-validated JWT. Assert current-device revoke has
no caller-supplied target. Existing event push/pull/ack tests must still use the same public payload
shape.

- [ ] **Step 2: Run transport tests and observe failure**

```powershell
npm run test:target -- src/infrastructure/sync/supabase/SupabaseSyncTrustTransport.test.ts src/infrastructure/sync/supabase/SupabasePilotSyncTransport.test.ts
```

Expected: fail because the methods are absent.

- [ ] **Step 3: Implement and validate response parsing**

Implement both methods through the adapter's existing private `rpc` wrapper. Require UUID space id
and positive key epoch. Preserve the generic `sync.remote_operation_failed` error and never surface
SQL details.

- [ ] **Step 4: Run targeted tests and commit**

Run the Task 4 command again. Expected: pass.

```powershell
git add -- src/application/sync/ports/SyncTrustTransport.ts src/infrastructure/sync/supabase/SupabaseSyncTrustTransport.ts src/infrastructure/sync/supabase/SupabaseSyncTrustTransport.test.ts src/infrastructure/sync/supabase/SupabasePilotSyncTransport.ts src/infrastructure/sync/supabase/SupabasePilotSyncTransport.test.ts
git commit -m "feat(sync): bind transports to account sessions"
```

### Task 5: Registration and existing-data adoption orchestration

**Files:**

- Create: `src/application/sync/account/AccountSyncService.ts`
- Create: `src/application/sync/account/AccountSyncService.test.ts`
- Modify: `src/application/sync/SyncApplicationService.ts`
- Modify: `src/application/sync/SyncApplicationService.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: `AccountAuth`, `SyncInstallationRepository`, `SnapshotService`, `SyncApplication`,
  `SyncTrustTransport` and existing bootstrap/coordinator.
- Produces: `AccountSync` commands and `AccountOverview` for presentation.

- [ ] **Step 1: Define the account service contract in a failing test**

Use this public API:

```ts
export interface AccountOverview {
  readonly state: AccountSetupState;
  readonly email: string | null;
  readonly connection: 'local' | 'online' | 'offline';
  readonly recoveryMaterial: string | null;
  readonly pendingMutations: number;
  readonly conflicts: number;
  readonly devices: readonly CachedSyncDevice[];
}

export interface AccountSync {
  load(): Promise<AccountOverview>;
  beginRegistration(email: string): Promise<AccountOverview>;
  resendVerification(): Promise<void>;
  verifyEmail(token: string): Promise<AccountOverview>;
  setPasswordAndAdopt(password: string): Promise<AccountOverview>;
  confirmRecoverySaved(): Promise<AccountOverview>;
  signIn(email: string, password: string): Promise<AccountOverview>;
  recoverDevice(recoveryMaterial: string): Promise<AccountOverview>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<AccountOverview>;
  syncNow(): Promise<AccountOverview>;
  revokeDevice(deviceId: string): Promise<AccountOverview>;
  signOut(): Promise<void>;
}
```

Write tests for local-only load, begin registration, OTP verification, pre-adoption snapshot, new
space creation, existing anonymous space adoption, recovery confirmation and initial push. Assert
the password and recovery material never appear in repository saves or error objects. Also assert a
password-reset/update cycle keeps the existing `spaceId`, key epoch and wrapped data key unchanged;
the next untrusted device still enters `recovery_confirmation_pending`.

- [ ] **Step 2: Run tests and observe failure**

```powershell
npm run test:target -- src/application/sync/account/AccountSyncService.test.ts src/application/sync/SyncApplicationService.test.ts
```

Expected: fail because `AccountSyncService` does not exist.

- [ ] **Step 3: Implement resumable registration states**

Persist state before each external transition. `setPasswordAndAdopt` must execute this sequence:

```ts
const session = await auth.setPassword(password);
const snapshot = await snapshots.createPreSyncSnapshot();
const verification = await snapshots.verifySnapshot(snapshot.snapshotId);
if (!verification.valid) throw snapshotFailed();
await installations.save({
  ...installation,
  accountSetupState: 'account_migration_pending',
  accountUserId: session.userId,
  accountSessionId: session.sessionId,
  accountEmail: session.email,
  accountMigrationSnapshotId: snapshot.snapshotId,
});
```

If `spaceId` is null, call the existing first-space flow. Otherwise call
`transport.adoptCurrentSpace(deviceId)` and assert it returns the same space and key epoch. Finish
bootstrap/sync, then persist `recovery_confirmation_pending` or `ready` as appropriate.

- [ ] **Step 4: Pin idempotent restart recovery**

The review-focus test constructs `account_migration_pending`, restarts the service and calls
`load()`. It must reuse `accountMigrationSnapshotId`, call adoption at most once, accept the RPC's
idempotent same-space result and never call `createFirstSpace`. Add equivalent coverage for a
network failure after snapshot and before adoption.

- [ ] **Step 5: Make `SyncApplicationService` account-auth compatible**

Replace `ensureIdentity` calls with `auth.current()`/`ensureAnonymous()` according to installation
mode. Remove `replaceIdentity()` from recovery; account-mode recovery must keep the signed-in user
and create only a new device id/key. Preserve legacy anonymous pairing for unmigrated installations.

- [ ] **Step 6: Run targeted and fast tests, then commit**

```powershell
npm run test:target -- src/application/sync/account/AccountSyncService.test.ts src/application/sync/SyncApplicationService.test.ts
npm run test:fast
```

Expected: both commands pass.

```powershell
git add -- src/application/sync/account/AccountSyncService.ts src/application/sync/account/AccountSyncService.test.ts src/application/sync/SyncApplicationService.ts src/application/sync/SyncApplicationService.test.ts src/application/index.ts
git commit -m "feat(sync): adopt local data into an account"
```

### Task 6: New-device recovery and first convergence

**Files:**

- Create: `src/application/sync/account/AccountSyncRecovery.test.ts`
- Modify: `src/application/sync/account/AccountSyncService.ts`
- Modify: `src/application/sync/SyncApplicationService.ts`
- Modify: `src/application/sync/SyncApplicationService.test.ts`
- Modify: `src/application/sync/pilot/PilotSyncCoordinator.ts`
- Modify: `src/application/sync/pilot/PilotSyncCoordinator.test.ts`
- Modify: `src/application/sync/ports/SyncCryptoService.ts`
- Modify: `src/infrastructure/sync/crypto/TauriSyncCryptoService.ts`
- Modify: `src/infrastructure/sync/crypto/TauriSyncCryptoService.test.ts`
- Modify: `src-tauri/src/sync_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/secure_key_store/mod.rs`

**Interfaces:**

- Consumes: Task 5 `signIn`/`recoverDevice`, existing recovery verifier and encrypted pull engine.
- Produces: durable first-sync completion with no partial activation.

- [ ] **Step 1: Write two-device recovery tests**

Model account session A with seeded encrypted remote events and clean session B. Assert:

- password sign-in alone returns `recovery_confirmation_pending` and does not call pull;
- correct recovery material stores the key ring, activates session B, runs bootstrap/pull, applies
  the remote goal/action and advances the cursor;
- existing local records receive a pre-merge snapshot and converge through normal conflicts;
- restart after key unwrap but before pull resumes the pull without registering another device;
- wrong or stale recovery material leaves membership pending, cursor absent, data unchanged and key
  deletion invoked.

- [ ] **Step 2: Run recovery tests and observe failure**

```powershell
npm run test:target -- src/application/sync/account/AccountSyncRecovery.test.ts src/application/sync/pilot/PilotSyncCoordinator.test.ts src/application/sync/SyncApplicationService.test.ts
```

Expected: at least password-only and partial-recovery assertions fail.

- [ ] **Step 3: Add an explicit first-convergence result**

Make coordinator runs observable without exposing payloads:

```ts
export interface PilotSyncRunResult {
  readonly pending: number;
  readonly conflicts: number;
  readonly quarantined: number;
  readonly lastSequence: number | null;
}
```

Return it from an explicit `runAndReport()` used by account enrollment; keep background `run()` and
debounced `trigger()` behavior unchanged. Account readiness requires pending `0`, no quarantined
event and a durable cursor read after pull. Conflicts are allowed but surfaced as attention.

- [ ] **Step 4: Make recovery rollback explicit**

Add `deleteDeviceSecrets(deviceId, spaceId)` to the crypto port and implement it in the native
adapter before recovery calls it. The Tauri command accepts validated UUIDs only and deletes only
the matching device-private-key and space-key-ring slots. Add Rust tests for valid scoped deletion,
malformed IDs, missing-id idempotency and proof that the auth-session slot is untouched. Until
activation succeeds, persist account state as pending. On failure, delete the newly created device
private key and any just-unwrapped space key ring, retain the pre-merge snapshot reference and leave
domain records untouched.

- [ ] **Step 5: Run targeted tests and commit**

Run the Task 6 command again, then run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml sync_delete_device_secrets
```

Expected: both commands pass.

```powershell
git add -- src/application/sync/account/AccountSyncRecovery.test.ts src/application/sync/account/AccountSyncService.ts src/application/sync/SyncApplicationService.ts src/application/sync/SyncApplicationService.test.ts src/application/sync/pilot/PilotSyncCoordinator.ts src/application/sync/pilot/PilotSyncCoordinator.test.ts src/application/sync/ports/SyncCryptoService.ts src/infrastructure/sync/crypto/TauriSyncCryptoService.ts src/infrastructure/sync/crypto/TauriSyncCryptoService.test.ts src-tauri/src/sync_commands.rs src-tauri/src/lib.rs src-tauri/src/secure_key_store/mod.rs
git commit -m "feat(sync): recover account data on a new device"
```

### Task 7: Verified sign-out, native secret deletion and scoped local purge

**Files:**

- Create: `src/application/sync/account/AccountLocalData.ts`
- Create: `src/application/sync/account/AccountSignOut.test.ts`
- Create: `src/infrastructure/sync/IndexedDbAccountLocalData.ts`
- Create: `src/infrastructure/sync/IndexedDbAccountLocalData.test.ts`
- Modify: `src/application/sync/recovery/SyncRecovery.ts`
- Modify: `src/application/sync/recovery/SyncRecoveryService.ts`
- Modify: `src/application/sync/recovery/SyncRecoveryService.test.ts`

**Interfaces:**

- Consumes: pending counts, verified cloud snapshots, `revokeCurrentDevice`, local auth sign-out and
  native secure stores.
- Produces: all-or-retain-local sign-out behavior and `AccountLocalData.purge()`.

- [ ] **Step 1: Write failing sign-out and purge tests**

Define:

```ts
export interface AccountLocalData {
  purge(): Promise<void>;
}
```

Test exact order: persist `sign_out_pending` → sync → create `pre-sign-out` snapshot → run backup
maintenance → verify `cloudVerifiedAt` → revoke current device → local auth sign-out → delete native
secrets → purge IndexedDB/local settings. Pending mutations, failed backup, revoke failure or auth
failure must skip purge and retain readable local data. Repeating after interruption must complete
idempotently.

- [ ] **Step 2: Run targeted tests and observe failure**

```powershell
npm run test:target -- src/application/sync/account/AccountSignOut.test.ts src/infrastructure/sync/IndexedDbAccountLocalData.test.ts src/application/sync/recovery/SyncRecoveryService.test.ts
```

Expected: fail because `pre-sign-out` and purge do not exist.

- [ ] **Step 3: Add cloud-verifiable pre-sign-out snapshots**

Extend `RecoverySnapshotKind` with `'pre-sign-out'` and add:

```ts
ensureCloudVerified(snapshotId: string): Promise<RecoverySnapshot>;
```

It runs bounded maintenance, rereads the snapshot and returns only when `verifiedAt` and
`cloudVerifiedAt` are non-null; otherwise throw `sync.backup_not_verified`. Retain pre-sign-out
snapshots for 84 days like weekly snapshots.

- [ ] **Step 4: Implement local purge with an explicit allowlist**

`IndexedDbAccountLocalData` closes `LifeOsIndexedDb`, deletes only the `lifeos` database, removes
`lifeos.local-settings.v1`, then verifies reopening yields an empty current schema. It must not call
`localStorage.clear()` or enumerate/delete unrelated databases. Keep the snapshot id in the
sign-out orchestration log only until purge starts; do not preserve plaintext snapshot payload.

- [ ] **Step 5: Run targeted tests**

```powershell
npm run test:target -- src/application/sync/account/AccountSignOut.test.ts src/infrastructure/sync/IndexedDbAccountLocalData.test.ts src/application/sync/recovery/SyncRecoveryService.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit sign-out safety**

```powershell
git add -- src/application/sync/account/AccountLocalData.ts src/application/sync/account/AccountSignOut.test.ts src/infrastructure/sync/IndexedDbAccountLocalData.ts src/infrastructure/sync/IndexedDbAccountLocalData.test.ts src/application/sync/recovery/SyncRecovery.ts src/application/sync/recovery/SyncRecoveryService.ts src/application/sync/recovery/SyncRecoveryService.test.ts
git commit -m "feat(sync): sign out without losing pending data"
```

### Task 8: Composition and lifecycle wiring

**Files:**

- Modify: `src/app/composition/createLifeOsSyncApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`
- Modify: `src/app/composition/PlannerDailyWorkflow.integration.test.ts`
- Modify: `src/infrastructure/sync/UnavailableSyncApplication.ts`
- Modify: `src/infrastructure/sync/supabase/SupabaseConfig.ts`
- Modify: `src/infrastructure/sync/supabase/SupabaseConfig.test.ts`
- Delete: `src/application/sync/ports/TechnicalSyncAuth.ts`
- Delete: `src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.ts`
- Delete: `src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.test.ts`

**Interfaces:**

- Consumes: Tasks 2–7 adapters and services.
- Produces: `LifeOsApplication.accountSync: AccountSync` for the current workspace.

- [ ] **Step 1: Write failing composition tests**

Assert configured Tauri composition shares one Supabase client between `SupabaseAccountAuth`, trust,
pilot and blob transports; shares the same installation/status repositories; and constructs one
`AccountSyncService`. Browser/unconfigured builds expose an unavailable account service whose
`load()` returns local-only status and whose remote commands throw a stable public message.
Add `VITE_LIFEOS_ACCOUNT_SYNC_ENABLED` to `SupabasePublicEnvironment`; parse only the literal string
`'true'` as enabled. A configured build with the flag off keeps existing anonymous sync running but
returns the unavailable account service. Tests must prove that omitted, boolean and misspelled values
cannot accidentally enable account enrollment.

- [ ] **Step 2: Run composition tests and observe failure**

```powershell
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts src/app/composition/PlannerDailyWorkflow.integration.test.ts
```

Expected: fail because `accountSync` is not in `LifeOsApplication`.

- [ ] **Step 3: Wire dependencies without a second sync runtime**

Construct `SupabaseAccountAuth` in `createLifeOsSyncApplication`, inject it into both
`SyncApplicationService` and `AccountSyncService`, and return both through one result object:

```ts
export interface LifeOsSyncApplications {
  readonly sync: SyncApplication;
  readonly accountSync: AccountSync;
}
```

Keep one `PilotSyncCoordinator`, one mutation notifier and one hint subscription. `close()` closes
the account/sync auth auto-refresh once. Remove `TechnicalSyncAuth` and its adapter only after every
consumer uses `AccountAuth`, so Tasks 1–7 remain independently buildable.

- [ ] **Step 4: Run targeted tests and commit**

Run the Task 8 command again. Expected: pass.

```powershell
git add -- src/app/composition/createLifeOsSyncApplication.ts src/app/composition/createLifeOsApplication.ts src/app/composition/LifeOsApplication.ts src/app/composition/createLifeOsApplication.test.ts src/app/composition/PlannerDailyWorkflow.integration.test.ts src/infrastructure/sync/UnavailableSyncApplication.ts src/infrastructure/sync/supabase/SupabaseConfig.ts src/infrastructure/sync/supabase/SupabaseConfig.test.ts src/application/sync/ports/TechnicalSyncAuth.ts src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.ts src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.test.ts
git commit -m "feat(app): compose account synchronization"
```

### Task 9: Current-workspace account UI and responsive states

**Files:**

- Create: `src/presentation/planner-v2/AccountSyncPage.tsx`
- Create: `src/presentation/planner-v2/AccountSyncPage.test.tsx`
- Create: `src/presentation/planner-v2/account-sync.css`
- Modify: `src/presentation/planner-v2/PlannerNavigation.ts`
- Modify: `src/presentation/planner-v2/PlannerNavigation.test.ts`
- Modify: `src/presentation/planner-v2/PlannerWorkspace.tsx`
- Modify: `src/presentation/planner-v2/PlannerLibrary.test.tsx`
- Modify: `src/presentation/components/AppIcon.tsx`

**Interfaces:**

- Consumes: `AccountSync` and `AccountOverview` from Task 5.
- Produces: `#/v2/account`, the `Аккаунт и синхронизация` entry under `Ещё`, accessible forms and all
  approved states.

- [ ] **Step 1: Write route and view regressions first**

Add `{ readonly view: 'account' }` to `PlannerRoute`; parse/build `#/v2/account`. Static render tests
must cover:

- local-only create/sign-in choices;
- email form and verification OTP form;
- recovery material display with explicit saved confirmation;
- password login followed by recovery input;
- synchronized account email, device list and sync status;
- offline pending count, conflict notice and revoked session;
- sign-out confirmation explaining local removal;
- no password/recovery echo in status or error markup.

- [ ] **Step 2: Run UI tests and observe failure**

```powershell
npm run test:target -- src/presentation/planner-v2/PlannerNavigation.test.ts src/presentation/planner-v2/AccountSyncPage.test.tsx src/presentation/planner-v2/PlannerLibrary.test.tsx
```

Expected: fail because the account route/page is absent.

- [ ] **Step 3: Implement one state-driven page**

`AccountSyncPage` receives only the service and `onBack`. Keep password and recovery values in the
active form component and clear them in `finally` after submission. Use existing voice-free text
inputs, buttons, status blocks and confirm-dialog conventions. Exact primary copy:

```text
Local: Данные хранятся только на этом устройстве
Ready: Синхронизировано и защищено
Offline: Офлайн — изменения ожидают отправки
Recovery: Введите ключ восстановления для расшифровки данных на этом устройстве
Sign-out blocked: Выход не выполнен: сначала нужно сохранить изменения и резервную копию
```

Do not expose key epochs in the primary UI. Device details may show name, platform, last activity
and revoked/active state.

- [ ] **Step 4: Add navigation and responsive layout**

Add an account link to `planner-more-menu` and render `AccountSyncPage` before data-dependent planner
branches. Exclude `account` from planner data loading just like `sleep`. Use a single column under
600px, 44px minimum touch targets, visible keyboard focus, `aria-live` for progress and `role=alert`
for errors. Keep the primary action visible after validation errors without fixed overlays covering
the keyboard.

- [ ] **Step 5: Run UI tests and commit**

Run the Task 9 command again. Expected: pass.

```powershell
git add -- src/presentation/planner-v2/AccountSyncPage.tsx src/presentation/planner-v2/AccountSyncPage.test.tsx src/presentation/planner-v2/account-sync.css src/presentation/planner-v2/PlannerNavigation.ts src/presentation/planner-v2/PlannerNavigation.test.ts src/presentation/planner-v2/PlannerWorkspace.tsx src/presentation/planner-v2/PlannerLibrary.test.tsx src/presentation/components/AppIcon.tsx
git commit -m "feat(ui): add account and sync settings"
```

### Task 10: Cross-layer acceptance, rollout evidence and release gate

**Files:**

- Create: `tests/e2e/account-sync.spec.ts`
- Create: `tests/fixtures/account-sync.html`
- Create: `tests/fixtures/account-sync.tsx`
- Create: `src/infrastructure/sync/supabase/AccountSyncRoundTrip.integration.test.ts`
- Modify: `tests/e2e/lifeos.smoke.spec.ts`
- Modify: `docs/codex/PROJECT_MAP.md`
- Create: `docs/sync/ACCOUNT_SYNC_RELEASE.md`

**Interfaces:**

- Consumes: complete feature from Tasks 1–9.
- Produces: two-session encrypted convergence evidence, desktop/mobile UI evidence and a deployment
  runbook with rollback boundaries.

- [ ] **Step 1: Add controlled two-session integration coverage**

Against local Supabase, create disposable anonymous user A, convert it to a confirmed synthetic
email account, create an encrypted space, then sign in as the same account in session B. Bind each
device to its actual JWT `session_id`. Assert A pushes an encrypted goal/action, B cannot decrypt
or download its attachment before recovery, B recovers and pulls the goal/action plus attachment, B
edits offline then converges, and revoking B blocks its next RPC and blob read while A remains
active. Delete disposable rows/users in teardown; never target production.

- [ ] **Step 2: Add current-route desktop/mobile E2E**

Mount `AccountSyncPage` in `tests/fixtures/account-sync.tsx` with a deterministic in-memory
`AccountSync` implementation, following the existing fixture convention. `account-sync.spec.ts`
must run in both Playwright projects and exercise local → verification → migration → recovery
confirmation → ready → offline → sign-out blocked → safe sign-out through that application API; the
fixture must not write state directly to the DOM. Assert 360, 390 and 1440 widths, keyboard order,
no horizontal overflow, live progress and no console/page errors. Extend the real-app smoke routes
with `#/v2/account`, assert the browser/unconfigured local-only state and reload. This separates the
deterministic interaction contract from the actual composition smoke check.

- [ ] **Step 3: Run targeted cross-layer checks**

```powershell
npm run test:target -- src/infrastructure/sync/supabase/AccountSyncRoundTrip.integration.test.ts src/presentation/planner-v2/AccountSyncPage.test.tsx src/app/composition/createLifeOsApplication.test.ts
npm run test:e2e -- tests/e2e/account-sync.spec.ts tests/e2e/lifeos.smoke.spec.ts
cargo test --manifest-path src-tauri/Cargo.toml sync_
.\node_modules\.bin\supabase.cmd test db
```

Expected: all available commands pass. A missing Docker/local Supabase prerequisite remains
explicitly unconfirmed and blocks production deployment, even if TypeScript tests pass.

- [ ] **Step 4: Perform the complete migration/mobile gate**

Because this is R9 migration/backward compatibility and R10 mobile/browser flow, run once after the
last code change:

```powershell
npm run verify:full
```

Expected: typecheck, lint, all unit/integration, infrastructure, alpha, production build, formatting,
`git diff --check` and all desktop/mobile E2E pass.

- [ ] **Step 5: Verify native packages without publishing**

Build the Windows NSIS installer and signed universal Android APK using the repository's established
Tauri commands. Install only on approved test devices. On each platform verify: existing local data
survives upgrade, registration/adoption succeeds, second-device recovery succeeds, offline edit
converges, current-device sign-out removes readable local data, and another device remains active.
Record package hashes, signer identity, app version and exact manual observations in
`ACCOUNT_SYNC_RELEASE.md`.

- [ ] **Step 6: Document rollout and rollback boundaries**

Update `PROJECT_MAP.md` with the account route and account-aware sync ownership. The release runbook
must state:

- additive backend migration deploys before the client;
- hosted email confirmation and templates must be configured;
- production ships with `VITE_LIFEOS_ACCOUNT_SYNC_ENABLED` disabled until the test-project gate is
  recorded;
- legacy anonymous access stays enabled during the measured migration window;
- disabling account creation is the client-side rollback for enrollment failures;
- the backend migration is not destructively rolled back after account spaces exist;
- no production migration or publication occurs without explicit approval.

- [ ] **Step 7: Final hygiene and commit**

```powershell
git diff --check
git diff --stat
git diff --name-status
git status --short
git add -- tests/e2e/account-sync.spec.ts tests/fixtures/account-sync.html tests/fixtures/account-sync.tsx src/infrastructure/sync/supabase/AccountSyncRoundTrip.integration.test.ts tests/e2e/lifeos.smoke.spec.ts docs/codex/PROJECT_MAP.md docs/sync/ACCOUNT_SYNC_RELEASE.md
git commit -m "test(sync): verify encrypted account lifecycle"
```

Do not deploy the Supabase migration, change hosted Auth configuration, publish installers or push
until the user reviews the release evidence and gives the final deployment authorization.
