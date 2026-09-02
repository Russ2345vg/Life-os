# MOR-03 Physical Activation Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the persisted MOR-02 plan for the current morning into a reload-safe, manual set-by-set Physical activation execution that records actual results, pause intervals, skips, explicit advances, and final completion.

**Architecture:** Embed one optional `MorningPhysicalExecution` value in the existing `MorningCycle`. The aggregate expands and locks the saved plan, owns all transitions, and persists execution facts atomically through the existing two-attempt CAS repository. Focused application queries join the cycle with the existing exercise catalog; `ApplicationShell` owns the optional execution deep link, while React owns only transient input and pending/error state.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, IndexedDB/fake-indexeddb, Playwright, existing LifeOS CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-28-mor-03-physical-execution-design.md`

## Global Constraints

- Work only in `D:\LifeOS-App`; preserve the accepted, uncommitted MOR-01/MOR-01.1/MOR-02/MOR-02.1 tree and inspect `git status --short` before every editing task.
- Do not use an old LifeOS/Obsidian copy, add dependencies, push, or start MOR-04.
- Keep dependency flow UI → Presentation → Application → Domain; Infrastructure implements application ports and App composes the graph.
- Do not use `any`, mutate authoritative execution state in React, duplicate the daily plan, create a second exercise catalog, or introduce a separate execution store.
- Keep `MorningCycle` as the only aggregate and the existing `morningCycles` record/CAS write as the only persistence boundary for plan, status, and execution.
- Keep `schemaVersion: 1`; `physicalExecution` is optional/nullable and requires no IndexedDB version bump or new object store.
- Store targets only in `physicalPlanItems`, names only in `ExerciseDefinition`, and actual facts only in execution entries.
- Derive worked time from timestamps and pause intervals at a supplied `now`; never persist a ticking counter or write once per second.
- Preserve explicit manual progression: resolving a set does not advance, leaving the page does not pause, and the final set does not complete the stage automatically.
- Keep legacy `READY`, `DONE`, and `SKIPPED` records without detailed execution valid. Recover legacy non-empty `IN_PROGRESS` explicitly; never invent completed sets or actual values.
- Do not add rest timers, automatic transitions, repetition sensors, per-set timers, workout history, records, charts, streaks, analytics, recommendations, or automatic progression.
- Use the accepted MOR-01/MOR-02 visual language and `docs/codex/UI_RULES.md`: graphite base, restrained gold priority, green only for confirmed facts, red only for error/destructive meaning, minimal glow.
- The final verdict must say `Требуется ручная визуальная проверка` because the active worktree has no approved MOR-03 Figma node or image.
- The active tree already contains accepted uncommitted work. End each task with scoped `git diff --check` and diff review. Do not create implementation commits unless the user separately authorizes how the overlapping MOR-01/MOR-02 changes should be grouped.

## File and responsibility map

- `src/domain/morning-exercise/MorningPhysicalExecution.ts`: detailed execution value, result discriminants, pause intervals, elapsed calculation, and set transition rules.
- `src/domain/morning-cycle/MorningCycle.ts`: aggregate ownership, plan-to-set expansion entry point, legacy recovery, physical status consistency, and one-version-per-command mutation.
- `src/infrastructure/persistence/records/MorningCycleRecord.ts` and `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts`: optional nested record and strict backward-compatible mapping.
- `src/application/morning-cycle/MorningCycleApplicationService.ts`: current-date guard and two-attempt CAS commands.
- `src/application/queries/GetMorningPhysicalExecutionOverview.ts`: immutable execution read model joined with the existing catalog.
- `src/application/queries/GetMorningCenterOverview.ts`: small stage-card execution projection only.
- `src/presentation/routine/RoutineNavigation.ts` and `src/app/ApplicationShell.tsx`: execution deep-link parsing, history, refresh restoration, and back navigation ownership.
- `src/presentation/pages/RoutinePage.tsx` and `src/presentation/pages/MorningCenterPage.tsx`: pass the requested view and connect center/planning/execution without direct browser writes.
- `src/presentation/pages/MorningPhysicalActivationPage.tsx`: replace the MOR-02 local acknowledgement with the persisted start command.
- `src/presentation/pages/MorningPhysicalExecutionPage.tsx`: execution orchestration, transient actual input, pending/error/load state, and authoritative reload after commands.
- `src/presentation/styles/morning-physical-execution.css`: responsive graphite/gold execution layout and safe-area action panel.
- `tests/e2e/morning-center.acceptance.spec.ts`: one reload-safe MOR-03 acceptance path plus required viewport/accessibility/browser checks.

---

### Task 1: Detailed physical-execution value contract

**Files:**

- Create: `src/domain/morning-exercise/MorningPhysicalExecution.ts`
- Create: `src/domain/morning-exercise/MorningPhysicalExecution.test.ts`
- Modify: `src/domain/morning-exercise/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Produces: `MorningPhysicalExecution`, `MorningPhysicalExecutionRehydrationData`, `MorningPhysicalSetExecution`, `MorningPhysicalSetActual`, `MorningPhysicalPauseInterval`, status constants, and defensive copy/snapshot accessors.
- Consumes: `MorningPhysicalPlanItem`, `EntityId`, `ExerciseMeasurementType`, `DomainError`, and date-copy helpers.

- [ ] **Step 1: Write failing creation and ordering tests**

Prove exact plan order and set-number order without copying targets into entries:

```ts
it('expands the locked plan in exercise and set order', () => {
  const execution = MorningPhysicalExecution.start(
    [repetitionPlan('push-ups', 2, 12), durationPlan('plank', 2, 30)],
    time('07:00'),
  );

  expect(execution.sets.map(setIdentity)).toEqual([
    'push-ups:1:REPETITIONS:PENDING',
    'push-ups:2:REPETITIONS:PENDING',
    'plank:1:DURATION:PENDING',
    'plank:2:DURATION:PENDING',
  ]);
  expect(execution.activeSetIndex).toBe(0);
  expect(execution.completedAt).toBeNull();
});
```

Also assert that an empty plan, duplicate set identities, invalid set numbers, crossed actual fields, invalid dates, and an active index outside the set list are rejected.

- [ ] **Step 2: Run the execution-value target and confirm RED**

```powershell
npm run test:target -- src/domain/morning-exercise/MorningPhysicalExecution.test.ts
```

Expected: FAIL because the module and exports do not exist.

- [ ] **Step 3: Implement the strict public discriminants and class surface**

Use exact constants and a measurement-safe actual union:

```ts
export const MORNING_PHYSICAL_SET_STATUS = {
  pending: 'PENDING',
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
} as const;

export type MorningPhysicalSetActual =
  | { readonly measurementType: 'REPETITIONS'; readonly actualReps: number }
  | { readonly measurementType: 'DURATION'; readonly actualDurationSeconds: number };

export interface MorningPhysicalPauseInterval {
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export class MorningPhysicalExecution {
  public static start(
    plan: readonly MorningPhysicalPlanItem[],
    startedAt: Date,
  ): MorningPhysicalExecution;
  public static rehydrate(data: MorningPhysicalExecutionRehydrationData): MorningPhysicalExecution;
  public copy(): MorningPhysicalExecution;
  public pause(occurredAt: Date): boolean;
  public resume(occurredAt: Date): boolean;
  public completeSet(
    exerciseDefinitionId: EntityId,
    setNumber: number,
    actual: MorningPhysicalSetActual,
    occurredAt: Date,
  ): void;
  public skipSet(exerciseDefinitionId: EntityId, setNumber: number, occurredAt: Date): void;
  public advance(): void;
  public complete(occurredAt: Date): boolean;
  public workedDurationAt(now: Date): number;
}
```

`sets`, `pauseIntervals`, all date getters, and `copy()` must return defensive deep copies. Rehydration must enforce this sequence invariant: entries before `activeSetIndex` are resolved, the active entry may be pending or resolved, entries after it are pending, and a completed execution is fully resolved at the final index.

- [ ] **Step 4: Write failing pause and elapsed tests**

Cover a running value, repeated pause, frozen open pause, resume, a second closed interval, completion while paused, and monotonic-time errors:

```ts
it('subtracts closed and open pauses without persisting a counter', () => {
  const execution = MorningPhysicalExecution.start(
    [repetitionPlan('push-ups', 1, 10)],
    time('07:00'),
  );
  expect(execution.pause(time('07:05'))).toBe(true);
  expect(execution.workedDurationAt(time('07:20'))).toBe(5 * 60_000);
  expect(execution.resume(time('07:25'))).toBe(true);
  expect(execution.workedDurationAt(time('07:30'))).toBe(10 * 60_000);
});
```

- [ ] **Step 5: Write failing resolve, skip, advance, and completion tests**

Table-test repetitions `0`, `1001`, fractions, `NaN`, and infinities; duration `0`, `3601`, fractions, `NaN`, and infinities. Prove that:

- the input identity must match the active set;
- actual measurement type must match the active entry;
- a resolved set cannot be overwritten;
- pause blocks resolve and advance;
- skip stores no fake actual value;
- resolve leaves `activeSetIndex` unchanged;
- advance requires a resolved current set and a following set;
- completion requires every set resolved and the final index active.

Use stable internal codes such as `morning_physical_execution.stale_set`, `morning_physical_execution.paused`, `morning_physical_execution.invalid_actual`, and `morning_physical_execution.not_ready_to_complete` with Russian user-facing messages.

- [ ] **Step 6: Implement the minimal transition logic and confirm GREEN**

Run:

```powershell
npm run test:target -- src/domain/morning-exercise/MorningPhysicalExecution.test.ts
```

Expected: all execution-value tests PASS with no warnings.

- [ ] **Step 7: Review the Task 1 boundary**

```powershell
git diff --check -- src/domain/morning-exercise/MorningPhysicalExecution.ts src/domain/morning-exercise/MorningPhysicalExecution.test.ts src/domain/morning-exercise/index.ts src/domain/index.ts
git diff -- src/domain/morning-exercise/MorningPhysicalExecution.ts src/domain/morning-exercise/MorningPhysicalExecution.test.ts src/domain/morning-exercise/index.ts src/domain/index.ts
```

Confirm there is no React/browser/application/infrastructure import and no target/name duplication.

---

### Task 2: Embed execution in `MorningCycle`

**Files:**

- Modify: `src/domain/morning-cycle/MorningCycle.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.test.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.ts`

**Interfaces:**

- `MorningCycleRehydrationData` gains optional nullable `physicalExecution`.
- `MorningCycle` gains a defensive `physicalExecution` getter and aggregate commands for start, recovery, pause, resume, set completion/skip, manual advance, and final completion.
- `cloneMorningCycle` preserves a deep copy of detailed execution.

- [ ] **Step 1: Add failing aggregate lifecycle tests**

Create a started active cycle, save two plan items, and assert:

```ts
expect(cycle.startPhysicalExecution(STARTED_AT)).toBe(true);
expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.inProgress);
expect(cycle.physicalExecution?.sets).toHaveLength(5);
expect(cycle.version).toBe(versionBefore + 1);
expect(cycle.startPhysicalExecution(LATER)).toBe(false);
```

Add tests that start rejects `NOT_CONFIGURED`, an empty `READY` state, terminal cycles, and an existing incompatible execution. Prove plan mutation and whole-stage skip are rejected once detailed execution exists.

- [ ] **Step 2: Add failing delegation and atomic completion tests**

Exercise the aggregate methods with exact signatures:

```ts
cycle.pausePhysicalExecution(PAUSED_AT);
cycle.resumePhysicalExecution(RESUMED_AT);
cycle.completePhysicalSet(
  id('push-ups'),
  1,
  {
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    actualReps: 14,
  },
  RESOLVED_AT,
);
cycle.advancePhysicalExecution(ADVANCED_AT);
cycle.skipPhysicalSet(id('push-ups'), 2, SKIPPED_AT);
cycle.completePhysicalExecution(COMPLETED_AT);
```

Assert each successful command changes `updatedAt`, `physicalUpdatedAt`, and version exactly once; idempotent pause/resume/final completion do not increment version. Completion while paused closes the open interval and changes detailed `completedAt` plus coarse status `DONE` in the same mutation.

- [ ] **Step 3: Add legacy rehydration and recovery tests**

Prove all four compatibility paths:

- `READY` + no execution remains editable;
- `DONE`/`SKIPPED` + no execution rehydrates as a coarse historical fact;
- `IN_PROGRESS` + non-empty plan + no execution can recover from `physicalUpdatedAt`;
- `IN_PROGRESS` + empty plan + no execution cannot recover.

Fallback recovery start time must be the pre-mutation `updatedAt` only when `physicalUpdatedAt` is absent.

- [ ] **Step 4: Implement aggregate ownership and retire coarse normal transitions**

Store a private copied value:

```ts
#physicalExecution: MorningPhysicalExecution | null;

public get physicalExecution(): MorningPhysicalExecution | null {
  return this.#physicalExecution?.copy() ?? null;
}
```

Replace normal runtime use of the coarse `startPhysical`/`completePhysical` methods with detailed aggregate commands. Legacy coarse states remain accepted only through rehydration. Keep `skipPhysical` for pre-execution whole-stage skip, but make `IN_PROGRESS`/existing execution fail with `morning_cycle.physical_plan_locked` or a focused transition error.

When recovering, capture `const executionStartedAt = this.#physicalUpdatedAt ?? this.#updatedAt` before calling `change(...)`. Every nested change must be followed by exactly one aggregate `changePhysical(...)` or equivalent version update.

- [ ] **Step 5: Preserve execution in clone and confirm GREEN**

Add `physicalExecution: cycle.physicalExecution` to `cloneMorningCycle`, then run:

```powershell
npm run test:target -- src/domain/morning-cycle/MorningCycle.test.ts
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
```

Expected: aggregate tests PASS; the service target still passes before new commands are added.

- [ ] **Step 6: Review the Task 2 boundary**

```powershell
git diff --check -- src/domain/morning-cycle/MorningCycle.ts src/domain/morning-cycle/MorningCycle.test.ts src/application/morning-cycle/MorningCycleApplicationService.ts
git diff -- src/domain/morning-cycle/MorningCycle.ts src/domain/morning-cycle/MorningCycle.test.ts src/application/morning-cycle/MorningCycleApplicationService.ts
```

Confirm one embedded execution value and no separate aggregate/repository/store were introduced.

---

### Task 3: Backward-compatible record mapping and IndexedDB restoration

**Files:**

- Modify: `src/infrastructure/persistence/records/MorningCycleRecord.ts`
- Modify: `src/infrastructure/persistence/records/index.ts`
- Modify: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts`

**Interfaces:**

- `MorningCycleRecord.physicalExecution?: MorningPhysicalExecutionRecord | null`.
- Nested records mirror the domain discriminants and use ISO strings for every time.
- Mapper remains strict for known malformed data and tolerant only of a missing/null detailed execution.

- [ ] **Step 1: Write failing mapper round-trip tests**

Cover running pending, paused, resolved-awaiting-advance, and completed values. The record shape must be structurally explicit:

```ts
export interface MorningPhysicalExecutionRecord {
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly pausedAt: string | null;
  readonly pauseIntervals: readonly {
    readonly startedAt: string;
    readonly endedAt: string;
  }[];
  readonly activeSetIndex: number;
  readonly sets: readonly MorningPhysicalSetExecutionRecord[];
}
```

Assert repetition records never contain `actualDurationSeconds`, duration records never contain `actualReps`, and skipped records contain neither actual field.

- [ ] **Step 2: Run the mapper target and confirm RED**

```powershell
npm run test:target -- src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts
```

Expected: FAIL because `physicalExecution` is not mapped.

- [ ] **Step 3: Implement optional nested mapping without a schema bump**

`toRecord` writes `physicalExecution: null` when absent and maps defensive snapshots when present. `fromRecord` uses a focused `readOptionalPhysicalExecution(record)`:

```ts
if (!Object.hasOwn(record, 'physicalExecution') || record.physicalExecution === null) {
  return null;
}
```

Validate object/array shapes, ISO dates, discriminants, identity strings, set numbers, active index, actual fields, and result timestamps before calling `MorningPhysicalExecution.rehydrate`. Do not loosen `RecordMapperSupport` globally.

- [ ] **Step 4: Add malformed-known-data tests**

Table-test invalid open/closed pause chronology, overlapping pauses, empty sets, out-of-range active index, duplicate identities, wrong set order, resolved entries after the active index, pending `resolvedAt`, completed null actual, skipped actual fields, and crossed measurement fields. Each must throw `persistence.invalid_record`.

- [ ] **Step 5: Add an IndexedDB reopen test**

Persist a paused execution after one set is resolved and advanced. Close and reopen `LifeOsIndexedDb`, then assert:

```ts
expect(restored.physicalExecution?.activeSetIndex).toBe(1);
expect(restored.physicalExecution?.pausedAt).toEqual(PAUSED_AT);
expect(restored.physicalExecution?.sets[0]).toMatchObject({
  status: MORNING_PHYSICAL_SET_STATUS.completed,
  actualReps: 14,
});
expect(restored.physicalExecution?.workedDurationAt(time('08:00'))).toBe(EXPECTED_WORK_MS);
```

Also reopen a raw legacy record with missing `physicalExecution` and one with explicit `null`.

- [ ] **Step 6: Confirm persistence targets GREEN**

```powershell
npm run test:target -- src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
```

Expected: both targets PASS. Confirm `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts` and its database version are unchanged.

- [ ] **Step 7: Review the Task 3 boundary**

```powershell
git diff --check -- src/infrastructure/persistence/records/MorningCycleRecord.ts src/infrastructure/persistence/records/index.ts src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
git diff -- src/infrastructure/persistence/records/MorningCycleRecord.ts src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
```

---

### Task 4: Current-date CAS application commands

**Files:**

- Modify: `src/application/morning-cycle/MorningCycleApplicationService.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.test.ts`

**Interfaces:**

- Adds the eight approved current-date methods without new repositories or command classes.
- Consumes `MorningPhysicalSetActual` and the active set identity.

- [ ] **Step 1: Write failing command happy-path tests**

Use the existing in-memory CAS double and injected clock. The service surface is exact:

```ts
startPhysicalExecution(date: DayDate): Promise<MorningCycle>;
recoverPhysicalExecution(date: DayDate): Promise<MorningCycle>;
pausePhysicalExecution(date: DayDate): Promise<MorningCycle>;
resumePhysicalExecution(date: DayDate): Promise<MorningCycle>;
completePhysicalSet(
  date: DayDate,
  exerciseDefinitionId: EntityId,
  setNumber: number,
  actual: MorningPhysicalSetActual,
): Promise<MorningCycle>;
skipPhysicalSet(
  date: DayDate,
  exerciseDefinitionId: EntityId,
  setNumber: number,
): Promise<MorningCycle>;
advancePhysicalExecution(date: DayDate): Promise<MorningCycle>;
completePhysicalExecution(date: DayDate): Promise<MorningCycle>;
```

Assert start persists `IN_PROGRESS` and all pending sets; completion of a set persists the exact actual; advance persists only the index; final completion persists `DONE` and detailed `completedAt`.

- [ ] **Step 2: Run the service target and confirm RED**

```powershell
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
```

Expected: FAIL because the methods are missing.

- [ ] **Step 3: Implement commands through the existing mutation helper**

Each method must call `assertCurrentDate(date)` and then the existing two-attempt `mutate`. Example:

```ts
public completePhysicalSet(
  date: DayDate,
  exerciseDefinitionId: EntityId,
  setNumber: number,
  actual: MorningPhysicalSetActual,
): Promise<MorningCycle> {
  this.assertCurrentDate(date);
  return this.mutate(date, (cycle, occurredAt) =>
    cycle.completePhysicalSet(exerciseDefinitionId, setNumber, actual, occurredAt),
  );
}
```

Do not add UI validation or repository calls outside `mutate`.

- [ ] **Step 4: Add guard, stale-set, and CAS retry tests**

Prove:

- every new mutation rejects a historical date;
- recovery rejects normal `READY`, detailed `IN_PROGRESS`, empty-plan legacy `IN_PROGRESS`, and terminal facts;
- a stale identity cannot record against the new active set after the first CAS attempt loses;
- the second CAS attempt reloads authoritative state;
- two failed CAS writes return the existing `morning_cycle.concurrent_change` message;
- repeated successful start/pause/resume/final completion remains idempotent where the domain permits it.

- [ ] **Step 5: Confirm the service target GREEN**

```powershell
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
```

Expected: all old and new service tests PASS.

- [ ] **Step 6: Review the Task 4 boundary**

```powershell
git diff --check -- src/application/morning-cycle/MorningCycleApplicationService.ts src/application/morning-cycle/MorningCycleApplicationService.test.ts
git diff -- src/application/morning-cycle/MorningCycleApplicationService.ts src/application/morning-cycle/MorningCycleApplicationService.test.ts
```

Confirm `mutate` still owns the only retry loop and no command bypasses the current-date guard.

---

### Task 5: Execution and Morning Center read models

**Files:**

- Create: `src/application/queries/GetMorningPhysicalExecutionOverview.ts`
- Create: `src/application/queries/GetMorningPhysicalExecutionOverview.test.ts`
- Modify: `src/application/queries/GetMorningCenterOverview.ts`
- Modify: `src/application/queries/GetMorningCenterOverview.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Produces one immutable execution overview with resolved capabilities and factual summary.
- Extends Morning Center with a small physical execution projection; the detailed query remains the only source for the execution page.

- [ ] **Step 1: Write failing execution-query tests**

Cover unavailable `READY`, recoverable legacy `IN_PROGRESS`, unrecoverable empty legacy `IN_PROGRESS`, running pending, paused pending, resolved-awaiting-advance, ready-to-finish, completed detailed, and legacy coarse completed states.

Use these public state values:

```ts
export const MORNING_PHYSICAL_EXECUTION_VIEW_STATE = {
  unavailable: 'unavailable',
  recoverable: 'recoverable',
  unrecoverable: 'unrecoverable',
  running: 'running',
  paused: 'paused',
  awaitingAdvance: 'awaiting-advance',
  readyToFinish: 'ready-to-finish',
  completed: 'completed',
  legacyCompleted: 'legacy-completed',
} as const;
```

The overview must expose:

```ts
interface MorningPhysicalExecutionOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly state: MorningPhysicalExecutionViewState;
  readonly workedDurationMs: number;
  readonly selectedExerciseCount: number;
  readonly totalSets: number;
  readonly resolvedSets: number;
  readonly completedSets: number;
  readonly skippedSets: number;
  readonly totalActualReps: number;
  readonly totalActualDurationSeconds: number;
  readonly currentSet: MorningPhysicalExecutionCurrentSet | null;
  readonly canRecover: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canResolve: boolean;
  readonly canAdvance: boolean;
  readonly canFinish: boolean;
}
```

`MorningPhysicalExecutionCurrentSet` is a repetitions/duration union containing the existing definition ID/name, exercise index/count, set number/count for that exercise, global set index/count, planned target, status, optional matching actual, and `resolvedAt`.

- [ ] **Step 2: Run the new query target and confirm RED**

```powershell
npm run test:target -- src/application/queries/GetMorningPhysicalExecutionOverview.test.ts
```

Expected: FAIL because the query does not exist.

- [ ] **Step 3: Implement the focused join and pure resolver**

Construct with the existing repositories/providers:

```ts
public constructor(
  private readonly cycles: MorningCycleRepository,
  private readonly definitions: ExerciseDefinitionRepository,
  private readonly currentDate: CurrentDateProvider,
  private readonly clock: Clock,
) {}
```

`execute(date)` loads the cycle and all definitions in parallel, supplies `clock.now()` to a pure resolver, and freezes the top-level object, current set, and summary data. Resolve archived definitions referenced by the plan; fail with the existing missing-definition persistence error only when a referenced definition truly does not exist or its measurement type conflicts.

- [ ] **Step 4: Prove elapsed time and factual totals**

Use hand-calculated timestamps. Paused worked time must remain constant at later `now`; completed worked time must freeze at `completedAt`. Mixed results must sum only actual repetitions/seconds and count skips separately.

- [ ] **Step 5: Write failing Morning Center projection tests**

Extend the center overview with:

```ts
interface MorningCenterPhysicalExecutionOverview {
  readonly statusText: string | null;
  readonly resolvedSets: number;
  readonly totalSets: number;
  readonly canContinue: boolean;
}
```

Assert `IN_PROGRESS` with detailed execution yields `Выполняется · 2 из 5 подходов`, remains the current stage, and can continue only on the current date. `DONE` advances to Mirror. Legacy `IN_PROGRESS` exposes a recovery-oriented status without claiming completed progress; coarse historical `DONE` remains completed.

- [ ] **Step 6: Implement the center projection and confirm both targets GREEN**

```powershell
npm run test:target -- src/application/queries/GetMorningPhysicalExecutionOverview.test.ts
npm run test:target -- src/application/queries/GetMorningCenterOverview.test.ts
```

Expected: both query targets PASS and `overallProgressPercent` still counts Physical activation only for `DONE`/whole-stage `SKIPPED`.

- [ ] **Step 7: Review the Task 5 boundary**

```powershell
git diff --check -- src/application/queries/GetMorningPhysicalExecutionOverview.ts src/application/queries/GetMorningPhysicalExecutionOverview.test.ts src/application/queries/GetMorningCenterOverview.ts src/application/queries/GetMorningCenterOverview.test.ts src/application/index.ts
git diff -- src/application/queries/GetMorningPhysicalExecutionOverview.ts src/application/queries/GetMorningCenterOverview.ts src/application/index.ts
```

---

### Task 6: Composition and morning execution route ownership

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`
- Modify: `src/presentation/routine/RoutineNavigation.ts`
- Modify: `src/presentation/routine/RoutineNavigation.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`

**Interfaces:**

- `LifeOsApplication` exposes `getMorningPhysicalExecutionOverview`.
- `RoutineRoute` gains nullable `morningView`; only `physical-execution` is accepted and only for Morning.
- `ApplicationShell` owns route state and history; children receive data/callback props only.

- [ ] **Step 1: Write failing navigation contract tests**

Prove exact parsing/building behavior:

```ts
expect(
  parseRoutineRoute('#/routine/morning?date=2026-08-28&view=physical-execution'),
).toMatchObject({
  section: ROUTINE_SECTION.morning,
  date: DayDate.create('2026-08-28'),
  morningView: ROUTINE_MORNING_VIEW.physicalExecution,
});
expect(
  buildRoutineRoute(ROUTINE_SECTION.morning, date, ROUTINE_MORNING_VIEW.physicalExecution),
).toBe('#/routine/morning?date=2026-08-28&view=physical-execution');
```

Unknown `view`, a valid view on day/evening, and unrelated query keys must produce `morningView: null` without invalidating an otherwise valid route. Existing date behavior remains unchanged.

- [ ] **Step 2: Run the route target and confirm RED**

```powershell
npm run test:target -- src/presentation/routine/RoutineNavigation.test.ts
```

Expected: FAIL because the view contract is missing.

- [ ] **Step 3: Implement route constants and optional builder argument**

```ts
export const ROUTINE_MORNING_VIEW = {
  physicalExecution: 'physical-execution',
} as const;

export interface RoutineRoute {
  readonly section: RoutineSection;
  readonly date: DayDate | null;
  readonly morningView: RoutineMorningView | null;
}
```

Keep `buildRoutineRoute(section, date, morningView = null)` backward-compatible for existing callers and include `view` only when `section === morning`.

- [ ] **Step 4: Write failing composition/restart test**

In `createLifeOsApplication.test.ts`, start a saved plan through `application.morningCycle`, record and advance one set, pause, close the application, recreate it against the same IndexedDB, then call `application.getMorningPhysicalExecutionOverview.execute(date)`. Assert paused state, exact active set, recorded actual, and frozen worked duration.

- [ ] **Step 5: Compose and expose the query**

Instantiate:

```ts
const getMorningPhysicalExecutionOverview = new GetMorningPhysicalExecutionOverview(
  morningCycleRepository,
  exerciseDefinitionRepository,
  currentDateProvider,
  clock,
);
```

Add it to `LifeOsApplicationServices`, public properties, constructor assignments, and the returned composition object.

- [ ] **Step 6: Lift execution view state into `ApplicationShell`**

Initialize `morningView` from `initialRoutineRoute`, restore it on `popstate`/`hashchange`, and clear it when navigating away from Morning. Add one callback that sets state and calls `writeRoutineRoute` with push history. Date replacement must preserve the view only while the Morning execution page remains selected.

Pass through `RoutinePage`:

```tsx
<RoutinePage
  morningView={morningView}
  onMorningViewChange={changeMorningView}
  morningCenter={{
    getOverview: application.getMorningCenterOverview,
    getPhysicalOverview: application.getMorningPhysicalActivationOverview,
    getPhysicalExecutionOverview: application.getMorningPhysicalExecutionOverview,
    cycle: application.morningCycle,
    exerciseCatalog: application.morningExerciseCatalog,
    clock: application.clock,
  }}
/>
```

`RoutinePage` only forwards these values to `MorningCenterPage`; it does not write `window.location`.

- [ ] **Step 7: Confirm route, composition, and boundary targets GREEN**

```powershell
npm run test:target -- src/presentation/routine/RoutineNavigation.test.ts
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
```

Expected: all targets PASS, including the existing MOR-01/MOR-02 boundary test.

- [ ] **Step 8: Review the Task 6 boundary**

```powershell
git diff --check -- src/app/composition/LifeOsApplication.ts src/app/composition/createLifeOsApplication.ts src/app/composition/createLifeOsApplication.test.ts src/presentation/routine/RoutineNavigation.ts src/presentation/routine/RoutineNavigation.test.ts src/app/ApplicationShell.tsx src/presentation/pages/RoutinePage.tsx src/presentation/pages/RoutinePage.test.ts
git diff -- src/app/composition/LifeOsApplication.ts src/app/composition/createLifeOsApplication.ts src/presentation/routine/RoutineNavigation.ts src/app/ApplicationShell.tsx src/presentation/pages/RoutinePage.tsx
```

Confirm no presentation component calls `history`, assigns `location`, or parses the hash.

---

### Task 7: Execution page behavior and presentation states

**Files:**

- Create: `src/presentation/pages/MorningPhysicalExecutionPage.tsx`
- Create: `src/presentation/pages/MorningPhysicalExecutionPage.test.ts`
- Create: `src/presentation/styles/morning-physical-execution.css`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- The page consumes the focused query, the eight execution commands, a clock, and navigation callbacks.
- React state contains only load state, actual input text, pending action, mutation error, and a display `now`.

- [ ] **Step 1: Write failing pure-view tests for all execution states**

Export `MorningPhysicalExecutionView` and test with explicit immutable overviews:

- pending repetitions shows an empty labelled numeric input with `min=1`, `max=1000`, and no planned-value prefill;
- pending duration uses seconds with `min=1`, `max=3600`;
- paused shows `На паузе`, frozen elapsed, Resume, and disabled resolve/advance;
- resolved non-final shows planned versus actual or explicit skip plus `Следующий подход`;
- resolved final shows factual totals plus `Завершить физическую активацию`;
- completed is read-only;
- recoverable legacy offers `Восстановить выполнение`;
- unrecoverable/absent states explain the condition and offer `Вернуться к плану`;
- pending commands disable coherent controls and announce state;
- a long custom exercise name remains visible without truncating the accessible name.

- [ ] **Step 2: Run the page target and confirm RED**

```powershell
npm run test:target -- src/presentation/pages/MorningPhysicalExecutionPage.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the page orchestration surface**

Use this ownership contract:

```ts
interface MorningPhysicalExecutionPageProps {
  readonly date: DayDate;
  readonly getOverview: Pick<GetMorningPhysicalExecutionOverview, 'execute'>;
  readonly cycle: Pick<
    MorningCycleApplicationService,
    | 'recoverPhysicalExecution'
    | 'pausePhysicalExecution'
    | 'resumePhysicalExecution'
    | 'completePhysicalSet'
    | 'skipPhysicalSet'
    | 'advancePhysicalExecution'
    | 'completePhysicalExecution'
  >;
  readonly clock: Pick<Clock, 'now'>;
  readonly onBack: () => void;
  readonly onCompleted: () => void;
}
```

After every successful command, reload the authoritative overview before clearing the pending state. Reset the actual input only after a successful set resolution. Preserve its text after validation, domain, persistence, or concurrency failure.

- [ ] **Step 4: Implement safe actual parsing and one-second display refresh**

Keep the input as a string. On submit, require a base-10 integer and construct the matching discriminated actual from `currentSet.measurementType`; domain validation remains authoritative. Do not call a persistence command from the interval.

Run `window.setInterval(() => setNow(clock.now()), 1_000)` only for running incomplete state. Paused/completed views use the query's authoritative frozen duration and no running interval. Reloading the query on each display tick is forbidden.

- [ ] **Step 5: Implement semantic structure and action flow**

Render in logical DOM order:

1. back control and `Этап 02`;
2. elapsed/status header with an `aria-live` status;
3. exercise/set/global progress;
4. current name and planned target;
5. native labelled numeric input and set actions;
6. pause/resume;
7. resolved confirmation or final factual summary;
8. plan progress list.

Focus the execution heading after initial load, keep validation errors in `role="alert"`, and focus the next actual input after explicit advance. Completion calls `onCompleted` only after the command and authoritative reload succeed.

- [ ] **Step 6: Add the responsive execution stylesheet**

Use a desktop two-area grid and one-column mobile layout. The action panel must use the existing bottom-navigation spacing plus:

```css
padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
```

All interactive controls must have `min-height: 44px`, visible restrained-gold `:focus-visible`, no fixed widths that force overflow at 360px, `min-width: 0` on grid children, and `overflow-wrap: anywhere` for custom names. Honor `prefers-reduced-motion` and do not introduce permanent purple or broad gold glow.

- [ ] **Step 7: Confirm the page target GREEN**

```powershell
npm run test:target -- src/presentation/pages/MorningPhysicalExecutionPage.test.ts
```

Expected: all view/orchestration tests PASS without act warnings or leaked timers.

- [ ] **Step 8: Review the Task 7 boundary**

```powershell
git diff --check -- src/presentation/pages/MorningPhysicalExecutionPage.tsx src/presentation/pages/MorningPhysicalExecutionPage.test.ts src/presentation/styles/morning-physical-execution.css src/presentation/styles/global.css
git diff -- src/presentation/pages/MorningPhysicalExecutionPage.tsx src/presentation/pages/MorningPhysicalExecutionPage.test.ts src/presentation/styles/morning-physical-execution.css src/presentation/styles/global.css
```

Confirm no mutable execution object, accumulated seconds, target prefill, or direct browser navigation exists in the page.

---

### Task 8: Replace the MOR-02 acknowledgement and connect center/plan/execution

**Files:**

- Modify: `src/presentation/pages/MorningPhysicalActivationPage.tsx`
- Modify: `src/presentation/pages/MorningPhysicalActivationPage.test.ts`
- Modify: `src/presentation/pages/MorningCenterPage.tsx`
- Modify: `src/presentation/pages/MorningCenterPage.test.ts`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`

**Interfaces:**

- Planning receives `startPhysicalExecution` plus `onExecutionStarted`.
- Morning Center receives the route-owned `morningView` and `onMorningViewChange` and renders the execution page when requested.
- The center card uses only the small center query projection.

- [ ] **Step 1: Replace planning acknowledgement tests with persisted-start tests**

Remove `planAcknowledged`/`onAcknowledgePlan` expectations. Add tests that the CTA:

- calls `startPhysicalExecution(date)` exactly once;
- reads `Начинаем…` and is disabled while pending;
- calls `onExecutionStarted` only after success;
- retains the saved plan and shows an inline Russian error after failure;
- remains unavailable for an empty/read-only/locked plan.

- [ ] **Step 2: Run the activation target and confirm RED**

```powershell
npm run test:target -- src/presentation/pages/MorningPhysicalActivationPage.test.ts
```

Expected: FAIL because the page still uses local acknowledgement.

- [ ] **Step 3: Implement persisted start in the planning page**

Add `'start'` to `PhysicalPendingAction`, include `startPhysicalExecution` in the service pick, and route the CTA through the existing `mutate` helper. Navigate only after the command and reload succeed. Remove all `planAcknowledged` state and `План сохранён и готов к утру.` copy.

- [ ] **Step 4: Write failing center integration tests**

Assert:

- an active detailed execution card says `Выполняется · N из M подходов` and button text `Продолжить`;
- Continue calls `onMorningViewChange(physical-execution)`;
- requested execution renders `MorningPhysicalExecutionPage` with the same date/services;
- its Back calls `onMorningViewChange(null)` without Pause;
- successful final completion returns to center, reloads center overview, and focuses the next stage card;
- a direct requested view with no normal/recoverable execution exposes `Вернуться к плану` rather than creating execution;
- historical completed details render read-only.

- [ ] **Step 5: Implement controlled execution view integration**

Keep local center/Quick Start/plan selection for the accepted MOR-01/MOR-02 views, but make execution controlled by the shell:

```ts
interface MorningCenterPageProps {
  readonly morningView: RoutineMorningView | null;
  readonly onMorningViewChange: (view: RoutineMorningView | null) => void;
  readonly getPhysicalExecutionOverview: Pick<GetMorningPhysicalExecutionOverview, 'execute'>;
  // existing services remain
}
```

Starting and continuing call the callback with `ROUTINE_MORNING_VIEW.physicalExecution`. Back calls it with `null` and never invokes pause. On final completion, clear the requested view, reload the center query, and focus the Mirror stage card.

- [ ] **Step 6: Confirm presentation integration targets GREEN**

```powershell
npm run test:target -- src/presentation/pages/MorningPhysicalActivationPage.test.ts
npm run test:target -- src/presentation/pages/MorningCenterPage.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
```

Expected: all MOR-01/MOR-02/MOR-03 presentation tests PASS.

- [ ] **Step 7: Run the broad static stabilization gate**

```powershell
npm run test:fast
npm run typecheck
npm run lint
```

Expected: all three commands exit `0`. Fix only MOR-03 regressions; preserve unrelated accepted changes.

- [ ] **Step 8: Review the Task 8 boundary**

```powershell
git diff --check -- src/presentation/pages/MorningPhysicalActivationPage.tsx src/presentation/pages/MorningPhysicalActivationPage.test.ts src/presentation/pages/MorningCenterPage.tsx src/presentation/pages/MorningCenterPage.test.ts src/presentation/pages/RoutinePage.tsx src/presentation/pages/RoutinePage.test.ts
git diff -- src/presentation/pages/MorningPhysicalActivationPage.tsx src/presentation/pages/MorningCenterPage.tsx src/presentation/pages/RoutinePage.tsx
```

Confirm the accepted plan editor still persists every stepper/selection action and cannot edit after execution starts.

---

### Task 9: MOR-03 E2E, browser QA, and final quality gate

**Files:**

- Modify: `tests/e2e/morning-center.acceptance.spec.ts`
- Inspect: every MOR-03 file changed in Tasks 1–8

**Interfaces:**

- One browser scenario proves the approved 11-step execution flow through real IndexedDB and routing.
- Final evidence follows `docs/codex/TEST_MATRIX.md` and leaves a local server available for manual review.

- [ ] **Step 1: Add the failing MOR-03 acceptance scenario**

Give the test a unique `MOR-03` title. It must:

1. start Morning and save a two-exercise plan containing repetitions and duration with at least four total sets;
2. start execution and verify planning controls are locked;
3. record a repetitions result;
4. verify the active set does not change automatically, then click `Следующий подход`;
5. pause, sample the displayed worked time, wait only through Playwright's bounded expectation, confirm it stays fixed, refresh, and resume;
6. record a duration result and explicitly skip one set;
7. go Back to Morning Center and Continue the same execution without an implicit pause;
8. refresh `#/routine/morning?date=2026-08-28&view=physical-execution` and verify the exact active/awaiting-advance position;
9. resolve remaining sets, complete Physical activation, and verify Mirror is current;
10. reopen the completed date and confirm read-only factual totals;
11. assert no horizontal overflow, at least 44px controls, logical focus, safe-area clearance, and no console/page errors at 1600×900, 1280×720, 390×844, and 360×800.

Use exact role/label locators. Do not use arbitrary sleeps for persistence or navigation.

- [ ] **Step 2: Free the managed E2E port safely**

The canonical runner refuses occupied `127.0.0.1:4173`. Stop only the known dev-server process created for this LifeOS task through its owned terminal/session, then confirm the port is free. Never terminate a process merely because it owns the port.

- [ ] **Step 3: List and run the targeted E2E**

```powershell
npm run test:e2e:list
npm run test:e2e -- tests/e2e/morning-center.acceptance.spec.ts --grep "MOR-03"
```

Expected: list succeeds, the MOR-03 scenario exits `0`, managed teardown reports no cleanup error, and port 4173 is free afterward.

- [ ] **Step 4: Run the focused regression set once more after E2E stabilization**

```powershell
npm run test:target -- src/domain/morning-exercise/MorningPhysicalExecution.test.ts
npm run test:target -- src/domain/morning-cycle/MorningCycle.test.ts
npm run test:target -- src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
npm run test:target -- src/application/queries/GetMorningPhysicalExecutionOverview.test.ts
npm run test:target -- src/application/queries/GetMorningCenterOverview.test.ts
npm run test:target -- src/presentation/routine/RoutineNavigation.test.ts
npm run test:target -- src/presentation/pages/MorningPhysicalExecutionPage.test.ts
npm run test:target -- src/presentation/pages/MorningPhysicalActivationPage.test.ts
npm run test:target -- src/presentation/pages/MorningCenterPage.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts
npm run test:fast
npm run typecheck
npm run lint
```

Expected: every command exits `0`; no skipped MOR-03 test and no warning is treated as success.

- [ ] **Step 5: Run the full gate exactly once**

With port 4173 still free:

```powershell
npm run verify
```

Expected: typecheck, lint, full unit/integration, infrastructure, alpha, full E2E, build, format check, and `git diff --check` all pass in the canonical sequence. Do not repeat `verify` without a new failure-driven reason.

- [ ] **Step 6: Start controlled browser QA and inspect the real app**

Start one controlled local Vite server on `127.0.0.1:4173`, then use the in-app browser against the real execution route. Check running pending, resolved-awaiting-advance, paused after refresh, final summary, completed read-only, legacy recovery messaging, keyboard order/focus, long custom names, reduced motion, mobile keyboard/input visibility, bottom-navigation clearance, horizontal overflow, and browser console at all four required viewports.

Refine only MOR-03 presentation defects. If code changes after `verify`, rerun the nearest targeted test plus typecheck/lint and report that the single full gate predates that refinement; do not silently claim the old evidence covers new edits.

- [ ] **Step 7: Perform final Git hygiene and complete diff review**

```powershell
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Inspect the complete diff and confirm:

- no database version/store/dependency changed;
- no unrelated user files were overwritten;
- no actual value is synthesized from a target;
- no screen exit pauses execution;
- no automatic advance/completion exists;
- no browser API appears below App routing;
- no MOR-04 functionality is present.

- [ ] **Step 8: Handoff and stop**

Report changed contracts, actual command results, E2E result, all browser states/viewports checked, console status, and any remaining limitation. Include `Требуется ручная визуальная проверка`, provide the running local URL, leave the controlled local server running for the user's inspection, do not push, and do not begin MOR-04.
