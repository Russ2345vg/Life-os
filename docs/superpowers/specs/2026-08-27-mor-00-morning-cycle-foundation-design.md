# MOR-00 Morning Cycle Foundation — Design

## Goal and boundary

MOR-00 strengthens the existing `MorningCycle` aggregate and its existing persistence path so one calendar day has one stable morning run with an explicit lifecycle. The patch does not add MOR-01 screens or behavior, does not create a parallel action/scheduling engine, and does not duplicate `LifeAction`, `Decision`, `Project`, `TomorrowPlan`, or `RoutineBlock` data.

The user-facing morning route and the current Morning overview remain unchanged. The new foundation is domain, application, and persistence work only.

## Existing integration map

- Morning routine → `#/routine/morning?date=…` → existing Routine presentation.
- Morning routine → Today through existing Day, TomorrowPlan, LifeAction, and Routine occurrence read models.
- Morning routine → `LifeAction` by stable action id; `LifeAction` → `Decision` by `decisionId`; `Decision` → `Project` by `projectId`.
- Main action → `TomorrowPlan.firstActionId`, with the existing active-main-Decision fallback.
- Scheduled time → existing effective `RoutineBlock` occurrence assigned to an existing action.
- Morning facts → existing `MorningCycleRepository` → existing `morningCycles` IndexedDB store.

`MorningCycle` owns only morning-run facts. It does not own action titles, expected results, first steps, project or decision data, schedule intervals, day lifecycle, or routine execution history.

## Domain model

The existing `MorningCycle` gains an explicit lifecycle:

- `NOT_STARTED`
- `IN_PROGRESS`
- `READY_TO_WORK`
- `FINISHED`
- `ABANDONED`

`shortenedMode` is a separate boolean technical marker, defaulting to `false`. MOR-00 persists the marker but exposes no command or UI to activate shortened behavior.

The aggregate also stores generic managed-stage snapshots. Each snapshot contains a non-empty stable `stageId`, one status (`PENDING`, `ACTIVE`, `COMPLETED`, `SKIPPED`, or `NOT_APPLICABLE`), and an optional `updatedAt`. MOR-00 does not predeclare MOR-01…MOR-06 stages and does not expose stage-transition commands. This keeps persistence extensible without implementing future workflow rules early.

Lifecycle commands are idempotent:

- `start(at)` moves `NOT_STARTED` to `IN_PROGRESS` once;
- `markReadyToWork(at)` moves `IN_PROGRESS` to `READY_TO_WORK` once;
- `finish(at)` moves `READY_TO_WORK` to `FINISHED` once;
- `abandon(at)` moves `IN_PROGRESS` or `READY_TO_WORK` to `ABANDONED` once.

`finishedAt` records either terminal transition. Only `IN_PROGRESS` and `READY_TO_WORK` are active. Existing water and physical facts remain intact for compatibility; MOR-00 does not expand physical activity behavior.

## Current versus previous unfinished run

The current run is an active `MorningCycle` whose `dateKey` equals the current local calendar date. The repository can find the latest active run strictly before a supplied date. The application returns these as two separate values:

- `current`: active run for the current date, or `null`;
- `previousUnfinished`: latest active run from an earlier date, or `null`.

An earlier run never becomes the current run after the date changes. A dedicated idempotent application command can abandon the earlier run without weakening the existing current-date restriction on ordinary morning mutations. Starting today still uses the unique per-date record and therefore cannot create a duplicate.

## Persistence and legacy recovery

The existing IndexedDB database, store, and unique `byDayId`/`byDateKey` indexes remain authoritative. No store or database-version bump is needed.

New records continue using `schemaVersion: 1` with the additional fields `state`, `finishedAt`, `shortenedMode`, and `stageStates`. The mapper reads older schema-version-1 records safely:

- missing lifecycle derives as `NOT_STARTED` when `startedAt` is null, otherwise `IN_PROGRESS`;
- missing `finishedAt` becomes `null`;
- missing `shortenedMode` becomes `false`;
- missing `stageStates` becomes an empty list.

Explicit nulls for optional legacy-compatible values are accepted where the record contract permits them. Invalid known fields still fail fast rather than silently manufacturing state. Domain values and dates are defensively copied on rehydration and repository reads.

The IndexedDB stale-run query uses the existing `byDateKey` index in descending order and returns the first active aggregate before the boundary date. Finished and abandoned records are skipped.

## Application boundary

`MorningCycleApplicationService` remains the only mutation boundary. It gains:

- a current-context query returning current and previous unfinished runs separately;
- current-date `markReadyToWork` and `finish` commands;
- a date-addressed `abandonUnfinished` command for an existing active run.

All mutations reuse optimistic compare-and-swap and the existing aggregate id. Repeated commands return the already persisted state without creating records or changing the original terminal timestamp.

Progress, next-stage selection, and remaining-time formulas are intentionally absent. Future work can derive them from the aggregate in one domain/application service without placing business rules in React.

## Verification

Tests cover lifecycle invariants, stable identity, idempotent transitions, terminal activity, defensive stage persistence, mapper round-trip, legacy record defaults, reload through IndexedDB, previous-day separation, stale-run abandonment, and existing Routine/Today regressions. Completion requires the full project quality gate from `docs/codex/TEST_MATRIX.md` plus diff and status inspection.
