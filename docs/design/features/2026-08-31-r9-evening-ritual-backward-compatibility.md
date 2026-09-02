# R9 — Evening Ritual v2 backward compatibility

## Scope

R9 is a persistence and compatibility gate for Evening Ritual v2. It must prove that data written by E1–E11 remains readable after the R3–R8 additive changes. R9 does not redesign the Evening UI, add R11 analytics, or start R10.

The active worktree contains no standalone R1 report or `LifeOS_Evening_Ritual_v2_Architecture_Spec.md`. The authoritative legacy baseline is therefore the historical Git record contracts and the current E1–E11 persistence tests.

## Design contract

```text
FEATURE
→ Backward compatibility proof for Evening Ritual v2

USER GOAL
→ Preserve all E1–E11 Evening data, links, history and refresh recovery

EXISTING LOGIC
→ IndexedDB, record mappers, repositories, history reader and analytics queries

PAGE/COMPONENT ARCHETYPE
→ Business-logic-only compatibility gate; no new UI

SECTION COLOR / MAIN VISUAL CENTER
→ N/A

COMPONENTS TO REUSE
→ Existing persistence adapters, GetEveningHistory/GetEveningAnalytics and completed-history UI

MOBILE BEHAVIOR
→ Unchanged

APPROVED REFERENCE
→ NO

TEST SCOPE
→ Literal E1–E11 snapshots, upgrade, rollback, idempotency, read models, history and refresh
```

## Schema decision

No Evening-specific IndexedDB schema migration is required.

| Contract                       | Before R9                                                                               | After R9           |
| ------------------------------ | --------------------------------------------------------------------------------------- | ------------------ |
| IndexedDB version              | `19`                                                                                    | `19`               |
| `eveningCycles` key/indexes    | `id`; unique `byDayId`, unique `byDateKey`, `byState`                                   | unchanged          |
| `tomorrowPlans` key/indexes    | `id`; unique `byCycleId`, unique `byTargetDateKey`, `byStatus`                          | unchanged          |
| `preparationPlans` key/indexes | `id`; unique `byCycleId`, unique `byTomorrowPlanId`, unique `byTargetDayId`, `byStatus` | unchanged          |
| Evening record schema          | `schemaVersion: 1`                                                                      | `schemaVersion: 1` |

R3–R8 record changes are additive optional fields:

- `EveningCycleRecord.skipReason`;
- boolean/number Reflection answers in addition to legacy strings;
- `EveningCycleRecord.relaxation`;
- `EveningCycleRecord.sleepCheck`;
- `PreparationItemRecord.recommendedDurationMinutes`.

Existing mappers already define compatibility defaults for absent optional fields. Rewriting old records would create risk without adding information and could fabricate historical facts.

## Migration strategy

R9 uses a no-rewrite compatibility strategy:

1. Insert literal records matching the historical E1–E11 contracts into a legacy database.
2. Open that database through the current `LifeOsIndexedDb` upgrade path.
3. Assert that raw Evening records and their identifiers/links are unchanged.
4. Read them through current repositories and history/analytics projections.
5. Close and reopen to emulate refresh recovery.
6. Open repeatedly to prove idempotency and absence of duplicates.
7. Force an upgrade failure and prove IndexedDB's versionchange transaction preserves the old version and data.
8. Reject malformed partial nested records instead of silently synthesizing history.

Because R9 introduces no data-writing migration, an interrupted R9 itself cannot leave partially migrated Evening data. Atomic failure coverage applies to the existing IndexedDB version upgrade transaction.

## Compatibility matrix

| Legacy concern                                  | Expected current behavior                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| EveningCycle in progress / SHUTDOWN / COMPLETED | Rehydrates with the original state and completion                         |
| Legacy `mode: SKIPPED`                          | Reads as normal mode with skipped completion through the existing adapter |
| Reflection records                              | Legacy string/string-array/null answers remain readable                   |
| Missing relaxation/sleep-check                  | Read as absent; no fabricated facts                                       |
| TomorrowPlan                                    | Original `cycleId`, target day/date and status remain linked              |
| PreparationPlan                                 | Original cycle/tomorrow/target-day links and required items remain linked |
| Missing recommended duration                    | Reads as `null` without rewriting the record                              |
| Analytics/history                               | Old cycles remain included through the current history reader             |
| `dayId` / `dateKey`                             | Preserved byte-for-byte and indexed lookup still works                    |
| Refresh/reopen                                  | Same records and read model are restored                                  |
| Repeated upgrade/open                           | No duplicate records or new Evening facts                                 |
| Partial malformed nested write                  | Controlled compatibility error; no partial read model                     |
| Failed upgrade                                  | Versionchange transaction aborts and legacy database/data remain intact   |

## Test boundaries

The primary evidence is one cross-store compatibility test using literal legacy snapshots rather than current domain builders. Existing focused repository, presentation and settings tests remain regression support.

Production code changes are allowed only if the RED test demonstrates a concrete compatibility defect. No database version bump or record rewrite will be added without such evidence.

## Risks

- IndexedDB has no foreign keys; link safety is enforced by stored identifiers and reader joins, so tests must cover every cross-store link explicitly.
- Corrupt legacy records cannot always be repaired without inventing facts; controlled rejection is safer than silent coercion.
- The active worktree also contains an unrelated v19 Morning schema change. R9 must verify upgrade behavior without taking ownership of or redesigning that migration.
- Full browser E2E cannot enumerate every historical record shape; literal fake-indexeddb integration tests are the authoritative compatibility evidence, with E2E used for startup/refresh regression.
