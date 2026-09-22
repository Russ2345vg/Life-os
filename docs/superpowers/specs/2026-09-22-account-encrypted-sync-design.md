# LifeOS account and encrypted multi-device sync

**Date:** 2026-09-22

**Status:** design approved in conversation; awaiting written-spec review

**Scope:** email/password account, adoption of existing local data, end-to-end encrypted sync,
device recovery, safe sign-out

## Outcome

A LifeOS user can create one account on a device that already contains local data, sign in on
another Windows or Android device, enter the recovery material once, and receive the same spheres,
directions, goals, actions, planning state, balance data, sleep settings, attachments and meaningful
synced settings. LifeOS remains local-first and usable offline. Supabase stores encrypted domain
payloads and cannot decrypt them.

The first account registration adopts the current device's existing data. Before adoption or any
remote merge, LifeOS creates and verifies a snapshot. Signing out affects only the current device,
never deletes the account or cloud data, and cannot discard unsynced local changes silently.

## Confirmed product decisions

- Authentication uses email and password.
- Email verification is required before the local dataset is attached to the account.
- End-to-end encryption remains mandatory.
- A new device requires the account credentials and the recovery material once.
- Existing local data is adopted automatically after a verified pre-migration snapshot.
- Local-first editing and later synchronization remain supported.
- Sign-out creates and verifies a snapshot, confirms that pending changes are uploaded, then removes
  the current device's readable local database, auth session and encryption keys.
- If upload or snapshot verification cannot complete, sign-out is blocked with a recoverable error.
- Each device remains independently identifiable and revocable even though the user sees a single
  account.

## Current system and reuse boundary

LifeOS already has the expensive parts of encrypted synchronization:

- a local IndexedDB domain database and mutation outbox;
- encrypted event push/pull and conflict resolution;
- encrypted attachments and snapshots;
- native Windows and Android secure key stores;
- device public keys, key epochs, rotation and revocation;
- pairing and recovery material;
- Supabase tables, storage, RPCs and RLS for sync spaces;
- sync status and lifecycle services.

The current `TechnicalSyncAuth` signs each installation into Supabase anonymously. The current
backend authorizes an active device by that anonymous user id. The former V1 sync screen was
removed with V1, but its application services remain in the composition root and are the source to
extend. The new feature must not create a second domain database or a parallel sync engine.

Supabase access tokens include a stable `session_id` for each login session. A user can have
multiple sessions, and local sign-out terminates the current session without signing out other
devices. LifeOS will use `(auth.uid(), session_id)` to bind an account session to one LifeOS device.
The device's native private key remains the end-to-end encryption identity.

For the first device, Supabase supports converting the existing anonymous user to a permanent user
by linking and verifying an email identity and then adding a password. This preserves the existing
user id and avoids moving an already configured anonymous sync space to an unrelated account id.

## User experience

### Entry point

The existing `Ещё` menu adds `Аккаунт и синхронизация`, routed as a normal current-workspace page.
The global shell continues to open the planner immediately. Account setup is optional until the user
chooses cloud synchronization; local-only use remains supported.

### Local state

The account page explains that records are currently stored only on this device and offers:

- `Создать аккаунт`;
- `Войти`;
- a concise explanation of the recovery material and end-to-end encryption.

### First registration with existing data

1. The user enters an email.
2. LifeOS links the email identity to the current anonymous Supabase user and sends verification.
3. The page waits for verified auth state and supports resending the confirmation.
4. After verification, the user sets a password.
5. LifeOS creates and verifies a local pre-account snapshot.
6. If no sync space exists, LifeOS creates the first encrypted space and bootstraps the current
   IndexedDB contents. If an anonymous encrypted space already exists, LifeOS upgrades its
   ownership in place and preserves its keys and event history.
7. LifeOS binds the current Supabase `session_id` to the existing device.
8. LifeOS displays the recovery material, supports copy/save, and requires explicit confirmation
   that it was saved.
9. Initial encrypted push completes before the page reports `Синхронизировано`.

The password is never used directly as the domain encryption key. Changing or resetting the account
password therefore does not re-encrypt the user's data.

### Sign-in on a new device

1. The user enters email and password.
2. LifeOS validates the verified account and creates a local device identity in the native secure
   store.
3. The new auth `session_id` is registered as a pending device for the account's space.
4. The user enters the recovery material.
5. LifeOS proves recovery possession through the existing recovery verifier flow, unwraps the key
   ring locally, activates the device and creates a verified pre-merge snapshot of any local data.
6. Encrypted remote state is downloaded, decrypted locally and merged through the existing sync
   adapters and conflict rules.
7. The UI opens the normal workspace only after the initial pull reaches a durable checkpoint. A
   progress view remains available for a large dataset.

Entering email and password without recovery material grants access only to encrypted cloud rows.
It never grants the plaintext key ring.

### Password reset

Supabase email recovery resets account authentication. A previously trusted device keeps its local
key and resumes after reauthentication. A new or wiped device must still provide recovery material.
If the user has neither recovery material nor any trusted device, encrypted data cannot be
recovered. The UI states this before setup confirmation and during password recovery.

### Offline behavior

After successful device enrollment, loss of network does not block reading or editing local data.
Mutations stay in the existing outbox. The account page and shell indicator show `Офлайн — изменения
ожидают отправки`. Reconnection resumes normal push/pull without another password or recovery prompt
while the local auth session and key remain valid.

### Safe sign-out

1. LifeOS stops accepting new write commands for the short sign-out finalization window.
2. It pushes pending mutations and pulls the latest cursor.
3. It creates, verifies, encrypts and uploads a pre-sign-out snapshot.
4. It marks the current device/session revoked in the sync backend.
5. It calls Supabase sign-out with `scope: 'local'`.
6. It deletes the local auth token, native device key ring, IndexedDB domain stores, synced local
   settings and device cache for this installation.
7. It returns to the signed-out local state.

If steps 2 or 3 fail, LifeOS leaves the data and keys intact and explains why sign-out did not
complete. The user can retry after reconnecting. Account deletion is not part of this scope.

## UI design contract

```text
FEATURE → account and end-to-end encrypted multi-device sync
USER GOAL → sign in on any supported device and receive the same LifeOS data
EXISTING LOGIC → IndexedDB, encrypted sync, snapshots, recovery, device keys and conflicts
PAGE/COMPONENT ARCHETYPE → standard account/settings page in the current workspace
SECTION COLOR → shared warm LifeOS accent; green success; red destructive/error
ATMOSPHERIC MOTIF → protected personal workspace, expressed through status and copy
MAIN VISUAL CENTER → account identity plus sync/security status
COMPONENTS TO REUSE → `Ещё`, settings panels, status chips, form fields and confirm dialog
MOBILE BEHAVIOR → single-column full-screen auth/recovery flow with persistent primary action
APPROVED REFERENCE → NO; standard flow built from the established design language
TEST SCOPE → auth, migration, recovery, sync, conflicts, offline, sign-out and desktop/mobile E2E
```

Required states are: loading, local-only, email-verification pending, snapshotting, initial upload,
recovery required, initial download, synchronized, offline with pending mutations, conflict,
revoked session, safe-sign-out blocked and recoverable error. Password and recovery inputs must not
be logged, persisted in React state beyond the active form, copied to diagnostics or included in
analytics.

## Application architecture

### Authentication boundary

Replace the anonymous-only assumption in `TechnicalSyncAuth` with an account-aware application
port. The port exposes account state and commands without importing Supabase types:

- observe/load the current account session;
- link email to the current anonymous user;
- confirm the verified identity and set a password;
- sign in with email/password;
- request password recovery and finish a recovery session;
- read `userId`, `sessionId`, verified email and anonymous/permanent state;
- sign out only the current session.

`SupabaseAccountAuth` implements the port. Auth tokens remain in `TauriSupabaseAuthStorage`, backed
by the native secure store. Presentation calls an account application service and never calls the
Supabase client directly.

### Account orchestration

Add one account orchestration service responsible for state transitions across auth, snapshots,
sync installation and local purge. It coordinates existing ports; it does not own domain data.
Each transition is resumable and records non-secret progress in the sync settings store so an app
restart cannot leave an ambiguous partially converted installation.

Suggested durable states:

- `local_anonymous`;
- `email_verification_pending`;
- `account_migration_pending`;
- `recovery_confirmation_pending`;
- `ready`;
- `sign_out_pending`.

Sensitive values such as passwords, access tokens and recovery material never enter IndexedDB.

### Device/session authorization

The backend adds account ownership and session binding while preserving the existing device and key
model:

- a sync space has one account owner user id;
- an active device stores the owner's user id and the Supabase auth `session_id` that enrolled it;
- every trust, event, cursor, snapshot and attachment operation verifies `auth.uid()`, the JWT
  `session_id`, active device status and matching space;
- a revoked device/session fails authorization even if its short-lived access token has not yet
  expired;
- recovery can register a new session/device only after validating the existing recovery verifier;
- device revocation and key-epoch rotation continue through the current trust service.

The migration must be rolling-safe. Existing anonymous device records remain usable by the old
contract until that installation begins account conversion. Conversion updates ownership and binds
the current session atomically. New account-mode clients must never fall back to anonymous auth
after migration starts.

### Data adoption and merge

The existing sync registry is authoritative for what crosses devices. The account feature does not
copy records store-by-store in presentation code. First-device adoption performs the existing
bootstrap over the current IndexedDB state after snapshot verification.

On another device with local records, LifeOS creates a pre-merge snapshot and feeds both local and
remote versions through existing identity, revision, HLC and conflict contracts. It does not replace
the whole database blindly. If a record cannot be merged automatically, the existing conflict store
keeps both versions and the UI reports that attention is required.

### Local purge boundary

Add a dedicated application port for account sign-out cleanup. Its infrastructure implementation
clears only LifeOS local subject data, sync metadata, local meaningful settings and native secrets
after the sign-out service supplies a verified upload receipt. It must preserve the installed
application itself and unrelated OS files. The purge runs in one declared sequence with a durable
`sign_out_pending` marker so an interruption can resume or retain the still-readable local copy.

## Backend and persistence changes

Expected Supabase migration work:

- add account owner metadata to sync spaces;
- add account user and auth session binding to devices;
- relax the old one-device-per-auth-user uniqueness that blocks multiple sessions for one account;
- update helper functions, RLS and every sync RPC to require the active `(user_id, session_id,
device_id, space_id)` tuple;
- add atomic anonymous-to-account space conversion;
- add pending-device enrollment after password sign-in and recovery proof;
- retain default-deny table access and storage policies;
- keep legacy anonymous behavior only for unmigrated installations during the rollout window.

Expected IndexedDB/native changes:

- extend sync installation metadata with non-secret account state and last known email;
- preserve the current schema's domain stores and compatibility records;
- add a resumable migration marker rather than rewriting domain records;
- continue storing auth tokens and private keys only through Tauri secure commands;
- add a scoped, verified purge operation for sign-out.

The change is a backward-compatible storage migration. A downgrade after account conversion is not
supported unless the old binary understands account-mode sync metadata; the release must therefore
follow the existing migration/backward-compatibility gate.

## Error handling and recovery

- Duplicate email or identity-link conflict leaves the anonymous/local account untouched and offers
  normal sign-in instead.
- Verification timeout preserves the anonymous session and local data; resend is idempotent.
- Snapshot failure aborts adoption before backend ownership changes.
- Backend conversion failure leaves a resumable marker and never creates a second space.
- Initial upload failure keeps the account and local data, reports pending sync and retries.
- Wrong recovery material never activates the new device and does not reveal whether decrypted
  content is valid beyond a generic failure.
- Interrupted initial pull resumes from the durable cursor.
- Revoked session disables sync and prompts for a fresh login/recovery flow without deleting local
  data automatically.
- Sign-out failure retains local data and secrets; cleanup never runs on an unverified snapshot or
  pending outbox.

## Acceptance criteria

1. A local-only user with existing records can link and verify an email, set a password, save the
   recovery material and finish with the same local records plus a synchronized encrypted space.
2. No plaintext domain payload, password, recovery material or private key is stored in Supabase
   domain tables, logs or browser storage.
3. A clean Windows or Android installation can sign in, provide the recovery material once and
   reconstruct the same supported data and attachments.
4. Two enrolled devices can edit offline, reconnect and converge through the existing conflict
   policy without replacing either database wholesale.
5. Each device is bound to its own Supabase `session_id`; revoking or signing out one device does
   not sign out the others and immediately blocks that device in LifeOS RPC/RLS checks.
6. Password reset does not rotate the data encryption key. A new device still requires recovery
   material.
7. Sign-out cannot proceed with unuploaded mutations or an unverified snapshot. Successful sign-out
   removes readable LifeOS data and secrets only from the current device.
8. Existing anonymous installations continue working locally and can migrate once without data
   duplication or a second sync space.
9. The account page exposes honest loading, offline, pending, conflict, revoked and error states at
   desktop and mobile widths with keyboard and screen-reader accessible forms.

## Verification strategy

This feature is R9 migration/backward compatibility plus R10 visual/mobile and changes critical
startup, persistence and multi-device browser flows. It requires `npm run verify:full` after targeted
tests stabilize.

Targeted coverage includes:

- account auth adapter and secure token storage;
- anonymous-to-permanent identity conversion;
- account orchestration transition/restart matrix;
- snapshot-before-adoption and snapshot-before-sign-out invariants;
- database RLS/RPC tests for user/session/device/space combinations;
- old anonymous fixture migration without record loss;
- clean-device recovery and encrypted round trip;
- local-data merge, conflict preservation and offline retry;
- current-session sign-out versus other sessions;
- scoped local purge and interrupted purge recovery;
- account page render, validation, focus, keyboard and mobile behavior;
- Windows/Android E2E covering first registration, second-device recovery, sync, revocation and
  sign-out.

No production data reset is permitted during testing. Supabase integration tests use disposable
users, spaces and records and clean them through normal test teardown.

## Rollout

1. Deploy additive backend schema, helpers and RPCs that support both legacy anonymous devices and
   account-mode sessions.
2. Release the client with account UI and resumable migration disabled behind a build flag in
   production but enabled for the test project.
3. Validate anonymous upgrade, fresh registration, Windows/Android recovery and rollback evidence.
4. Enable account creation for the production project.
5. Keep legacy anonymous sync access during a measured migration window. Remove it only in a later
   release after telemetry or explicit audit proves that no supported installations depend on it.

## Non-goals

- Google, Apple or other social login;
- shared family/team workspaces;
- multiple LifeOS spaces per account;
- browser/web deployment;
- account deletion and legal data-export workflow;
- recovery without either recovery material or an already trusted device;
- redesign of planner domain models or sync conflict semantics;
- server-side plaintext search or analytics.

## Primary references

- Supabase user sessions and the per-session `session_id` JWT claim:
  <https://supabase.com/docs/guides/auth/sessions>
- Supabase JWT claim reference:
  <https://supabase.com/docs/guides/auth/jwt-fields>
- Local versus global sign-out scopes:
  <https://supabase.com/docs/guides/auth/signout>
- Converting an anonymous Supabase user to a permanent email identity:
  <https://supabase.com/docs/guides/auth/auth-anonymous>
- Password authentication and email verification:
  <https://supabase.com/docs/guides/auth/passwords>
