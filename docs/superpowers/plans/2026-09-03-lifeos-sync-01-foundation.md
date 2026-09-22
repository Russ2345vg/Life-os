# LifeOS SYNC-01 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the local data-safety and dormant Supabase foundations required by SYNC-01 without enabling synchronization or changing existing LifeOS behavior.

**Architecture:** Keep IndexedDB as the interactive source of truth. Add one additive v20 migration for isolated technical sync stores, define application-level registry/snapshot contracts with infrastructure implementations, and keep the Supabase client factory completely outside application composition. Store a locally durable, checksummed raw-record snapshot so legacy fields survive exactly; create reproducible locked-down SQL migrations without initiating cloud traffic.

**Tech Stack:** TypeScript 6, IndexedDB/fake-indexeddb, Vitest, Web Crypto SHA-256, Supabase JS v2, PostgreSQL/Supabase migrations, pgTAP.

**Spec:** `C:/Users/Руслан/Downloads/LifeOS_Sync_v1_Design.md` and `C:/Users/Руслан/Downloads/LifeOS_SYNC_01_Codex_Task.md`

## Global Constraints

- Implement SYNC-01 only; do not add pairing, E2EE keys, push/pull engines, realtime, conflict resolution, attachment transfer, or sync UI.
- Preserve all existing IndexedDB records byte-for-structured-clone value; do not rename, delete, rebuild, clear, or backfill existing domain stores.
- Keep all product mutations local-only and do not wire Supabase into `App`, `LifeOsApplicationProvider`, `createLifeOsApplication`, repositories, commands, or pages.
- Do not place service-role keys, database passwords, management tokens, signing secrets, or real project values in tracked files.
- Do not modify the current public LifeOS version, updater channel, Tauri identifier, Android package identity, or unrelated release/UI work.
- Preserve the pre-existing dirty worktree. This plan uses inline execution and test checkpoints; it does not create commits in the shared WIP branch.
- The existing `docs/codex/PROJECT_MAP.md` persistence section is stale; the authoritative current implementation is `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts` at version 19.

---

### Task 1: Define the real Sync Registry and localStorage policy

**Files:**

- Create: `src/application/sync/SyncRegistry.ts`
- Create: `src/application/sync/SnapshotService.ts`
- Modify: `src/application/index.ts`
- Create: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Create: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`
- Create: `src/infrastructure/sync/LifeOsLocalStoragePolicy.ts`
- Create: `src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts`

**Interfaces:**

- Produces: `SyncRegistry`, `SyncEntityRegistration`, `SyncEntityType`, `SnapshotService`, `LocalSnapshotReference`, and `SnapshotVerification` application contracts.
- Produces: `LIFE_OS_SYNC_REGISTRY` with exactly the 21 discovered durable record families and `LIFE_OS_LOCAL_STORAGE_POLICY` with five known keys plus default-deny behavior.
- Consumes: existing `LIFE_OS_STORE` names, repository/mappers, and the five current localStorage constants.

- [ ] **Step 1: Write the failing registry test**

  Assert literal entity identifiers for the 21 real durable records, unique store mappings, stable `id` sources, journal's missing record schema signal, the deterministic recommendation ID note, goal/walk inline attachment fields, and no technical sync store registration. The production break caught is accidental omission, duplication, or invention of a sync entity.

- [ ] **Step 2: Run the registry test and confirm RED**

  Run: `npm run test:target -- src/infrastructure/sync/LifeOsSyncRegistry.test.ts`

  Expected: fail because `LifeOsSyncRegistry` does not exist.

- [ ] **Step 3: Add the minimal application registry contract and static infrastructure registry**

  Use a readonly registration shape equivalent to:

  ```ts
  export interface SyncEntityRegistration {
    readonly entityType: string;
    readonly storeName: string;
    readonly stableIdField: 'id';
    readonly recordSchemaVersion: number | null;
    readonly localRepository: string;
    readonly applyMode: 'repository' | 'unit_of_work' | 'append_only';
    readonly deletionMode: 'none' | 'archive' | 'soft_delete' | 'guarded_delete';
    readonly dependencies: readonly string[];
    readonly attachmentFields: readonly string[];
    readonly readiness: 'registered' | 'requires_later_adapter';
  }
  ```

  Registry metadata is descriptive only: it must not read, write, wrap, or observe repositories.

- [ ] **Step 4: Run the registry test and confirm GREEN**

  Run: `npm run test:target -- src/infrastructure/sync/LifeOsSyncRegistry.test.ts`

- [ ] **Step 5: Write the failing localStorage policy test**

  Assert an empty whole-key sync allowlist, explicit classification of all five known keys, field-level `eveningRitual` as requiring a future adapter, updater/selection/filter/sidebar state as local-only or technical, and `classifyLocalStorageKey('unknown') === 'deny_unknown'`. The production break caught is implicit wholesale synchronization.

- [ ] **Step 6: Run the policy test and confirm RED**

  Run: `npm run test:target -- src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts`

- [ ] **Step 7: Implement the explicit default-deny policy and snapshot projection**

  Expose a pure `classifyLifeOsLocalStorageKey(key)` function and `projectMeaningfulLocalSettings(raw)` that returns only a validated `eveningRitual` JSON projection or `null`. Do not change the existing settings adapters.

- [ ] **Step 8: Run both registry/policy tests and confirm GREEN**

  Run: `npm run test:target -- src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts`

### Task 2: Add additive IndexedDB v20 technical sync stores

**Files:**

- Create: `src/infrastructure/persistence/records/SyncStoreRecords.ts`
- Modify: `src/infrastructure/persistence/records/index.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`

**Interfaces:**

- Produces: `LIFE_OS_DATABASE_VERSION = 20`, `LIFE_OS_DOMAIN_STORE`/existing `LIFE_OS_STORE` for the unchanged 21 domain stores, and a separate `LIFE_OS_SYNC_STORE` for the ten technical stores. Keeping the constants separate prevents existing domain-only transactions from accidentally including sync infrastructure.
- Produces: typed records for `sync_outbox`, `sync_object_meta`, `sync_cursor`, `sync_conflicts`, `sync_device_cache`, `sync_attachment_queue`, `sync_snapshot_meta`, `sync_settings`, `sync_quarantine`, and `sync_applied_events`.
- Consumes: the existing sequential `oldVersion < N` migration convention.

- [ ] **Step 1: Add a failing literal-v19 migration preservation test**

  Build a literal version-19 database containing one hand-authored representative record in every one of the 21 existing stores. Open it with `LifeOsIndexedDb` and assert every original `getAll()` result is deeply equal, all ten required technical stores exist and are empty, and no local/cloud side effect occurs.

- [ ] **Step 2: Run the IndexedDB test and confirm RED**

  Run: `npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`

  Expected: the adapter remains v19 and technical stores are absent.

- [ ] **Step 3: Define focused technical record types**

  Use store-specific primary keys (`eventId`, `objectId`, `spaceId`, `conflictId`, `deviceId`, `attachmentId`, `snapshotId`, `id`, `quarantineId`, `eventId`). Keep encrypted payload fields typed as strings/byte-compatible values without cryptographic behavior. `SyncSnapshotMetaRecord` additionally owns the local serialized snapshot payload and checksum required in Task 3.

- [ ] **Step 4: Implement one v20 migration**

  Add a single `createVersionTwentySchema(database)` call guarded by `oldVersion < 20`. Create only the ten requested stores and minimal operational indexes (`state/status/object/entity/createdAt/appliedAt` where later lookup is required). Add no default settings record and do not touch a domain store transaction.

- [ ] **Step 5: Run the IndexedDB test and confirm GREEN**

  Run: `npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`

### Task 3: Implement durable verified local pre-sync snapshots

**Files:**

- Create: `src/infrastructure/sync/IndexedDbSnapshotService.ts`
- Create: `src/infrastructure/sync/IndexedDbSnapshotService.test.ts`

**Interfaces:**

- Implements: `SnapshotService.createPreSyncSnapshot()` and `SnapshotService.verifySnapshot(snapshotId)`.
- Consumes: `LifeOsIndexedDb`, `LIFE_OS_DOMAIN_STORE`, `LIFE_OS_SYNC_REGISTRY`, `LIFE_OS_SYNC_STORE.snapshotMeta`, existing `Clock`/`IdGenerator`, optional `KeyValueStorage`, and Web Crypto SHA-256.
- Produces: a durable `sync_snapshot_meta` record containing format version 1, DB name/version, required store manifest, exact raw structured-clone records, projected meaningful local settings, total record count, SHA-256, and verified timestamps/status.

- [ ] **Step 1: Write failing snapshot behavior tests**

  Cover: one logically consistent readonly transaction across all registered domain stores; raw legacy fields retained; goal/walk inline media retained; only the `eveningRitual` settings projection included; domain records unchanged after creation; one verified metadata record stored; checksum tampering returns `checksum_mismatch`; missing required store returns `incomplete`; unknown/missing snapshot returns `not_found`.

- [ ] **Step 2: Run the snapshot test and confirm RED**

  Run: `npm run test:target -- src/infrastructure/sync/IndexedDbSnapshotService.test.ts`

- [ ] **Step 3: Implement deterministic snapshot serialization and verification**

  Sort stores by name, retain each store's IndexedDB key ordering, recursively sort object keys for checksum serialization, and hash UTF-8 bytes with `crypto.subtle.digest('SHA-256', ...)`. Verify format/database/store manifest and record count before accepting the digest. Never provide a restore/apply method in SYNC-01.

- [ ] **Step 4: Run snapshot tests and confirm GREEN**

  Run: `npm run test:target -- src/infrastructure/sync/IndexedDbSnapshotService.test.ts`

### Task 4: Add a dormant public Supabase client boundary

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`
- Create: `src/infrastructure/sync/supabase/SupabaseConfig.ts`
- Create: `src/infrastructure/sync/supabase/SupabaseConfig.test.ts`
- Create: `src/infrastructure/sync/supabase/createLifeOsSupabaseClient.ts`
- Create: `src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts`

**Interfaces:**

- Produces: `readSupabasePublicConfig(env)` returning `null` when both public values are absent and rejecting partial/invalid configuration.
- Produces: `createLifeOsSupabaseClient(config, dependencies?)` with session persistence, automatic token refresh, and URL session detection disabled. No realtime subscription is created, and the factory remains outside startup composition.
- Consumes: only `VITE_LIFEOS_SUPABASE_URL` and `VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY`; no module-level environment read or singleton construction.

- [ ] **Step 1: Write failing configuration and zero-network construction tests**

  Assert absent config is disabled, partial config fails closed, remote non-HTTPS URLs fail while local loopback HTTP remains testable, public key is never logged, and constructing the client with a throwing fetch spy performs zero fetch/WebSocket calls. The production break caught is accidental startup/auth transport.

- [ ] **Step 2: Run client tests and confirm RED**

  Run: `npm run test:target -- src/infrastructure/sync/supabase/SupabaseConfig.test.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts`

- [ ] **Step 3: Install the official supported v2 client**

  Run: `npm install @supabase/supabase-js@2.112.4`

  Preserve all existing package and lockfile changes; do not modify other dependency versions.

- [ ] **Step 4: Implement the dormant parser/factory and public env example**

  `.env.example` contains names and empty values only:

  ```dotenv
  VITE_LIFEOS_SUPABASE_URL=
  VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY=
  ```

  Do not import the factory from any startup/composition/product module.

- [ ] **Step 5: Run client tests and confirm GREEN**

  Run: `npm run test:target -- src/infrastructure/sync/supabase/SupabaseConfig.test.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts`

### Task 5: Create reproducible locked-down Supabase foundation migrations

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260903000000_sync_01_foundation.sql`
- Create: `supabase/tests/database/sync_01_foundation_test.sql`

**Interfaces:**

- Produces: `sync_spaces`, `devices`, `pairing_invites`, `key_envelopes`, `sync_events`, `sync_objects`, `device_cursors`, `attachment_metadata`, and `snapshot_metadata`.
- Produces: private helper schema/function for active-device membership checks, RLS policies for authenticated active membership, default denial for anon/unapproved/revoked identities, and private `lifeos-attachments`/`lifeos-snapshots` buckets with membership-scoped storage policies.
- Does not produce: auth users, device identities, invitations, cloud content, realtime publication, RPC pairing/recovery transitions, or seed data.

- [ ] **Step 1: Write pgTAP tests before the migration**

  Assert all nine tables exist; every table has RLS forced/enabled; anon has no table privileges; no table exposes plaintext title/content/body/filename columns; `sync_events.event_id` is unique and `sequence` is identity/monotonic; both buckets exist with `public = false`; unauthenticated reads/writes return no rows or permission denial; and storage policies do not contain unconditional true expressions.

- [ ] **Step 2: Add the minimal SQL migration**

  Use UUID primary/object identifiers, positive key epochs, revisions/base revisions, ciphertext/nonce `bytea`, tombstone boolean, server timestamps, and `bigint generated always as identity` event sequence. Hash-only invite/recovery authorization fields are allowed; raw secrets and plaintext LifeOS content columns are forbidden. Revoke broad grants and create only active-device membership policies through a locked `security definer` helper with an empty `search_path`.

- [ ] **Step 3: Add private storage buckets and scoped policies**

  Insert/update only the two supported `storage.buckets` rows with `public = false`. Policies on `storage.objects` accept only UUID-shaped `<spaceId>/...` paths in those buckets and require active membership; no public URL/read/write policy is added.

- [ ] **Step 4: Run local Supabase tests when the environment supports them**

  Run: `supabase db reset` then `supabase test db`.

  Current audit result: CLI and linked project are absent, so this step records `NOT-YET-EXTERNAL` unless the environment becomes available during execution. Do not weaken policies or invent credentials.

### Task 6: Document the audited foundation and reproducible operations

**Files:**

- Create: `docs/sync/SYNC_01_LOCAL_DATA_MAP.md`
- Create: `docs/sync/SYNC_01_DATA_CLASSIFICATION.md`
- Create: `docs/sync/SYNC_01_SUPABASE_FOUNDATION.md`
- Create: `docs/sync/SYNC_01_OPERATIONS.md`

**Interfaces:**

- Documents the actual v19 → v20 schema, all existing stores/indexes/migrations/repositories/mappers/stable IDs/schema signals, media placement, explicit sync/local-only/requires-adapter classifications, SQL/RLS/storage model, and exact local verification commands.
- Records that hosted project creation/linking is external and that normal startup remains disconnected.

- [ ] **Step 1: Write the four concise repository documents from audited evidence**

  Include the 21-store table, ten technical stores, five localStorage keys with empty whole-key allowlist/default deny, inline media notes, no existing backup/restore finding, Supabase CLI/project status, migration paths, and safe command sequence.

- [ ] **Step 2: Cross-check docs against code constants and tests**

  Manually compare entity/store counts and names against `LIFE_OS_DOMAIN_STORE`, `LIFE_OS_SYNC_STORE`, registry entries, and SQL table names. Fix discrepancies in the docs or code before stage verification.

### Task 7: Stage-level verification and STOP gate

**Files:**

- Inspect only: all SYNC-01 changed files plus current `git diff`/status.

**Interfaces:**

- Produces: evidence for the final SYNC-01 status without starting SYNC-02.

- [ ] **Step 1: Run the combined targeted local tests**

  Run:

  ```text
  npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts src/infrastructure/sync/IndexedDbSnapshotService.test.ts src/infrastructure/sync/supabase/SupabaseConfig.test.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts
  ```

- [ ] **Step 2: Run a tracked-secret scan**

  Inspect tracked files for Supabase service-role JWT markers, database password variables/values, management tokens, PEM/private-key material, keystore additions, and updater signing material. Confirm `.env.example` has names and empty values only. Treat test fixtures as unsafe too; do not store realistic secrets in fixtures.

- [ ] **Step 3: Run the one stage quality gate**

  Run: `npm run verify`

- [ ] **Step 4: Run the required migration/backward-compatibility E2E gate**

  Explain that this stage changes IndexedDB schema and compatibility, then run: `npm run test:e2e`.

- [ ] **Step 5: Run Git hygiene and review the complete patch**

  Run: `git diff --check`, `git diff --stat`, `git diff --name-status`, and `git status --short`. Distinguish SYNC-01 files from pre-existing user changes and verify no product UI/composition/import path enables Supabase.

- [ ] **Step 6: Apply the LifeOS quality gate and stop**

  Report `PASS` only if local migration, snapshot, registry, runtime boundary, security scan, `npm run verify`, E2E, and runnable Supabase policy tests pass. If the only unmet evidence is hosted/local Supabase setup, report `BLOCKED_EXTERNAL_SUPABASE_SETUP`, give one precise user action, and stop without SYNC-02.
