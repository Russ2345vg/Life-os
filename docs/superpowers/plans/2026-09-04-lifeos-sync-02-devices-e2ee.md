# LifeOS SYNC-02 Devices, Pairing, E2EE Keys and Recovery Implementation Plan

> **Execution rule:** the primary agent is the only file editor. Read-only agents may audit and
> review. Execute task-by-task with focused tests and preserve the current dirty SYNC-01 baseline.

**Goal:** Implement device identity, platform-secure key storage, E2EE key envelopes, recovery,
one-time pairing, membership/revocation, and the basic Sync UI without enabling ordinary LifeOS
data synchronization.

**Architecture:** Keep domain state local. A lazily networked application-facing Sync facade owns
the workflow; IndexedDB stores only non-secret installation/cache metadata; Supabase is accessed
only through hidden anonymous auth and narrow `SECURITY DEFINER` RPCs; native Rust owns crypto and
secret operations; Windows uses user-scoped DPAPI and Android uses Android Keystore AES-GCM over
encrypted blobs in `noBackupFilesDir`. The WebView receives only public data, ciphertext, typed
metadata, and the deliberate one-time recovery export.

**Tech stack:** TypeScript 6, React 19, IndexedDB, Supabase JS v2, PostgreSQL/pgTAP, Tauri 2/Rust,
RustCrypto X25519/HKDF-SHA256/XChaCha20-Poly1305, Windows DPAPI, Android Keystore and camera APIs.

**Sources:** approved `LifeOS_Sync_v1_Design.md`, current `LifeOS_SYNC_02_Codex_Task.md`, SYNC-01
plan and implementation, and `docs/design/features/2026-09-04-sync-02-devices-e2ee.md`.

## Global constraints

- Do not edit or roll back the SYNC-01 migration; add only `20260904000000_sync_02_devices_e2ee.sql`.
- Do not add service-role, database password, management token, private key, or recovery root to
  tracked files, logs, test artifacts, IndexedDB, localStorage, Supabase rows, or screenshots.
- Do not wire Supabase into existing domain commands, repositories, saves, startup readiness, or
  automatic background synchronization.
- Do not touch the 21 domain stores except the existing read-only pre-sync snapshot.
- Do not start SYNC-03 outbox, object/event transfer, attachments, snapshots, conflicts, or realtime.
- Keep `com.lifeos.desktop`, Tauri/WebView storage identity, release settings, and user data intact.

## Task 1 — Strengthen public config and hidden technical auth

**Files:**

- Modify `src/infrastructure/sync/supabase/createLifeOsSupabaseClient.ts` and test.
- Add `src/application/sync/ports/TechnicalSyncAuth.ts`.
- Add `src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.ts` and test.
- Add `src/infrastructure/sync/supabase/TauriSupabaseAuthStorage.ts` and test.
- Modify `.env.example` only if another public variable is required.

1. Write tests that require on-demand anonymous sign-in, one stable anonymous session per
   installation, refresh/persistence, no email/password UI, no construction-time network, and
   typed connection errors.
2. Replace the dormant client auth settings with custom persistent storage and token refresh while
   preserving `detectSessionInUrl: false`.
3. Store only the Supabase auth session in its dedicated native secure slot. Never accept or expose
   LifeOS crypto slots through this adapter.
4. Prove missing config/auth leaves the ordinary application usable.

## Task 2 — Persist non-secret device and membership metadata

**Files:**

- Modify `src/infrastructure/persistence/records/SyncStoreRecords.ts`.
- Add `src/application/sync/ports/SyncInstallationRepository.ts`.
- Add `src/application/sync/ports/SyncDeviceCacheRepository.ts`.
- Add `src/infrastructure/sync/IndexedDbSyncInstallationRepository.ts` and test.
- Add `src/infrastructure/sync/IndexedDbSyncDeviceCacheRepository.ts` and test.

1. Write restart-persistence and corruption tests for one stable UUID device identity, public key,
   platform/name, local setup state, `spaceId`, membership status, current epoch, recovery
   confirmation, snapshot reference, and rotation state.
2. Extend the existing v20 records without changing their key paths or creating a parallel source
   of truth. Do not bump the DB version unless a required index is proven necessary.
3. Treat Supabase membership/epoch as authoritative when online and the device cache as stale when
   offline. Missing private material for an existing device fails closed and never silently creates
   a replacement identity.

## Task 3 — Implement native SecureKeyStore and crypto

**Files:**

- Modify `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/src/lib.rs`.
- Add `src-tauri/src/secure_key_store/{mod.rs,windows.rs,android.rs}`.
- Add `src-tauri/src/sync_crypto.rs` and `src-tauri/src/sync_commands.rs`.
- Add `src-tauri/gen/android/app/src/main/java/com/lifeos/desktop/LifeOsSecureStoragePlugin.kt`.
- Add Rust/native tests next to these modules and Android instrumented tests when executable.
- Add `src/application/sync/ports/SyncCryptoService.ts`.
- Add `src/infrastructure/sync/crypto/TauriSyncCryptoService.ts` and adapter tests.

1. Start with Rust tests for X25519 compatibility, correct/wrong recipient, every authenticated
   metadata field, tampered ciphertext, nonce size/freshness, deterministic separated recovery
   derivations, and recovery-envelope failure with the wrong root.
2. Implement X25519 + HKDF-SHA256 + XChaCha20-Poly1305 with OS CSPRNG and AAD containing
   `protocolVersion`, `spaceId`, `recipientDeviceId`, `keyEpoch`, and `purpose`.
3. Implement an internal typed `SecureKeyStore`: user-scoped DPAPI ciphertext in app-local files on
   Windows; non-exportable Android Keystore AES-256/GCM key and versioned encrypted blobs in
   `noBackupFilesDir` on Android. All corruption/missing-key paths fail closed; zeroize plaintext.
4. Expose only high-level commands for identity/setup, key-ring wrap/unwrap, rotation, recovery,
   friendly-name encryption, QR payload generation, and the dedicated auth-session slot. Never
   expose a generic secret read command to the WebView.
5. Combine native command handlers with the existing Android updater handlers instead of replacing
   them.

## Task 4 — Add the application Sync workflow

**Files:**

- Add `src/application/sync/SyncModels.ts`.
- Add `src/application/sync/ports/SyncTrustTransport.ts`.
- Add `src/application/sync/SyncApplicationService.ts` and test.
- Modify `src/application/index.ts`.
- Add `src/infrastructure/sync/UnavailableSyncApplicationService.ts`.
- Add `src/app/composition/createLifeOsSyncApplication.ts` and test.
- Modify `src/app/composition/LifeOsApplication.ts`, `createLifeOsApplication.ts`, and exports.
- Modify `src/infrastructure/index.ts`.

1. Write workflow tests for first-device setup, recovery confirmation, invite create/cancel/expiry,
   pending claim/envelope/ack, refresh/cache/offline, device rename, revoke/epoch rotation, retry of
   incomplete rotation, and recovery replacement device.
2. Require a verified pre-sync snapshot before first-space setup.
3. Ensure first setup and recovery are explicit; setup cannot become configured until recovery is
   confirmed saved.
4. Keep all network activity user-initiated or limited to a visible pairing/setup operation; dispose
   owned timers/listeners on close.
5. Add a preservation test comparing all domain records before/after every SYNC-02 workflow and
   asserting no ordinary outbox/event/object/attachment/snapshot transfer is created.

## Task 5 — Add narrow Supabase RPC/RLS state machines

**Files:**

- Add `supabase/migrations/20260904000000_sync_02_devices_e2ee.sql`.
- Add `supabase/tests/database/sync_02_devices_e2ee_test.sql`.
- Add `supabase/tests/integration/sync_02_pairing.integration.test.ts` if a controlled two-client
  environment is available.
- Modify `supabase/config.toml` to mirror hosted anonymous sign-in configuration.

1. Write pgTAP assertions first: anonymous technical JWT only; active/foreign/pending/revoked
   access; no direct table DML; RPC privileges/search paths; invite expiry/cancel/one-time claim;
   forbidden transitions; recovery-verifier misuse; rotation/finalization rules.
2. Add integrity checks/composite foreign keys for public keys, nonces, encrypted names, recovery
   fields, invite claims, envelope purposes, and persisted rotation state.
3. Implement narrow security-definer RPCs for first space, invite create/cancel/claim, pending list,
   envelope publish/fetch/ack, recovery begin/complete, device name, device list, revoke+epoch bump,
   and rotation finalize. Each validates `auth.uid()`, anonymous claim, ownership, state, epoch, and
   exact caller/target relationship under row locks.
4. Keep pending access to its own membership/envelope RPC only; retain active-only RLS for normal
   tables and zero access for revoked devices. Store only hashes/verifiers/ciphertexts/public data.
5. Add a two-session claim-race proof when tooling permits; do not substitute a single transaction
   as evidence of race safety.

## Task 6 — Implement Supabase transport and pairing payloads

**Files:**

- Add `src/infrastructure/sync/supabase/SupabaseSyncTrustTransport.ts` and test.
- Add `src/application/sync/PairingPayload.ts` and test.

1. Define a versioned payload with project identity, invite ID, raw one-time secret, trusted device
   ID, and server expiry only. Reject unknown version/project, malformed IDs/secrets, and expiry.
2. Map every operation to a single narrow RPC, validate returned rows before application use, and
   avoid direct writes/table reads outside permitted membership reads.
3. Ensure raw invite secret exists only in the short-lived payload/UI memory and is never persisted
   or logged.

## Task 7 — Build the Sync UI shell and QR/camera flow

**Files:**

- Add `src/presentation/sync/SyncPage.tsx`, controller/model helpers, and tests.
- Add `src/presentation/styles/sync.css` and import it from the existing style entry point.
- Modify `src/presentation/pages/MorePage.tsx` and tests.
- Modify `src/app/ApplicationShell.tsx` and shell tests.
- Modify `src-tauri/gen/android/app/src/main/AndroidManifest.xml` for camera permission.

1. Write pure UI/controller tests for loading, not configured, setup, recovery confirmation,
   configured, cached offline, pairing countdown/cancel/pending/error/success, recovery import,
   devices, revoke confirmation, and rotation pending.
2. Add `Синхронизация` only inside More and pass only the application facade into Presentation.
3. Generate QR from the short-lived pairing payload. On Android, request camera only after the user
   presses Scan; use a maintained platform scanning path and provide manual payload entry.
4. Show real membership data, current device and epoch diagnostics, honest local-only copy, and the
   revocation warning that downloaded data is not erased remotely. Disable self-revoke.
5. Apply the feature design spec at desktop/mobile breakpoints and preserve focus, keyboard,
   reduced motion, safe areas, and 44 px targets.

## Task 8 — Focused verification and refinement

1. Run targeted TypeScript tests for every changed contract and integration boundary.
2. Run Rust crypto and Windows secure-store tests with the repository toolchain.
3. Run Android unit/instrumented tests when a device/emulator is available; otherwise record the
   exact unresolved evidence and do not claim PASS.
4. Run local Supabase reset/pgTAP and controlled pairing/recovery tests when CLI/database access is
   available. Apply the additive migration to project `oytsyvmlkngsmpevbbct` only after authorized
   linking; never use service-role in LifeOS.
5. Perform browser QA at `1600×900`, `1280×720`, `390×844`, and `360×800`, including focus and
   console; refine only SYNC-02 UI.

## Task 9 — Consolidated STOP gate

1. Run the required secret scan over tracked source and generated test artifacts.
2. Run `npm run verify`, followed by `npm run test:e2e` because SYNC-02 changes persistence,
   application composition, browser interaction, and mobile flows.
3. Build Windows Tauri production and Android production targets with the existing toolchains.
4. Execute the real Windows ↔ Galaxy A23 pairing/revoke/rotation gate when the phone is available;
   pause for one precise camera action if required.
5. Run `git diff --check`, inspect the complete diff/status, confirm existing user data preservation,
   and obtain independent read-only final review.
6. Report `PASS` only if all 22 STOP items have fresh evidence. Otherwise report `PARTIAL` or
   `BLOCKED` with exact unresolved items. Stop without starting SYNC-03.

## Self-review against the approved task

- All required SYNC-02 scopes are mapped to explicit files and tests.
- Supabase remains public-key-only and RPC/RLS-controlled; no direct client DML or service role.
- Windows DPAPI and Android Keystore are real OS-backed mechanisms; no plaintext fallback exists.
- Recovery uses separated derivations and a ciphertext-only server envelope.
- Pairing is one-time, expiring, cancellable, and pending-first.
- Revocation immediately blocks membership and persists an incomplete rotation until all remaining
  recipients and recovery envelope are covered.
- Ordinary LifeOS domain state, local saves, and offline startup remain independent of Supabase.
- No SYNC-03 data engine, attachments, snapshots upload, conflicts, or realtime is included.
- Required hosted, native, browser, build, physical-device, security, and regression evidence is
  explicit; missing external evidence cannot be mislabeled PASS.
