# SYNC-03.1 Foundation Hardening Implementation Plan

> **Execution boundary:** stabilize the existing SYNC-03 Direction / Project / Goal engine only. Do not start SYNC-04, add entity adapters, sync attachments, or introduce a second engine.

**Goal:** Close the seven approved SYNC-03.1 foundation defects while preserving all existing local data and the E2EE/RLS architecture.

**Architecture:** Keep the current local-first flow: repository transaction -> `IndexedDbPilotMutationRecorder` -> durable Outbox -> `PilotPushEngine` / `PilotPullEngine` -> conflict policy -> `IndexedDbPilotSyncStore`. Add only typed policy and persistence operations required to make this flow restart-safe. The existing `LIFE_OS_SYNC_REGISTRY` becomes the metadata source for the three already-executable pilot adapters; no non-pilot registration becomes executable.

**Stack:** TypeScript, Vitest + fake-indexeddb, IndexedDB v21-compatible additive records, Supabase PostgreSQL RPC/pgTAP, existing Tauri crypto commands.

## Safety invariants

- Never clear or bulk-rewrite IndexedDB; existing records remain readable.
- Never persist or transmit a plaintext fallback. The existing local Outbox `serializedPayload` remains the only local pre-encryption material.
- Preserve `eventId`, logical object ID, operation, revisions, HLC, and user record while rematerializing an envelope for a current device/key epoch.
- A receive cursor may advance past a child only after that complete encrypted event is durably stored as deferred.
- Permanent crypto/schema corruption remains quarantine/attention and is never treated as a causal dependency.
- Domain optimistic `version` is receiver-local and separate from sync `baseRevision`/`revision`.

## Blocker 1 — tombstone anti-resurrection

1. Extend `src/application/sync/pilot/PilotConflictResolver.test.ts` with a tombstone at N+1 and a later-HLC upsert based on N; run the targeted test and record RED.
2. Add the explicit local-tombstone ancestry guard before HLC conflict selection in `PilotConflictResolver.ts`.
3. Run the resolver target and the existing SQL tombstone assertions; record GREEN.

## Blocker 2 — rotation_pending durability

1. Add a restart regression to `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts`: active `rotation_pending` mutation commits domain/meta/Outbox, reopen the same fake database, then verify it remains pending and becomes leaseable after configuration resumes. Record RED.
2. Change the recorder eligibility contract to accept active, space-bound installations in either `configured` or `rotation_pending`; leave push gated to configured/stable.
3. Run the recorder target and affected pilot repository tests; record GREEN.

## Blocker 3 — old epoch / device identity Outbox

1. Add engine and persistent-store tests for pending old-epoch material -> current installation -> restart -> rematerialize/re-encrypt -> successful push with the same semantic event ID. Record RED.
2. Extend `PilotSyncStore` with atomic preparation and rematerialization operations. In `IndexedDbPilotSyncStore`, validate the stored canonical payload against its Outbox fields, revive a complete stale encrypted envelope for exact idempotent replay, and rematerialize only after rejection by replacing `originDeviceId`/`keyEpoch`, clearing obsolete ciphertext/nonce, and preserving semantic fields.
3. Call preparation before leasing in `PilotPushEngine`; replay a complete old envelope unchanged, then on one stale-envelope rejection rematerialize, encrypt, and retry once.
4. Add a new additive Supabase migration that lets an active same-space device acknowledge only an exact already-stored encrypted envelope before current-epoch/current-device validation, without modifying the stored event. Bind the explicit origin device, keep all validation for new events, and reject changed ciphertext, metadata, origin, or cross-space replay.
5. Add pgTAP coverage for exact old-envelope ACK, rejected changed envelope/semantics/cross-space replay, single-row immutability, and current-epoch/current-device enforcement for new events.
6. Run push/store/transport tests and relevant pgTAP; record GREEN.

## Blocker 4 — bootstrap same-ID normalized dedup

1. Add adapter tests showing equal stable IDs/business content compare equal despite receiver-local `version` and harmless `createdAt`/`updatedAt`, while changed business content is unequal. Add pull/bootstrap integration coverage for one object and zero conflicts. Record RED.
2. Define the semantic comparison in the existing pilot adapter layer; continue excluding Goal `coverImage`.
3. Preserve existing opaque transport mappings and create an opaque UUID for new mappings; never send legacy logical IDs into UUID-typed transport columns.
4. Add an `equivalent` conflict decision used only after authenticated payload validation and normalized same-ID comparison. Apply it without conflict history and deterministically converge duplicate opaque transport mappings.
5. Run adapter/bootstrap/pull/store targets; record GREEN.

## Blocker 5 — missing-parent deferred retry

1. Replace the old rejection-only relationship test and add pull order `child seq 10 -> parent seq 11`, plus reopen/replay coverage. Record RED.
2. Introduce a typed `sync.pilot_dependency_missing` error from relationship validation.
3. Extend the existing quarantine record additively with a distinct `deferred` state and the full encrypted remote envelope; do not create a new store or bump/delete the database.
4. Add store operations to persist deferred events atomically with cursor progress, list them after restart, and remove them only after successful application.
5. Refactor `PilotPullEngine` to continue after durable deferral, apply the parent, retry deferred children automatically, keep cursor monotonic, and quarantine only permanent failures.
6. Run pull/store/IndexedDB compatibility targets; record GREEN.

## Blocker 6 — stale remote ancestry / local CAS

1. Add resolver coverage for local sync revision 7 vs incoming based on 5, and store/adapter coverage that remote application never preserves a sender-local optimistic version. Record RED.
2. Make any incoming resulting revision lower than the local sync revision stale regardless of HLC; keep true same-revision concurrency on normal conflict logic.
3. On valid incoming apply, assign receiver-local domain `version = existing.version + 1` (or baseline 1 on create), while keeping payload sync revisions only in sync metadata.
4. Run resolver/adapter/store and repository CAS neighbors; record GREEN.

## Blocker 7 — central registry execution

1. Add a registry-derived runtime test with sentinel pilot-ready store metadata; record RED against the current hard-coded runtime.
2. Build the executable three-entity pilot view from `LIFE_OS_SYNC_REGISTRY`, bind only Direction / Project / Goal normalizers/preparers, and derive dependency order/store lookup from those registrations.
3. Keep all other registrations descriptive and non-executable; add no SYNC-04 adapter.
4. Run registry/adapter/bootstrap/store/composition targets; record GREEN.

## Consolidated gate

1. Run the bounded targeted SYNC foundation/pilot set.
2. Run relevant Supabase pgTAP/RLS tests when the local CLI/container are available; otherwise report the exact unavailable prerequisite as unconfirmed, never as PASS.
3. Run `npm run verify` once. Because cursor/persistence/startup behavior changes, do not separately repeat full E2E if `verify` already includes and passes it.
4. Run `git diff --check`, inspect `git diff`, `git diff --stat`, `git diff --name-status`, and `git status --short`.
5. Request independent architecture, test, and final reviews. Fix only findings inside SYNC-03.1 and rerun the affected gate.
6. Produce the exact approved SYNC-03.1 report and STOP before SYNC-04.
