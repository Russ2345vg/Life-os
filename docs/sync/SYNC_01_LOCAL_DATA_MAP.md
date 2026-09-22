# SYNC-01 current local data map

Source audited on 2026-09-03: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`, current records/mappers/repositories, and application composition. Historical `docs/codex/PROJECT_MAP.md` still describes v8 and is not authoritative for Sync.

## IndexedDB

- Database: `lifeos`.
- Before SYNC-01: version 19, 21 domain stores.
- After SYNC-01: version 20, the same 21 domain stores plus 10 isolated technical sync stores.
- All domain stores use `keyPath: id`. Migration 20 does not open or mutate a domain store.

| Version | Additive schema change                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `days` (`byDate` unique), `decisions` (`byPlannedDate`), `lifeActions` (`byPlannedDate`, `byDecisionId`), `actionSessions` (`byLifeActionId`, `byStatus`) |
| 2       | `routineBlocks` (`byAnchorDate`)                                                                                                                          |
| 3       | `routineOccurrenceOverrides` (`byOccurrence` unique, `byTargetDate`)                                                                                      |
| 4       | `routineOccurrenceExecutions` (`byOccurrence` unique, `byStatus`)                                                                                         |
| 5–6     | `walks` (`byDate`, then `byStatus`)                                                                                                                       |
| 7       | `spheres` (`byNormalizedName` unique, `byStatus`)                                                                                                         |
| 8       | `journal` (`byEffectiveDate`, `byOccurredAt`, `bySubjectId`, `bySphereId`)                                                                                |
| 9–10    | `directions` (`bySphereId`, `byStatus`), `projects` (`bySphereId`, `byDirectionId`, `byStatus`), then `decisions.byProjectId`                             |
| 11      | `eveningCycles` (`byDayId` unique, `byDateKey` unique, `byState`)                                                                                         |
| 12      | `tomorrowPlans` (`byCycleId` unique, `byTargetDateKey` unique, `byStatus`)                                                                                |
| 13      | `preparationPlans` (`byCycleId`, `byTomorrowPlanId`, `byTargetDayId` unique, `byStatus`), `preparationRules`                                              |
| 14      | `recommendationApplications` (`byStatus`)                                                                                                                 |
| 15      | `morningCycles` (`byDayId` unique, `byDateKey` unique)                                                                                                    |
| 16–17   | `goals` (`byStatus`, then `byDirectionId`)                                                                                                                |
| 18      | `walkCaptures` (`byWalkId`, `byStatus`)                                                                                                                   |
| 19      | `exerciseDefinitions` (`byNormalizedName` unique) and five fixed system seeds                                                                             |
| 20      | ten empty technical stores listed below                                                                                                                   |

Technical stores are separate from `LIFE_OS_STORE`, so existing domain-only transaction lists remain unchanged.

| Store                   | Key path       | Indexes                        |
| ----------------------- | -------------- | ------------------------------ |
| `sync_outbox`           | `eventId`      | `byState`, `byObjectId`        |
| `sync_object_meta`      | `objectId`     | `byEntityType`, `bySyncStatus` |
| `sync_cursor`           | `spaceId`      | none                           |
| `sync_conflicts`        | `conflictId`   | `byObjectId`, `byResolvedAt`   |
| `sync_device_cache`     | `deviceId`     | `bySpaceId`, `byStatus`        |
| `sync_attachment_queue` | `attachmentId` | `byState`, `byParentObjectId`  |
| `sync_snapshot_meta`    | `snapshotId`   | `byKind`, `byCreatedAt`        |
| `sync_settings`         | `id`           | none                           |
| `sync_quarantine`       | `quarantineId` | `byEntityType`, `byCreatedAt`  |
| `sync_applied_events`   | `eventId`      | `byAppliedAt`                  |

## Persistence contracts

- Records: `src/infrastructure/persistence/records/`; all 21 durable families have a top-level record type.
- Mappers: `src/infrastructure/persistence/mappers/`; every family has a mapper.
- Repositories and atomic units of work: `src/infrastructure/persistence/IndexedDb*.ts`.
- Composition authority: `src/app/composition/createLifeOsApplication.ts`; it opens only `LifeOsIndexedDb` and current local repositories.
- Record schema signal: `schemaVersion: 1` on every store except `journal`. Journal entries are append-only and currently have no record schema version.
- Aggregate `version` fields are optimistic local versions, not sync revisions.

All stored entities have an `id`. New user-created IDs normally come from `crypto.randomUUID()` through `CryptoIdGenerator`; default spheres and system exercise definitions have fixed IDs. Journal IDs come from domain event IDs. Recommendation application IDs are deterministic hashes of recommendation inputs. SYNC-01 never regenerates an existing ID.

## Existing backup/media state

There was no export, import, backup, restore, file snapshot, Blob repository, or File System Access implementation before SYNC-01. The new `IndexedDbSnapshotService` therefore reads raw records in one readonly transaction, writes a non-trusted `pending` snapshot record, verifies it, and only then marks it `verified` in `sync_snapshot_meta`; it exposes no restore method. A process interruption can leave an orphaned `pending` record, but verification never accepts it.

- Goal covers are inline `goals.coverImage` data URLs.
- Walk photos are inline `walks.photo` data URLs.
- Walk captures are text records, not media blobs.
- No separate attachment store or filesystem path exists.

The snapshot record keeps the original IndexedDB structured-clone payload, including inline media and legacy `Date`, `Blob`, `ArrayBuffer`, typed-array, `Map`, `Set`, `RegExp`, `bigint`, and `undefined` values. A separate deterministic tagged representation is hashed with SHA-256; cyclic or non-structured-clone values fail creation instead of being silently dropped. The payload stays in local IndexedDB and is never uploaded by SYNC-01.
