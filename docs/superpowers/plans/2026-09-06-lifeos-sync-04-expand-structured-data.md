# LifeOS SYNC-04 Expand Structured Data Implementation Plan

> **For agentic workers:** execute this plan task-by-task with strict TDD. The primary agent owns all edits in the current dirty worktree; do not create a second sync engine and do not start SYNC-05.

**Goal:** Extend the existing SYNC-03 local-first encrypted event engine from Direction, Project, and Goal to every real structured LifeOS record currently persisted in IndexedDB, plus the allowlisted Evening Ritual preference, while excluding photos/files.

**Architecture:** Keep `PilotSyncCoordinator`, push/pull transport, crypto, Outbox, cursor, HLC, conflicts, tombstones, quarantine, and Supabase schema as the single engine. Broaden its protocol and executable registry view to the actual `LIFE_OS_SYNC_REGISTRY`; each adapter validates through the existing persistence mapper, removes receiver-local `version` and attachment payloads from semantic comparison, restores receiver-local optimistic versions on remote apply, exposes dependency references, and uses the existing deferred-event retry path. Existing repositories and unit-of-work transactions record Outbox entries atomically through the shared recorder; localStorage uses an explicit projected settings record plus restart reconciliation because localStorage cannot participate in an IndexedDB transaction.

**Tech Stack:** TypeScript 6, IndexedDB, Vitest/fake-indexeddb, existing Supabase encrypted event RPCs, existing Tauri crypto and production builds.

**Spec:** `C:/Users/Руслан/Downloads/LifeOS_SYNC_04_Codex_Task.md` and approved `C:/Users/Руслан/Downloads/LifeOS_Sync_v1_Design.md`

**Execution record (2026-09-07):** implementation and regression details are recorded in
`docs/sync/SYNC_04_REPORT.md`. The original checklist below describes the intended stage, not a
claim that the STOP gate passed. An independently populated database can contain distinct IDs
that collide on existing unique domain indexes; that unresolved identity policy blocks PASS.
No ID rewrite, bulk overwrite, release or SYNC-05 work is authorized or performed as a workaround.

## Global Constraints

- Preserve all current user data and every uncommitted SYNC-01/02/03 change in `D:/LifeOS-App`.
- Reuse the existing event envelope, Outbox, cursor, conflict, tombstone, crypto, device/RLS, and Supabase schema.
- Never send `GoalRecord.coverImage`, `WalkRecord.photo`, blobs, file data, or attachment bytes in SYNC-04.
- Local saves complete without network; remote apply must not create Outbox echo events.
- Stable `id` values and logical date strings are preserved exactly; equal titles never imply identity.
- Archive, complete, cancel, dismiss, and soft-delete fields remain normal upserts; only physical deletes create tombstones.
- No new dependencies, release publication, source push, storage clearing, device identity change, SYNC-05, or SYNC-06 work.

---

### Task 1: Freeze the repository-aware data contract

**Files:**

- Create: `docs/sync/SYNC_04_STRUCTURED_DATA_MAP.md`
- Modify: `src/application/sync/SyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Test: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`
- Test: `src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts`

**Interfaces:**

- Produces: the complete `SyncEntityType` union, executable readiness for 21 IndexedDB record types, attachment exclusions, deletion semantics, and a documented localStorage allowlist.

- [ ] Add failing registry tests that require all 21 `LIFE_OS_STORE` values to be covered exactly once, require every real structured type to be executable for SYNC-04, require the real dependency graph, and require `coverImage`/`photo` attachment fields to remain excluded.
- [ ] Add failing policy tests requiring `lifeos.local-settings.v1` to allow only `eveningRitual`, while sidebar, selection, filters, updater, and unknown keys remain local/denied.
- [ ] Update the registry types and registrations minimally; do not add absent Habit/Template stores.
- [ ] Write `docs/sync/SYNC_04_STRUCTURED_DATA_MAP.md` with SYNC NOW, LOCAL ONLY, DERIVED, DEFER TO SYNC-05, and ABSENT classifications plus the dependency graph.
- [ ] Run `npm run test:target -- src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts` and require PASS.

### Task 2: Generalize the existing protocol and registry adapters

**Files:**

- Modify: `src/application/sync/pilot/PilotSyncProtocol.ts`
- Modify: `src/application/sync/ports/PilotSyncStore.ts`
- Modify: `src/application/sync/ports/PilotSyncTransport.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`
- Test: `src/application/sync/pilot/PilotSyncProtocol.test.ts`
- Test: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`

**Interfaces:**

- Produces: `PilotEntityType` as the backward-compatible name for every executable `SyncEntityType`; `StructuredRuntimeRegistration` bindings with `normalize`, `prepare`, and concrete relationship references.
- Consumes: mapper round-trips from `src/infrastructure/persistence/mappers/*RecordMapper.ts`.

- [ ] Add RED protocol cases for Decision, Life Action, Journal, Routine, Walk, Sphere, Day/Planning, Morning/Evening, and unsupported/future schema payloads.
- [ ] Add RED adapter table cases for all 21 real stores: stable ID, schema version, mapper validation, semantic equality despite receiver-local `version`, preserved logical dates/references, and attachment omission for Goal/Walk.
- [ ] Expand the current protocol allowlist without changing envelope version 1 or transport metadata.
- [ ] Bind every executable registration to its existing mapper. For Journal, validate via `JournalEntryRecordMapper`; its wire schema remains payload schema 1 even though the legacy record omits a `schemaVersion` field.
- [ ] Add exact reference extraction for required parent edges and treat optional/orphan-safe links as non-blocking.
- [ ] Keep `prepareRemotePilotRecord` assigning local `version = existing.version + 1` (or 1) for versioned records and preserving local attachment fields; Journal stays append-only without a fabricated domain version.
- [ ] Run the two targeted files and require PASS.

### Task 3: Expand atomic local mutation capture

**Files:**

- Modify: `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Test: `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts`
- Test: existing focused repository/unit-of-work tests touched above.

**Interfaces:**

- Consumes: `recordUpsert(transaction, entityType, record)` and `recordTombstone(transaction, entityType, objectId)` from the one existing recorder.
- Produces: one atomic domain+meta+Outbox commit per changed object and one debounced coordinator notification after transaction completion.

- [ ] Add RED recorder tests for representative new types, multi-record transactions, schema selection, photo/cover omission, restart durability, and archive/complete-as-upsert.
- [ ] Broaden the recorder to the executable registry and canonical adapter output while preserving event/HLC/revision/idempotency behavior.
- [ ] Configure one repository-agnostic IndexedDB transaction boundary that expands real domain read/write transactions with the three existing mutation stores and records the final mapped object. Keep the already-proven explicit Direction/Project/Goal integrations to avoid destabilizing SYNC-03.
- [ ] For compound unit-of-work transactions, capture every final `add`/`put`/string-key `delete` exactly once inside the same transaction and notify the shared coordinator after commit.
- [ ] Record physical deletes in Routine Block, Routine Occurrence Override, Walk, and existing pilot deletes as tombstones. Preserve Decision soft delete and all archive/complete/cancel/dismiss transitions as upserts.
- [ ] Configure the shared recorder once in `createLifeOsApplication` so all production repositories/unit-of-work paths wake the same single-flight coordinator without constructor churn or parallel state.
- [ ] Run the recorder target plus the directly affected repository/UoW test files and require PASS.

### Task 4: Make bootstrap per-type and restart-safe

**Files:**

- Modify: `src/infrastructure/persistence/records/SyncStoreRecords.ts`
- Modify: `src/infrastructure/sync/pilot/PilotBootstrapService.ts`
- Test: `src/infrastructure/sync/pilot/PilotBootstrapService.test.ts`
- Test: `src/infrastructure/sync/IndexedDbSnapshotService.test.ts`

**Interfaces:**

- Produces: `structured-bootstrap` stage metadata plus `structured-bootstrap:<entityType>` completion checkpoints stored in the existing `sync_settings` store.
- Consumes: existing verified pre-sync snapshot and the ordered executable registry.

- [ ] Add RED tests proving the legacy `pilot-bootstrap` checkpoint prevents re-bootstrap of Direction/Project/Goal, each new type checkpoints independently, restart resumes at the first incomplete type, records with existing metadata are skipped, and a verified snapshot is required before the first new-type scan.
- [ ] Replace the one all-or-nothing pilot gate with per-type checkpoints in dependency order; do not requeue pilot events already completed by SYNC-03.
- [ ] Reuse one verified local snapshot for the stage and mark overall completion only after every executable type is checkpointed.
- [ ] Run bootstrap and snapshot targets and require PASS.

### Task 5: Apply all remote structured records through the existing conflict engine

**Files:**

- Modify: `src/infrastructure/sync/pilot/IndexedDbPilotSyncStore.ts`
- Modify: `src/application/sync/pilot/PilotPullEngine.ts`
- Modify: `src/application/sync/pilot/PilotConflictResolver.ts` only if a generalized type exposes a shared-engine defect.
- Test: `src/infrastructure/sync/pilot/IndexedDbPilotSyncStore.test.ts`
- Test: `src/application/sync/pilot/PilotPullEngine.test.ts`
- Test: `src/infrastructure/sync/pilot/PilotSyncFoundation.integration.test.ts`

**Interfaces:**

- Consumes: adapter store names, normalization, preparation, relationship references, schema versions, and attachment exclusions.
- Produces: remote create/update/tombstone with no echo; durable defer/quarantine; applied ledger/cursor advancement; existing deterministic `(HLC, deviceId)` conflict and losing-version history.

- [ ] Add RED table/integration cases for representative categories, missing-parent defer then replay, same-ID normalized dedup, duplicate event idempotency, conflict retention, stale tombstone anti-resurrection, and archive/complete upserts.
- [ ] Build each apply transaction from the target store, declared dependency stores, and existing technical stores; validate required parents before mutation and retain optional orphan-safe references.
- [ ] Use adapter preparation for remote records and never call repository mutation capture during remote apply.
- [ ] Keep future schema failures quarantined and local data unchanged.
- [ ] Run store, pull, conflict, and foundation integration targets and require PASS.

### Task 6: Synchronize the explicit Evening Ritual settings projection

**Files:**

- Modify: `src/infrastructure/sync/LifeOsLocalStoragePolicy.ts`
- Create: `src/infrastructure/sync/MeaningfulLocalSettingsSync.ts`
- Modify: `src/app/settings/BrowserLocalSettingsStore.ts`
- Modify: `src/infrastructure/sync/pilot/PilotBootstrapService.ts`
- Modify: `src/infrastructure/sync/pilot/IndexedDbPilotSyncStore.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Test: `src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts`
- Create: `src/infrastructure/sync/MeaningfulLocalSettingsSync.test.ts`
- Modify: `src/app/settings/BrowserLocalSettingsStore.test.ts`

**Interfaces:**

- Produces: versioned synthetic object `{ id: 'lifeos-user-settings', schemaVersion: 1, eveningRitual }` and a reconciliation hook.
- Consumes: `projectMeaningfulLocalSettings`, the shared recorder, existing `sync_settings` technical store, and `BrowserLocalSettingsStore` persistence.

- [ ] Add RED tests proving only Evening Ritual projects into the payload, save/reset wakes reconciliation, bootstrap/restart captures a missed localStorage change, remote apply merges only Evening Ritual into the existing local settings object, and UI/technical fields never propagate.
- [ ] Add the synthetic settings adapter to the same registry/engine without raw key/value mirroring or a second transport.
- [ ] Preserve localStorage failure behavior: a blocked localStorage never blocks LifeOS or cursor safety; failed remote materialization is quarantined/attention and does not overwrite other fields.
- [ ] Run the three settings targets and require PASS.

### Task 7: Wire and prove the expanded engine without a new UI section

**Files:**

- Modify: `src/app/composition/createLifeOsSyncApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsSyncApplication.test.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncFoundation.integration.test.ts`

**Interfaces:**

- Produces: the current coordinator running expanded bootstrap/push/pull and the same debounced/periodic/manual lifecycle.

- [ ] Add RED composition assertions that one recorder, one store, one coordinator, one transport, and one lifecycle serve pilot plus new types.
- [ ] Wire the expanded registry, settings projection, and all repositories to those shared instances; keep names/backward compatibility where renaming would add risk.
- [ ] Prove representative Android/Windows wire payloads are platform-neutral structured JSON and attachment-free.
- [ ] Run composition, registry, and foundation integration targets and require PASS.

### Task 8: SYNC-04 STOP gate

**Files:**

- Review all SYNC-04 changes and existing dirty-tree ownership; do not commit or push.

- [ ] Run `npm run test:target -- src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts src/infrastructure/sync/MeaningfulLocalSettingsSync.test.ts src/application/sync/pilot/PilotSyncProtocol.test.ts src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts src/infrastructure/sync/pilot/PilotBootstrapService.test.ts src/infrastructure/sync/pilot/IndexedDbPilotSyncStore.test.ts src/application/sync/pilot/PilotPullEngine.test.ts src/infrastructure/sync/pilot/PilotSyncFoundation.integration.test.ts src/app/composition/createLifeOsSyncApplication.test.ts`.
- [ ] Run the existing SYNC engine target set, including protocol, conflict, push, pull, transport, IndexedDB compatibility, snapshot, crypto, and RLS-facing client tests.
- [ ] Run available Supabase pgTAP/RLS tests through the repository-supported local Supabase command; if Docker/local Supabase is unavailable, report the exact unconfirmed prerequisite.
- [ ] Run `npm run verify` once. Because SYNC-04 changes persistence, startup, and cross-device flow, then run `npm run test:e2e` once unless `verify` fails first.
- [ ] Run web production build through `npm run build`, native Windows production build through `npm run tauri -- build --ci`, and Android production build through `npm run tauri -- android build --apk --ci --target aarch64` with the installed project toolchain and unchanged signing identity. A web build alone is not Windows production-build evidence.
- [ ] Attempt the real Windows ↔ Galaxy A23 scenarios only when both enrolled devices and Supabase are available; never substitute synthetic tests for physical-device PASS.
- [ ] Scan tracked/current files for service-role/database secrets and plaintext synthetic markers; do not inspect or report real user content.
- [ ] Run `git diff --check`, `git diff --stat`, `git diff --name-status`, inspect the complete diff, and run `git status --short`.
- [ ] Map all 32 STOP criteria to fresh evidence. Report `PASS` only if every required local, Supabase, build, and physical-device item is proven; otherwise report `PARTIAL` or `BLOCKED` with exact blockers, then stop before SYNC-05.

## Self-review

- All 21 real IndexedDB domain stores are accounted for; absent Habits and reusable-template stores are not invented.
- Goal Album is the Goal projection; Goal covers and Walk photos are explicitly excluded.
- `lifeos.local-settings.v1` is projected through an allowlist, not mirrored wholesale; all other known keys are local.
- The plan extends only the existing SYNC-03 engine and uses existing conflict, tombstone, Outbox, cursor, crypto, Supabase transport, and RLS paths.
- Local repository/UoW writes remain local-first and atomic with Outbox for IndexedDB records; localStorage is reconciled after its independent commit and again at startup.
- The dependency order and concrete relationship extraction are adapter responsibilities; missing required parents defer rather than delete.
- No SYNC-05 attachment transfer, cloud backup rotation, Recently Deleted UI, release, or source push is included.
