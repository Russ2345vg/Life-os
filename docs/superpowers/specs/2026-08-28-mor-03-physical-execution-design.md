# MOR-03 Physical Activation Execution — Design

## Goal and boundary

MOR-03 turns the accepted MOR-02 current-morning plan into a real, reload-safe execution flow.
The user starts a non-empty plan, records or explicitly skips each planned set, pauses and resumes
the overall execution, advances between sets manually, reviews the factual summary, and completes
Physical activation. Completion advances the accepted Morning Center to the next stage.

MOR-03 reuses the existing `MorningCycle`, `ExerciseDefinition` catalog, daily physical plan,
current-date guard, optimistic compare-and-swap persistence, and Morning Center route. It does not
create a second morning engine, a second exercise catalog, or a generic fitness subsystem.

This version deliberately excludes:

- rest timers;
- automatic transitions between sets;
- sensor or gesture repetition counting;
- per-set stopwatch/countdown controls;
- workout history screens, personal records, charts, streaks, analytics, or recommendations;
- automatic load progression;
- edits to the MOR-02 plan after execution starts.

The visual source of truth remains the accepted MOR-01/MOR-02 application, the approved written
MOR-03 design in this document, and `docs/codex/UI_RULES.md`. There is no node-specific Figma URL
or approved MOR-03 image in the active worktree, so pixel-perfect fidelity cannot be claimed and
handoff requires manual visual review.

## Existing integration map

- Morning route: `#/routine/morning?date=…` → `ApplicationShell` → `RoutinePage` →
  `MorningCenterPage`.
- Physical planning view: `MorningPhysicalActivationPage`.
- Morning mutations: `MorningCycleApplicationService` → `MorningCycle` →
  `MorningCycleRepository`.
- Morning persistence: the existing `morningCycles` IndexedDB store and
  `MorningCycleRecordMapper`.
- Physical stage status: `NOT_CONFIGURED`, `READY`, `IN_PROGRESS`, `DONE`, or `SKIPPED`.
- MOR-02 already locks plan editing for `IN_PROGRESS`, `DONE`, and `SKIPPED`.

`MorningCycle` already exposes coarse `startPhysical` and `completePhysical` transitions, but no
application command currently calls them and no set facts are stored. The current MOR-02 CTA is a
presentation-only acknowledgement. MOR-03 replaces that acknowledgement with persisted execution.

The accepted `ActionSession` time model is a reference for timestamp and pause invariants only.
MOR-03 does not reuse `ActionSession`, because that aggregate belongs to one `LifeAction` and has
no exercise or set semantics. `RoutineOccurrenceExecution` is likewise owned by a scheduled
routine occurrence and is not a morning exercise execution.

## Chosen ownership model

One optional `MorningPhysicalExecution` value is embedded in the owning `MorningCycle`.

This is preferred over a separate execution aggregate and IndexedDB store because the daily plan,
physical status, execution facts, cycle version, and updated timestamp must change atomically.
Embedding them preserves the existing two-attempt CAS boundary and avoids a cross-aggregate unit
of work. Future morning history can read completed facts from historical morning cycles without
introducing a second source of truth.

The dependency flow remains UI → Presentation → Application → Domain. Infrastructure maps the
embedded value. React owns only transient input and pending/error state; it never mutates execution
objects directly and never maintains an authoritative elapsed counter.

## Domain model

`MorningPhysicalExecution` contains:

- `startedAt`;
- nullable `completedAt`;
- nullable `pausedAt`;
- closed, non-overlapping pause intervals;
- `activeSetIndex`;
- one ordered execution entry for every set in the locked MOR-02 plan.

The ordered set list is created once when execution starts. Each entry is identified by
`exerciseDefinitionId + setNumber`, retains its measurement type, and has one of these forms:

```ts
type MorningPhysicalSetExecution =
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly setNumber: number;
      readonly measurementType: 'REPETITIONS';
      readonly status: 'PENDING';
      readonly actualReps: null;
      readonly resolvedAt: null;
    }
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly setNumber: number;
      readonly measurementType: 'REPETITIONS';
      readonly status: 'COMPLETED';
      readonly actualReps: number;
      readonly resolvedAt: Date;
    }
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly setNumber: number;
      readonly measurementType: 'DURATION';
      readonly status: 'PENDING';
      readonly actualDurationSeconds: null;
      readonly resolvedAt: null;
    }
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly setNumber: number;
      readonly measurementType: 'DURATION';
      readonly status: 'COMPLETED';
      readonly actualDurationSeconds: number;
      readonly resolvedAt: Date;
    }
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly setNumber: number;
      readonly measurementType: 'REPETITIONS' | 'DURATION';
      readonly status: 'SKIPPED';
      readonly resolvedAt: Date;
    };
```

Targets remain only in `physicalPlanItems`. Execution entries store facts, not duplicate planned
targets. The read model joins an execution entry with the locked plan item to show planned versus
actual values. Exercise names remain owned by `ExerciseDefinition` and are resolved through the
single catalog, including archived definitions referenced by an existing plan.

`activeSetIndex` is persisted because the approved flow does not advance automatically. Resolving
a set leaves the index unchanged and shows its recorded result. The explicit advance command moves
to the next entry. Refresh therefore restores both the factual result and the exact confirmation
or active-input state the user last saw.

## Domain invariants and transitions

### Start

Starting requires:

- an active, started `MorningCycle` for the current date;
- physical status `READY`;
- a non-empty, valid plan;
- no existing normal execution.

Start expands the plan in plan order and set-number order, creates only pending entries, sets
`activeSetIndex` to zero, records `startedAt`, and changes physical status to `IN_PROGRESS` in one
aggregate mutation. Repeating start after a successful start is idempotent only when it addresses
the same existing execution; it never creates duplicate set entries.

### Pause and resume

Pause is allowed only for a running, incomplete execution. It records `pausedAt`. Resume closes
the open pause interval at the supplied time and clears `pausedAt`. Repeated pause or resume in the
same state is idempotent. Times must be valid and monotonic; pause intervals cannot overlap.

No command that resolves or advances a set is allowed while paused. Leaving the screen does not
pause automatically. Elapsed working time at a supplied `now` is calendar elapsed time minus
closed pauses and the current open pause. No mutable duration field is persisted and no command is
written once per second.

### Resolve and advance

Only the entry at `activeSetIndex` can be resolved. A pending repetitions entry accepts integer
`actualReps` in `1…1000`; a pending duration entry accepts integer `actualDurationSeconds` in
`1…3600`. Zero is represented by explicit `SKIPPED`, not by a fabricated completed result.
Measurement types cannot be mixed.

Completing or skipping records one fact and `resolvedAt` but does not move the index. Repeating the
same command against a resolved entry is rejected rather than overwriting history. Advance
requires the current entry to be resolved and a following entry to exist. It increments the index
exactly once. The final entry has no advance action.

### Complete

Completing Physical activation requires:

- physical status `IN_PROGRESS`;
- every execution entry resolved as `COMPLETED` or `SKIPPED`;
- the active index positioned on the final entry;
- no previously completed execution.

Completion is allowed from running or paused state. If paused, the open interval closes at
`completedAt`. The same mutation writes `completedAt`, changes physical status to `DONE`, updates
`physicalUpdatedAt`, and increments the `MorningCycle` version. A second completion is idempotent.

The existing whole-stage `SKIPPED` fact remains compatible with Morning Center, but MOR-03 adds no
new in-execution “discard workout” flow. Once execution starts, the user resolves individual sets
or returns later to continue.

## Legacy compatibility

Newly created `IN_PROGRESS` and `DONE` cycles follow the execution invariants above. Rehydration
must still accept records created before MOR-03:

- `READY` with no execution remains an editable MOR-02 plan;
- `DONE` or `SKIPPED` with no execution remains a valid coarse historical fact and projects a
  read-only “details were not recorded” state;
- legacy `IN_PROGRESS` with no execution is recoverable only when the plan is non-empty.

For legacy `IN_PROGRESS`, the query exposes `canRecover`. A focused recovery command creates
pending set entries from the existing locked plan, using `physicalUpdatedAt` (or `updatedAt` when
absent) as `startedAt`. It does not pretend any set was completed. Empty-plan legacy
`IN_PROGRESS` is read-only and reports that execution cannot be restored safely.

This compatibility is explicit rather than silently downgrading `IN_PROGRESS` to `READY` or
inventing actual results.

## Persistence

`MorningCycleRecord` gains optional nullable `physicalExecution`. Its nested record contains ISO
timestamps, pause intervals, `activeSetIndex`, and discriminated set records. Missing or explicit
legacy-null means no detailed execution.

The `morningCycles` object store, indexes, and repository contract are unchanged, so IndexedDB does
not need a new store or database version. `schemaVersion: 1` remains valid because the new field is
optional and backward-compatible. The mapper validates all known nested fields, discriminants,
timestamps, set identity/order, result compatibility, and active-index bounds; malformed known
data fails fast.

`cloneMorningCycle` and every getter return defensive deep copies of the execution, pause
intervals, result timestamps, and set entries. Concurrent Quick Start or later morning mutations
cannot erase execution facts.

Persistence coverage proves:

- legacy missing/null records reopen;
- normal running, paused, awaiting-advance, and completed executions round-trip;
- actual repetitions and seconds never cross fields;
- malformed times, indexes, duplicates, and incompatible results fail;
- reopening IndexedDB restores the exact active position without elapsed-time drift.

## Application contracts

`MorningCycleApplicationService` remains the sole mutation boundary and gains current-date
commands for:

- `startPhysicalExecution(date)`;
- `recoverPhysicalExecution(date)`;
- `pausePhysicalExecution(date)`;
- `resumePhysicalExecution(date)`;
- `completePhysicalSet(date, exerciseDefinitionId, setNumber, actual)`;
- `skipPhysicalSet(date, exerciseDefinitionId, setNumber)`;
- `advancePhysicalExecution(date)`;
- `completePhysicalExecution(date)`.

Every command uses the existing current-local-date guard and two-attempt CAS mutation. The set
identity supplied by presentation must match the aggregate's current entry; stale tabs receive
the existing understandable concurrent-change error after retry rather than recording a result
against the wrong set.

A focused `GetMorningPhysicalExecutionOverview` joins the cycle, plan, execution, and definitions.
It returns immutable presentation data for:

- availability and recovery state;
- running/paused/completed state;
- elapsed working time at a supplied `now`;
- exercise count, total set count, resolved and skipped counts;
- current exercise, set number, planned target, and optional actual result;
- whether the UI can pause, resume, resolve, advance, or finish;
- read-only historical details.

Duration calculation delegates to pure domain execution methods. React may refresh the displayed
`now` approximately once per second, but it never increments a stored counter and never issues a
persistence command for ticking.

`GetMorningCenterOverview` adds only the small execution projection needed by the stage card:
`IN_PROGRESS` shows `Выполняется · <resolved> из <total> подходов` and an action to continue.
`DONE` remains the only completed physical fact and advances the current stage. Until completion,
the accepted Morning Center progress percentage does not claim that Physical activation is done.

## Navigation and refresh restoration

The morning route gains an optional presentation-only query value:

```text
#/routine/morning?date=YYYY-MM-DD&view=physical-execution
```

`RoutineRoute` parses and builds the value only for the morning section. Unknown values are
ignored safely. `ApplicationShell` owns the route state and passes the selected morning view and a
view-change callback through `RoutinePage` to `MorningCenterPage`; components do not write
`window.location` directly.

Starting or continuing execution writes the execution view into browser history. Refresh on that
URL reloads authoritative execution data and restores the exact active or awaiting-advance set.
The back control removes the view parameter and returns to Morning Center without pausing.

If the route requests execution but no normal or recoverable execution exists, the page shows a
neutral load/error state with `Вернуться к плану`; it does not manufacture an execution. After
successful final completion the route returns to Morning Center and focus moves to the next stage
card. A historical date may open completed facts read-only, but it exposes no mutation controls.

## Presentation flow

The MOR-02 `Начать выполнение` button stops using local `planAcknowledged` state. It calls the
persisted start command and navigates only after success. While pending it is disabled and reads
`Начинаем…`; failures remain inline without losing the plan.

The execution page uses the accepted graphite/gold LifeOS language and contains:

1. return navigation and stage label;
2. compact overall header with elapsed working time and running/paused state;
3. factual progress (`Упражнение N из M`, `Подход X из Y`, resolved total);
4. current exercise name and planned target;
5. one native numeric input labelled `Фактически` for repetitions or seconds;
6. primary `Завершить подход` and secondary `Пропустить подход`;
7. pause/resume control for the overall execution.

The actual input starts empty for every pending set. Planned values are shown as context but are
not prefilled or silently saved as facts. Client-side affordances may constrain native input, but
the domain remains authoritative for integer, type, and bounds validation.

After resolution, the input/actions are replaced by a compact confirmation showing planned versus
actual, or an explicit skipped state. A non-final set exposes `Следующий подход`; no timer or
effect advances automatically. On the final resolved set the page shows a factual summary and
`Завершить физическую активацию`.

The summary contains only real facts from this execution: completed sets, skipped sets, total
actual repetitions, total actual duration seconds, and worked elapsed time. It does not invent
calories, performance scores, records, historical comparison, or trend claims.

Paused execution freezes the displayed worked time and disables resolve/advance controls until
resume. Pending commands coherently disable their affected controls. Load, retryable load error,
running, paused, pending set, resolved-awaiting-advance, ready-to-finish, completed read-only,
recoverable legacy, and unrecoverable legacy states are explicit.

## Responsive and accessibility rules

Desktop may use a compact two-area layout: current set and progress list, with the primary controls
kept visible. Mobile uses one column: overall status → current set → input/actions → plan progress.
The primary action panel remains above the fixed LifeOS navigation and respects
`env(safe-area-inset-bottom)` without covering the last result or input.

Required browser sizes are 1600×900, 1280×720, 390×844, and 360×800. Acceptance includes no page
or component horizontal overflow, controls at least 44 pixels high, visible gold focus, native
labels and status announcements, logical keyboard order, long custom exercise names, active-input
scrolling with a mobile keyboard, and reduced-motion behavior.

Green is used only for confirmed completed facts, gold for current priority and primary actions,
red only for errors/destructive meaning, and no permanent purple or excessive glow is introduced.

## Error and concurrency behavior

Domain/application errors use user-facing Russian messages and stable internal codes. The UI must
distinguish load failure, invalid actual input, stale current set, paused-operation rejection,
concurrent change, unavailable exercise definition, and legacy recovery failure.

Input text remains available after validation or persistence failure. A successful command always
reloads or uses the returned authoritative execution before enabling the next action. Double
activation is blocked by pending state and remains safe through domain idempotency/CAS.

Closing the tab, navigating elsewhere, or refreshing does not lose results. The overall timer is
reconstructed from timestamps. No background interval mutates domain or IndexedDB state.

## Verification strategy

TDD begins with domain tests and proceeds outward:

- execution creation from repetitions and duration plans;
- stable set ordering and identity;
- pause intervals, elapsed calculation, monotonic time, and pause/resume idempotency;
- result discriminants and numeric bounds;
- explicit skip, manual advance, final completion, and illegal transitions;
- plan locking and physical status consistency;
- legacy normal, recoverable, and unrecoverable states;
- mapper/record defensive copies and IndexedDB reopen round trips;
- current-date guards, CAS retry, stale-set rejection, and composition wiring;
- execution and Morning Center read models;
- route parsing/building and refresh restoration;
- presentation loading/error/running/paused/resolved/completed states;
- MOR-01/MOR-02 regressions, including unchanged planning persistence and custom definitions.

The targeted MOR-03 E2E scenario:

1. starts the morning and reaches a saved two-exercise MOR-02 plan;
2. starts execution and verifies the plan is locked;
3. records a repetitions result;
4. confirms no automatic advance and explicitly opens the next set;
5. pauses, verifies worked time does not grow, refreshes, and resumes;
6. records a duration result and explicitly skips one set;
7. navigates to Morning Center and continues the same execution;
8. refreshes the execution route and restores the exact position;
9. resolves all sets, completes Physical activation, and verifies the next Morning Center stage;
10. reopens the completed date read-only;
11. checks the four required viewports, focus, touch targets, safe area, horizontal overflow, and
    browser console/page errors.

The implementation runs focused `test:target` commands first, `npm run test:fast` for the broad
cross-layer change, `npm run typecheck`, `npm run lint`, and targeted MOR-03 E2E during
stabilization. Before handoff it runs the remaining applicable TEST_MATRIX suites and one full
`npm run verify`, not repeated without a new reason. Final Git hygiene includes `git diff --check`,
complete diff review, and `git status --short`.

Handoff reports actual command evidence, browser states/viewports, the absence of an approved
pixel reference, any remaining manual QA, and a running local URL. It does not push and does not
start MOR-04.
