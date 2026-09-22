# LifeOS SYNC-03 Pilot Engine Implementation Plan

> **For Codex:** Execute this plan task-by-task with regression-first TDD. Stop before SYNC-04.

**Goal:** Synchronize the existing structured Direction, Project, and Goal records bidirectionally between the installed Windows LifeOS and Samsung Galaxy A23 while preserving local-first saves, E2EE, offline operation, deterministic conflicts, tombstones, existing user data, and the real Goal→Direction model.

**Architecture:** Existing application commands remain the only product mutation entry points. The three IndexedDB repositories and the existing strategic-review unit of work enlist one shared pilot mutation recorder so domain record, object metadata, persistent HLC, and durable Outbox commit in the same transaction. A coordinator encrypts immutable canonical events with the current secure-store epoch key, sends them through narrow Supabase RPCs, pulls the monotonic server event sequence, decrypts and applies through the existing Sync Registry adapters, and atomically advances the local cursor. Supabase stores ciphertext plus minimal deterministic ordering metadata only. Realtime is a private epoch-scoped wake-up hint; cursor pull remains authoritative.

**Tech Stack:** TypeScript 6, React 19, IndexedDB, Supabase/Postgres/RLS/Realtime, Tauri 2, Rust, XChaCha20-Poly1305, Vitest, pgTAP, Playwright, Android adb.

**Spec:** `C:\Users\Руслан\Downloads\LifeOS_SYNC_03_Codex_Task.md`, with `C:\Users\Руслан\Downloads\LifeOS_Sync_v1_Design.md` as source of truth.

**Approved clarifications (2026-09-04):** The user authorized a minimal revoked-device re-enrollment repair without deleting LifeOS data; the real Goal→Direction relation is authoritative and Project→Goal is not invented; pilot delete is a separate domain command and archive remains archive.

**Global constraints:** Never clear application data, uninstall either app, expose recovery material/private keys/plaintext to Supabase or logs, use a service-role key in the client, add non-pilot entity adapters, sync Goal covers/photos, change Tauri updater signing, or start SYNC-04. Preserve all existing dirty-worktree changes.

---

## Task 1: Restore the SYNC-02 physical precondition safely

**Files:**

- Modify: `src/application/sync/ports/TechnicalSyncAuth.ts`
- Modify: `src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.ts`
- Modify: `src/application/sync/SyncApplicationService.ts`
- Modify: `src/presentation/sync/SyncPage.tsx`
- Modify: `src/application/sync/SyncApplicationService.test.ts`
- Modify: `src/infrastructure/sync/supabase/SupabaseTechnicalSyncAuth.test.ts`
- Create: `src/presentation/sync/SyncPage.test.tsx`

- [ ] Add failing tests proving configured/revoked re-enrollment validates recovery material, creates and verifies a pre-sync snapshot, rotates only the anonymous technical identity/device identity, preserves domain IndexedDB, and resumes idempotently after interruption.
- [ ] Add `replaceIdentity()` to the technical-auth port using local Supabase sign-out plus a fresh anonymous identity; never touch domain stores.
- [ ] Extend recovery to stage a new device ID/public key and retain the verified snapshot reference before the remote recovery RPC.
- [ ] Reuse the existing recovery form on offline configured devices with calm warning copy; do not add a new page or expose secrets.
- [ ] Run the three targeted test files.
- [ ] Build/install the current Android APK with `adb install -r`, enter recovery only through the device UI, and prove Windows plus Android are active in the same space/current epoch before Task 2.

## Task 2: Define canonical pilot protocol and persistent HLC

**Files:**

- Create: `src/application/sync/pilot/PilotSyncProtocol.ts`
- Create: `src/application/sync/pilot/HybridLogicalClock.ts`
- Create: `src/application/sync/pilot/PilotSyncProtocol.test.ts`
- Create: `src/application/sync/pilot/HybridLogicalClock.test.ts`
- Modify: `src/application/sync/index.ts`
- Modify: `src/application/index.ts`

- [ ] Test canonical serialization independence from object property order, schema/entity validation, UUID/object identity preservation, cover exclusion, operation/base/revision invariants, and payload size limits.
- [ ] Test HLC monotonicity under equal/backward wall clocks, remote merge, overflow defense, and `(wallTime, logical, deviceId)` total ordering.
- [ ] Implement strict `direction | project | goal` upsert/tombstone envelopes with actual Goal→Direction references and no Project→Goal field.
- [ ] Implement persistent-clock state types without browser/infrastructure dependencies.

## Task 3: Upgrade existing technical stores and atomic mutation capture

**Files:**

- Modify: `src/infrastructure/persistence/records/SyncStoreRecords.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`
- Create: `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.ts`
- Create: `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbDirectionRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbProjectRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbGoalRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbJournalUnitOfWork.ts`
- Modify relevant existing repository/unit-of-work tests.

- [ ] Add a v21 migration using the existing `sync_*` stores and additive indexes for state/lease/retry/sequence; do not create a second Outbox, cursor, or registry.
- [ ] Test one readwrite transaction for domain record + object meta + immutable normalized event + HLC settings, including multi-record `isMain` changes and strategic-review writes.
- [ ] Test immediate local success while transport is unavailable and restart recovery of pending/in-flight leases.
- [ ] Enlist the recorder in all real Direction/Project/Goal write paths; notify the coordinator only after transaction completion.

## Task 4: Make the existing Sync Registry executable for the pilot

**Files:**

- Modify: `src/application/sync/SyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Create: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`
- Create: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`

- [ ] Test canonical round trips and post-decryption validation for real Direction, Project, and Goal records.
- [ ] Test dependency order Direction→Project and Direction→Goal, equal names/different IDs, local-version regeneration, and remote apply without Outbox echo.
- [ ] Test Goal `coverImage` omission, local-cover preservation on update, and null cover on remote create.
- [ ] Add explicit pilot-delete adapter operations while leaving existing archive/status semantics unchanged.

## Task 5: Add payload-specific secure-store crypto commands

**Files:**

- Modify: `src/application/sync/ports/SyncCryptoService.ts`
- Modify: `src/infrastructure/sync/crypto/TauriSyncCryptoService.ts`
- Modify: `src/infrastructure/sync/crypto/TauriSyncCryptoService.test.ts`
- Modify: `src-tauri/src/sync_crypto.rs`
- Modify: `src-tauri/src/sync_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] Add failing Rust/TypeScript tests for pilot AAD binding protocol, purpose, space, event, object, origin device, epoch, operation, revisions, and HLC.
- [ ] Add `sync_encrypt_pilot_payload` and `sync_decrypt_pilot_payload` over the existing key ring and XChaCha20-Poly1305 primitives.
- [ ] Ensure Rust never returns key bytes and TypeScript never logs plaintext/ciphertext/recovery material.
- [ ] Run targeted TypeScript tests and `cargo test sync_`.

## Task 6: Add the narrow Supabase pilot event boundary

**Files:**

- Create: `src/application/sync/ports/PilotSyncTransport.ts`
- Create: `src/infrastructure/sync/supabase/SupabasePilotSyncTransport.ts`
- Create: `src/infrastructure/sync/supabase/SupabasePilotSyncTransport.test.ts`
- Create: `supabase/migrations/20260904010000_sync_03_pilot_engine.sql`
- Create: `supabase/tests/database/sync_03_pilot_engine_test.sql`
- Create: `supabase/tests/integration/sync_03_transport.integration.test.ts`
- Modify: `src/infrastructure/sync/index.ts`
- Modify: `src/infrastructure/index.ts`

- [ ] Test active same-space/current-epoch push/pull/ack and deny foreign/pending/revoked/stale-epoch/direct-table access.
- [ ] Implement idempotent push with event-content equality checks, monotonic sequence, deterministic current-object ordering, absolute tombstone anti-resurrection, and ciphertext-only rows.
- [ ] Implement bounded `sequence ASC` pull and monotonic caller-owned cursor acknowledgement.
- [ ] Add best-effort private epoch-scoped Realtime Broadcast hints whose failure cannot roll back durable events; do not add public channels or client broadcast permission.
- [ ] Apply the additive migration to the approved Supabase project only after local pgTAP/static review passes.

## Task 7: Implement push, pull, conflict, quarantine, and tombstone engines

**Files:**

- Create: `src/application/sync/pilot/PilotConflictResolver.ts`
- Create: `src/application/sync/pilot/PilotPushEngine.ts`
- Create: `src/application/sync/pilot/PilotPullEngine.ts`
- Create: `src/application/sync/pilot/PilotConflictResolver.test.ts`
- Create: `src/application/sync/pilot/PilotPushEngine.test.ts`
- Create: `src/application/sync/pilot/PilotPullEngine.test.ts`
- Create: `src/infrastructure/sync/pilot/IndexedDbPilotSyncStore.ts`
- Create: `src/infrastructure/sync/pilot/IndexedDbPilotSyncStore.test.ts`

- [ ] Test fast-forward and concurrent `(HLC, deviceId)` convergence independent of arrival order/server sequence.
- [ ] Test immutable ciphertext retry, lease recovery, transient backoff, permanent quarantine, idempotent ACK, and no local-save rollback.
- [ ] Test atomic remote apply + conflict losing plaintext + applied ledger + merged HLC + contiguous cursor, with no Outbox echo.
- [ ] Test duplicate delivery/restart, malformed payload quarantine without cursor skipping, dependency deferral, and tombstone anti-resurrection.
- [ ] Implement only after each failing regression test is observed.

## Task 8: Bootstrap, separate pilot delete commands, and snapshots on every device

**Files:**

- Create: `src/application/sync/pilot/PilotBootstrapService.ts`
- Create: `src/application/sync/pilot/PilotBootstrapService.test.ts`
- Create: `src/application/sync/pilot/DeletePilotDirection.ts`
- Create: `src/application/sync/pilot/DeletePilotProject.ts`
- Create: `src/application/sync/pilot/DeletePilotGoal.ts`
- Add corresponding tests.
- Modify: `src/infrastructure/sync/IndexedDbSnapshotService.ts`
- Modify: `src/infrastructure/sync/IndexedDbSnapshotService.test.ts`

- [ ] Test mandatory create/read/hash verification before first bootstrap on each device and fail closed on any snapshot error.
- [ ] Encrypt the recoverable snapshot payload at rest using a high-level secure-store-backed command while keeping only non-secret verification metadata in IndexedDB.
- [ ] Test resumable bootstrap checkpoints, matching-ID dedup/conflict, unmatched-record preservation, same-name/different-ID preservation, actual dependency order, and non-UUID legacy ID handling without rewriting user IDs.
- [ ] Add explicit guarded pilot delete application commands that create tombstones atomically; existing archive commands continue to emit ordinary upserts.

## Task 9: Compose coordinator, lifecycle, status, and manual sync

**Files:**

- Create: `src/application/sync/pilot/PilotSyncCoordinator.ts`
- Create: `src/application/sync/pilot/PilotSyncCoordinator.test.ts`
- Create: `src/app/lifecycle/PilotSyncLifecycle.ts`
- Create: `src/app/lifecycle/PilotSyncLifecycle.test.ts`
- Modify: `src/application/sync/SyncApplicationService.ts`
- Modify: `src/app/composition/createLifeOsSyncApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/presentation/sync/SyncPage.tsx`
- Modify: `src/presentation/sync/SyncPage.test.tsx`
- Modify: `src/presentation/styles/sync.css`

- [ ] Test single-flight startup/resume/online/periodic/debounced/manual cycles and Realtime-as-hint-only behavior.
- [ ] Test statuses `Синхронизировано`, `Синхронизация…`, pending count, offline, attention, and retry without exposing domain content.
- [ ] Wire one coordinator to existing application composition and close it cleanly; no Android background service.
- [ ] Reuse the existing Sync page/card/button/status visual language and verify desktop/mobile keyboard/focus states.

## Task 10: Consolidated quality and real-device STOP gate

**Files:**

- Modify/add only scoped E2E scenarios under the existing E2E structure if necessary.
- Create/update non-secret evidence under `docs/sync/` only if it contains no identifiers, keys, payloads, or user content.

- [ ] Run focused pilot, persistence, crypto, transport, composition, and UI tests once.
- [ ] Run database pgTAP/RLS tests and remote integration against the configured project using only the publishable key.
- [ ] Run `npm run verify`; run the relevant/full E2E once because this stage changes persistence, startup/resume, and cross-device flows.
- [ ] Build Windows production and Android production; install Android with `adb install -r` and preserve `firstInstallTime`/data.
- [ ] Verify pre-sync snapshots on both real devices before bootstrap.
- [ ] Execute Android→Windows create, Windows→Android edit, offline different-object merge, offline same-object conflict, delete anti-resurrection, duplicate/restart/cursor, and Goal Album structured projection.
- [ ] Confirm Supabase/logs/UI contain no plaintext or keys; confirm covers/attachments and every non-pilot entity remain disabled.
- [ ] Run `git diff --check`, inspect the complete diff and `git status --short`, and stop with the exact SYNC-03 report.

---

## Self-review

- The plan extends the one existing registry, Outbox, cursor, key ring, Sync page, and Supabase client; it creates no parallel source of truth.
- All ordinary writes remain UI→Presentation→Application→Domain with Infrastructure implementing ports; React never mutates domain records.
- Re-enrollment changes only technical identity/install metadata and secure key material, never LifeOS domain stores.
- Actual Goal→Direction is preserved; Project→Goal is explicitly not invented.
- Archive remains archive/upsert; only newly authorized pilot-delete commands create tombstones.
- Goal Album remains a projection and Goal covers/photos stay local.
- Snapshot, bootstrap, remote apply, cursor, conflict, and Outbox boundaries are fail-closed and restart-safe.
- Supabase sees no entity type, relationship, title, body, name, recovery material, or key.
- Verification is scoped during development and consolidated once at the STOP gate; no SYNC-04 work is included.
