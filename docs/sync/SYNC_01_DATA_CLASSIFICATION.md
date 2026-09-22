# SYNC-01 data classification

`LIFE_OS_SYNC_REGISTRY` is an architecture registry only. It does not observe product mutations, create outbox events, apply remote objects, or perform network traffic.

## Durable records

| Entity type                    | Store / local apply path                              | ID and schema                    | Deletion/lifecycle      | Dependencies and media                        |
| ------------------------------ | ----------------------------------------------------- | -------------------------------- | ----------------------- | --------------------------------------------- |
| `day`                          | `days` / `IndexedDbDayRepository`                     | UUID, schema 1                   | lifecycle only          | optional sphere                               |
| `decision`                     | `decisions` / `IndexedDbDecisionRepository`           | UUID, schema 1                   | soft delete + restore   | project, sphere                               |
| `life_action`                  | `lifeActions` / `IndexedDbLifeActionRepository`       | UUID, schema 1                   | lifecycle/archive       | decision, sphere                              |
| `action_session`               | `actionSessions` / `IndexedDbActionSessionRepository` | UUID, schema 1                   | lifecycle only          | life action                                   |
| `routine_block`                | `routineBlocks` / `IndexedDbRoutineBlockRepository`   | UUID, schema 1                   | guarded physical delete | life action                                   |
| `routine_occurrence_override`  | `routineOccurrenceOverrides` / repository             | UUID, schema 1                   | guarded physical delete | routine block, life action                    |
| `routine_occurrence_execution` | `routineOccurrenceExecutions` / repository            | UUID, schema 1                   | lifecycle only          | routine block                                 |
| `walk`                         | `walks` / `IndexedDbWalkRepository`                   | UUID, schema 1                   | guarded planned delete  | sphere/linked objects; inline `photo`         |
| `walk_capture`                 | `walkCaptures` / `IndexedDbWalkCaptureRepository`     | UUID, schema 1                   | lifecycle only          | walk; text only                               |
| `sphere`                       | `spheres` / `IndexedDbSphereRepository`               | fixed or UUID, schema 1          | archive/restore         | referenced widely                             |
| `journal_entry`                | `journal` / append-only repository                    | domain-event ID, no schema field | append-only             | subject/sphere; later adapter required        |
| `direction`                    | `directions` / `IndexedDbDirectionRepository`         | UUID, schema 1                   | archive/restore         | sphere                                        |
| `project`                      | `projects` / `IndexedDbProjectRepository`             | UUID, schema 1                   | lifecycle/archive       | direction, sphere                             |
| `evening_cycle`                | `eveningCycles` / repository                          | UUID, schema 1                   | lifecycle only          | day, decisions, actions                       |
| `exercise_definition`          | `exerciseDefinitions` / repository                    | fixed or UUID, schema 1          | archive                 | morning cycle references                      |
| `tomorrow_plan`                | `tomorrowPlans` / repository                          | UUID, schema 1                   | lifecycle only          | cycle/day/direction/decision/action           |
| `preparation_plan`             | `preparationPlans` / repository                       | UUID, schema 1                   | lifecycle only          | cycle/tomorrow plan/day; nested items         |
| `preparation_rule`             | `preparationRules` / repository                       | UUID, schema 1                   | active flag             | user-created configuration                    |
| `recommendation_application`   | `recommendationApplications` / repository             | deterministic ID, schema 1       | lifecycle only          | durable user response; later adapter required |
| `morning_cycle`                | `morningCycles` / repository                          | UUID, schema 1                   | lifecycle only          | day/exercise definitions; nested execution    |
| `goal`                         | `goals` / `IndexedDbGoalRepository`                   | UUID, schema 1                   | archive                 | direction; inline `coverImage`                |

The 21 entries are meaningful/durable candidates. Goal and walk media are additionally classified as attachment/media relationships for later SYNC-05 transfer. Journal and recommendation application records require explicit later adapters. None is uploaded or intercepted in SYNC-01.

Derived views are not separate sync entities: effective routine occurrences, recommendation cards/signals/patterns, history, analytics, statistics, reflection projections, morning nested execution, preparation items, and walk reentry context.

## localStorage

Whole-key sync allowlist: **empty**. Unknown keys: **deny by default**.

| Key                                | Classification               | Reason                                                                                                                                                                              |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifeos.local-settings.v1`         | requires later field adapter | Mixed record: `eveningRitual` is meaningful; navigation/density/motion/mobile display fields are device/UI preferences. The local snapshot projects only validated `eveningRitual`. |
| `lifeos.sidebar-collapsed.v1`      | UI local-only                | Transient layout preference.                                                                                                                                                        |
| `lifeos.today-action-selection.v1` | UI local-only                | Per-device/date presentation selection.                                                                                                                                             |
| `lifeos.action-list-filters.v1`    | UI local-only                | Filter state.                                                                                                                                                                       |
| `lifeos.system-update.last-check`  | technical local-only         | Updater throttling/cache marker.                                                                                                                                                    |

There are no dynamic localStorage keys and no sessionStorage use in the audited source. SYNC-01 does not change any existing localStorage adapter.

## Explicitly outside SYNC-01 registry behavior

Technical sync stores, updater state, application routing, cache/UI state, release metadata, signing material, and platform permissions are local-only. Pairing identities, keys, encrypted envelopes, tombstones, conflict versions, remote attachment objects, and cloud snapshots are later-stage data and are not created by SYNC-01 runtime.
