# SYNC-04 Structured Data Map

This map is derived from the production stores declared by `LifeOsIndexedDb` version 21 and the current repository/mappers. It classifies persisted user data for SYNC-04; it does not introduce storage for absent features.

## SYNC NOW — IndexedDB structured records

| Entity type                    | Store                         | Stable identity     | Meaningful relationships                                     | Delete semantics                                                          | Exclusions                                                                                  |
| ------------------------------ | ----------------------------- | ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sphere`                       | `spheres`                     | `id`                | none                                                         | archive is an upsert                                                      | none                                                                                        |
| `direction`                    | `directions`                  | `id`                | optional `sphereId`                                          | archive is an upsert; guarded physical delete may tombstone               | none                                                                                        |
| `project`                      | `projects`                    | `id`                | optional `sphereId`, `directionId`                           | complete/pause/archive are upserts; guarded physical delete may tombstone | none                                                                                        |
| `goal`                         | `goals`                       | `id`                | optional `directionId`                                       | archive is an upsert; physical delete tombstones                          | `coverImage` binary/data URL                                                                |
| `day`                          | `days`                        | `id`                | optional `sphereId`                                          | status transitions are upserts                                            | none                                                                                        |
| `decision`                     | `decisions`                   | `id`                | optional `projectId`, `sphereId`                             | cancel/archive/soft-delete are upserts                                    | none                                                                                        |
| `life_action`                  | `lifeActions`                 | `id`                | optional `decisionId`, `sphereId`                            | complete/cancel/archive are upserts                                       | none                                                                                        |
| `action_session`               | `actionSessions`              | `id`                | required `lifeActionId`                                      | completion/interruption are upserts                                       | none                                                                                        |
| `journal_entry`                | `journal`                     | event `id`          | optional subject and sphere references                       | append-only; corrections are new entries                                  | none                                                                                        |
| `routine_block`                | `routineBlocks`               | `id`                | optional assigned `actionId`                                 | physical delete tombstones                                                | none                                                                                        |
| `routine_occurrence_override`  | `routineOccurrenceOverrides`  | `id`                | required `routineBlockId`, optional replacement `lifeAction` | physical clear/delete tombstones                                          | none                                                                                        |
| `routine_occurrence_execution` | `routineOccurrenceExecutions` | `id`                | required `routineBlockId`                                    | status transitions are upserts                                            | none                                                                                        |
| `walk`                         | `walks`                       | `id`                | optional sphere/decision/project/routine references          | physical delete tombstones; completion/abandon are upserts                | `photo` binary/data URL                                                                     |
| `walk_capture`                 | `walkCaptures`                | `id`                | required `walkId`                                            | processing status is an upsert                                            | none                                                                                        |
| `evening_cycle`                | `eveningCycles`               | `id`                | required day; referenced Decisions/Life Actions              | completion/skip are upserts                                               | none                                                                                        |
| `tomorrow_plan`                | `tomorrowPlans`               | `id`                | cycle, source/target day, direction, Decisions, Life Actions | status transitions are upserts                                            | none                                                                                        |
| `preparation_plan`             | `preparationPlans`            | `id`                | cycle, tomorrow plan, target day, item sources               | status transitions are upserts                                            | none                                                                                        |
| `preparation_rule`             | `preparationRules`            | `id`                | none                                                         | active state is an upsert                                                 | none                                                                                        |
| `recommendation_application`   | `recommendationApplications`  | deterministic `id`  | optional target/source records                               | applied/dismissed are upserts                                             | none                                                                                        |
| `exercise_definition`          | `exerciseDefinitions`         | generated user `id` | none                                                         | archive is an upsert                                                      | built-in `SYSTEM` definitions are derived deterministic seeds; only custom definitions sync |
| `morning_cycle`                | `morningCycles`               | `id`                | required day; Exercise Definitions in plan/execution         | completion/shortening/skips are upserts                                   | transient screen animation is not stored here                                               |

## Singleton identity correction (2026-09-07)

The table's `id` is the retained physical repository ID. Exactly five types use a different
encrypted sync identity: `lifeos:singleton:<entity type>:<DayDate YYYY-MM-DD>`.

| Type                             | Logical date                                                          |
| -------------------------------- | --------------------------------------------------------------------- |
| `day`                            | `date`                                                                |
| `morning_cycle`, `evening_cycle` | `dateKey`, consistent with the referenced Day                         |
| `tomorrow_plan`                  | `targetDateKey`, consistent with target Day and source cycle/day      |
| `preparation_plan`               | referenced TomorrowPlan target date, consistent with target Day/cycle |

Remote apply resolves the local unique date index before writing, retains the existing physical
ID, translates explicit foreign/self references, and uses the unchanged HLC/revision resolver.
Equivalent content is deduplicated without a conflict. Losing versions remain in the existing
conflict store. Local optimistic versions and preparation regeneration fingerprints are not
semantic user content. Technical aliases persist in `sync_settings`, including legacy physical-ID
payload/tombstone aliases. Existing pending ciphertext is not rewritten. Transport UUIDs remain
opaque: dates and entity types are not exposed in server transport object IDs.

Routine occurrences retain their stable IDs (many blocks per date). Names/titles are never
identity. No repository IDs are mass-rewritten and no new database schema/store or engine is added.

## SYNC NOW — explicit localStorage projection

- Key: `lifeos.local-settings.v1`
- Stable object: `lifeos-user-settings`
- Allowlisted field: `eveningRitual`
- Schema: versioned structured settings object; the raw localStorage object is never mirrored.

## LOCAL ONLY

- `lifeos.sidebar-collapsed.v1` — per-device UI layout.
- `lifeos.today-action-selection.v1` — transient/per-device current selection.
- `lifeos.action-list-filters.v1` — per-device list UI state.
- `lifeos.system-update.last-check` — updater technical timestamp.
- Non-allowlisted fields in `lifeos.local-settings.v1`: `defaultSection`, `interfaceDensity`, `reduceMotion`, and `showMobileWeekday` remain per-device interface preferences.
- Unknown localStorage keys are denied by default.
- Sync installation, cursor, Outbox, conflict, device cache, snapshot metadata, quarantine, applied-event ledger, and HLC records are technical local sync state, not user content entities.

## DERIVED

- Goal Album cards/layout are projections of synchronized Goal records; no separate Goal Album store exists.
- History timelines and statistics are queries over source records; no separate authoritative analytics store exists.
- Walk analytics, streak-like statistics, morning/evening summaries, recommendations, and UI badges are recomputed from synchronized source records.
- Fixed catalogs and presentation state are code-derived unless a user-created record exists in a listed store.

## DEFER TO SYNC-05

- `GoalRecord.coverImage` bytes/data URL.
- `WalkRecord.photo` bytes/data URL.
- All future file/blob/attachment bodies and attachment queue execution.
- SYNC-04 preserves the parent structured object without claiming that the binary is transferred.

## ABSENT / NOT REAL IN THE CURRENT PRODUCT

- Habit definition/check-in store: absent.
- Separate Life Area store beyond `spheres`: absent.
- Separate Goal Album metadata store: absent.
- Separate reusable template store: absent.
- Separate planning-history or analytics aggregate store: absent.
- Arbitrary file attachment store: absent.

## Dependency order

The executable registry is topologically ordered from independent parents to dependants. Nullable references may be absent; non-null required references defer remote apply until the parent arrives. Routine occurrence history and Walk Captures deliberately retain non-null orphan-safe parent IDs after the parent has been physically deleted, including deletion before the first sync. They do not block a parent tombstone or require a fabricated parent record.

```text
sphere
  -> direction -> project
              -> goal
  -> day
day / project / sphere
  -> decision -> life_action -> action_session
routine_block -> routine_occurrence_override
              -> routine_occurrence_execution
walk -> walk_capture
day / decision / life_action -> evening_cycle
evening_cycle / day / direction / decision / life_action -> tomorrow_plan
evening_cycle / tomorrow_plan / day / life_action / project / preparation_rule -> preparation_plan
preparation_rule (independent user configuration)
tomorrow_plan / decision / preparation_plan -> recommendation_application (optional target)
exercise_definition -> morning_cycle
day -> morning_cycle
journal_entry is append-only and retains subject/correction links without inventing a parallel store
lifeos-user-settings is independent
```

This graph is an apply-order and deferral contract, not permission to cascade-delete children. Missing parents never cause child deletion.

## First-merge boundary after the singleton correction

Date-singleton collisions for the five types above are covered by logical identity/dedup tests.
This is not a policy for every unique index: routine compound occurrence keys and normalized
Sphere/custom Exercise names retain their existing domain constraints and stable IDs.
No name-based merge or deletion of unique indexes is authorized by this correction.

Preparation generation metadata has a separate unresolved compatibility boundary: sender rule
versions do not prove equivalent rule content on the receiver. Blind version rebasing can hide a
real change, while a technical version mismatch can reopen completed preparation. Legacy provenance
policy and real-device convergence remain unverified. See `SYNC_04_REPORT.md` for current evidence.

## Bootstrap and settings recovery

Bootstrap scans at most 100 stable IDs per page, rereads current records and metadata inside each
write transaction, and skips already captured records. A concurrent save or deletion is not
replaced by an old scan result. Completed SYNC-03 pilot onboarding remains honored.

Remote Evening Ritual settings stage a local-only pending-materialization marker atomically with
the settings shadow, metadata and cursor. localStorage changes only after that transaction commits.
Restart reconciliation consumes the marker, preserves intervening local edits and rejects stale
markers whose shadow has been superseded. Device-only settings are never mirrored.
