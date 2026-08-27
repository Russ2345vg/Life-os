# WALK-08 Routine Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a Walk from one exact Routine occurrence, keep the existing Walk and Routine execution facts atomic through completion or abandonment, and return Reentry to the correct Routine date and next occurrence.

**Architecture:** `Walk` and `RoutineOccurrenceExecution` remain the only execution aggregates. A new application port, `RoutineWalkUnitOfWork`, coordinates them through one IndexedDB transaction over the existing Walk, Routine execution, block, and override stores; presentation carries only transient launch/return requests. Ordinary Walk and non-walk Routine paths retain their current repositories and commands.

**Tech Stack:** TypeScript 6 strict mode, React 19, Vitest 4, IndexedDB/fake-indexeddb, Playwright 1.62, Vite 8, existing LifeOS CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-walk-08-routine-integration-design.md`

## Global Constraints

- Work only in `C:\LifeOS-App`; before edits run `git rev-parse --show-toplevel` and `git status --short`.
- Preserve all cumulative WALK-01—07 and unrelated user changes; never use destructive Git and never push.
- The current worktree contains overlapping uncommitted changes. Task-level commits are unsafe until the user authorizes a clean cumulative baseline checkpoint. End every task with tests plus a diff checkpoint; do not commit product files merely because this plan shows a checkpoint boundary.
- Never stage or commit `.codex-temp/`.
- `Walk` remains the only Walk aggregate; `RoutineOccurrenceExecution` remains the only Routine execution fact. Do not add `WalkSession`, `RoutineWalkSession`, another session engine, another repository, or another object store.
- Dependencies remain `UI → Presentation → Application → Domain`. React must not mutate subject state or call concrete Infrastructure adapters.
- Keep `LIFE_OS_DATABASE_VERSION = 17`, `WalkRecord.schemaVersion = 1`, and the current store/index list.
- Old Walk records without routine fields must restore with `routineContext = null`.
- Use one `clock.now()` value for each atomic start/finish pair. Walk elapsed duration remains timestamp/pause-interval based.
- A routine-linked Walk and its source occurrence finish together: `completed/completed` or `abandoned/abandoned`. Same-terminal retries are idempotent; opposite terminal states fail without writes.
- Active Walk recovery has priority over pending Reentry; pending Reentry has priority over a transient Routine launch request.
- Do not change Decision, Goal, Project, LifeAction, Today, Morning, Evening, or non-walk Routine behavior.
- UI must preserve the graphite/gold/green LifeOS language, use no persistent purple accent, provide 44 px controls, and avoid horizontal overflow at 1366×768, 390×844, and 360×800.
- No Figma node is available for WALK-08. Use the approved spec and existing Routine/Walks UI as the visual contract, capture browser evidence, and report `Требуется ручная визуальная проверка` at handoff.
- Implement every behavior RED → GREEN. After each task inspect only the intended paths with `git diff --check -- <paths>` and `git diff -- <paths>`.

---

### Task 1: Add the exact Routine occurrence context to the existing Walk aggregate

**Files:**

- Modify: `src/domain/walk/WalkContext.ts`
- Modify: `src/domain/walk/WalkReentry.ts`
- Modify: `src/domain/walk/Walk.ts`
- Modify: `src/domain/walk/Walk.test.ts`
- Modify: `src/domain/walk/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Consumes: `EntityId`, `DayDate`, `WalkReturnContext`, `WalkReentryAction`, and existing Walk lifecycle methods.
- Produces: `WalkRoutineOccurrenceReference`, `WalkRoutineContext`, nullable `routineContext` on return/reentry values, runtime guards, defensive-copy helpers, and cross-field Walk invariants.

- [ ] **Step 1: Write failing tests for routine context, invariants, and lifecycle preservation**

Add a helper and assertions to `Walk.test.ts`:

```ts
const routineContext: WalkRoutineContext = {
  source: {
    routineBlockId: EntityId.create('routine-walk-source'),
    occurrenceDate: DayDate.create('2026-08-24'),
    effectiveDate: DayDate.create('2026-08-25'),
  },
  sourceTitle: 'Прогулка после обеда',
  next: {
    routineBlockId: EntityId.create('routine-next'),
    occurrenceDate: DayDate.create('2026-08-25'),
    effectiveDate: DayDate.create('2026-08-25'),
  },
};

const running = Walk.create({
  id: EntityId.create('routine-walk'),
  date: DayDate.create('2026-08-25'),
  type: WALK_TYPE.mindful,
  linkedEntity: { type: WALK_LINKED_ENTITY_TYPE.routine, id: routineContext.source.routineBlockId },
  returnContext: {
    origin: WALK_RETURN_ORIGIN.routine,
    entity: { type: WALK_LINKED_ENTITY_TYPE.routine, id: routineContext.source.routineBlockId },
    nextStep: 'Вечерний обзор',
    routineContext,
  },
  now: CREATED_AT,
}).start({
  mode: WALK_MODE.timer,
  timerTargetMinutes: 30,
  reflectionQuestion: 'Что сейчас важно заметить?',
  startedAt: STARTED_AT,
});

expect(running.pause(PAUSED_AT).resume(RESUMED_AT).returnContext?.routineContext).toEqual(
  routineContext,
);
expect(running.returnContext?.routineContext).not.toBe(routineContext);
```

Also assert these failures:

```ts
expect(() => createWalkWithRoutineContext({ origin: WALK_RETURN_ORIGIN.today })).toThrowError(
  expect.objectContaining({ code: 'walk.invalid_return_context' }),
);
expect(() => createWalkWithRoutineContext({ entityId: EntityId.create('other') })).toThrowError(
  expect.objectContaining({ code: 'walk.invalid_return_context' }),
);
expect(() =>
  createWalkWithRoutineContext({ effectiveDate: DayDate.create('2026-08-26') }),
).toThrowError(expect.objectContaining({ code: 'walk.invalid_return_context' }));
```

- [ ] **Step 2: Run the domain test and verify RED**

```powershell
npm run test -- src/domain/walk/Walk.test.ts
```

Expected: FAIL because routine occurrence/context types and fields do not exist.

- [ ] **Step 3: Implement the value objects and strict runtime guards**

Add these contracts to `WalkContext.ts`:

```ts
export interface WalkRoutineOccurrenceReference {
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly effectiveDate: DayDate;
}

export interface WalkRoutineContext {
  readonly source: WalkRoutineOccurrenceReference;
  readonly sourceTitle: string;
  readonly next: WalkRoutineOccurrenceReference | null;
}

export interface WalkReturnContext {
  readonly origin: WalkReturnOrigin;
  readonly entity: WalkLinkedEntity | null;
  readonly nextStep: string | null;
  readonly routineContext?: WalkRoutineContext | null;
}
```

Implement `isWalkRoutineOccurrenceReference`, `isWalkRoutineContext`, `copyWalkRoutineContext`, and `sameWalkRoutineOccurrenceReference`. Guards must require actual `EntityId`/`DayDate` instances, a trimmed non-empty `sourceTitle`, and exact source/next shapes. Normalize the copied title with `sourceTitle.trim()` so presentation never receives leading/trailing whitespace. `isWalkReturnContext` must default a missing field to null and permit non-null routine context only when origin/entity are both Routine and the entity id equals `source.routineBlockId`.

- [ ] **Step 4: Carry routine context through Reentry and enforce Walk-level date rules**

Extend `WalkReentryAction`:

```ts
export interface WalkReentryAction {
  readonly kind: WalkReentryActionKind;
  readonly destination: WalkReturnOrigin;
  readonly entity: WalkLinkedEntity | null;
  readonly nextStep: string | null;
  readonly routineContext?: WalkRoutineContext | null;
}
```

Require non-null action routine context to use `resumeContext`, destination Routine, and the matching Routine entity. Recovery/today/review actions must have null routine context. Update `copyWalkReentry` to deep-copy it.

In `assertWalkInvariants`, require `returnContext.routineContext.source.effectiveDate.equals(data.date)`. Update `copyOptionalReturnContext` to copy entity ids, all `DayDate` values via `DayDate.create(value.toString())`, and routine ids via `EntityId.create(value.toString())`.

- [ ] **Step 5: Verify lifecycle, legacy defaulting, and exports**

Add tests proving `start`, `pause`, `resume`, `complete`, `abandon`, `recordOutcome`, `completeReentry`, and `closeReentry` preserve the exact source reference, while a missing optional field becomes null. Export all new symbols from both indexes.

```powershell
npm run test -- src/domain/walk/Walk.test.ts
npm run typecheck
git diff --check -- src/domain/walk src/domain/index.ts
```

Expected: PASS; no second aggregate or mutable nested reference appears in the diff.

---

### Task 2: Persist routine context without a migration

**Files:**

- Modify: `src/infrastructure/persistence/records/WalkRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbWalkRepository.test.ts`

**Interfaces:**

- Consumes: Task 1 value objects and existing `WalkRecord.schemaVersion = 1` mapper rules.
- Produces: optional nested routine record shapes and lossless/legacy-safe mapping.

- [ ] **Step 1: Write failing mapper tests**

Round-trip a routine-linked active Walk and a pending Routine Reentry:

```ts
const record = WalkRecordMapper.toRecord(routineWalk);
expect(record.returnContext?.routineContext).toEqual({
  source: {
    routineBlockId: 'routine-walk-source',
    occurrenceDate: '2026-08-24',
    effectiveDate: '2026-08-25',
  },
  sourceTitle: 'Прогулка после обеда',
  next: {
    routineBlockId: 'routine-next',
    occurrenceDate: '2026-08-25',
    effectiveDate: '2026-08-25',
  },
});
expect(WalkRecordMapper.fromRecord(record).returnContext?.routineContext).toEqual(
  routineWalk.returnContext?.routineContext,
);
```

Delete both nested `routineContext` properties from a cloned legacy record and expect both domain fields to be null. Add malformed id/date/title cases and expect `persistence.invalid_record`.

- [ ] **Step 2: Run the mapper test and verify RED**

```powershell
npm run test -- src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts
```

Expected: FAIL because the record and mapper do not serialize routine context.

- [ ] **Step 3: Add optional record shapes, keeping schema version 1**

```ts
export interface WalkRoutineOccurrenceReferenceRecord {
  readonly routineBlockId: string;
  readonly occurrenceDate: string;
  readonly effectiveDate: string;
}

export interface WalkRoutineContextRecord {
  readonly source: WalkRoutineOccurrenceReferenceRecord;
  readonly sourceTitle: string;
  readonly next: WalkRoutineOccurrenceReferenceRecord | null;
}
```

Add `readonly routineContext?: WalkRoutineContextRecord | null` to `WalkReturnContextRecord` and `WalkReentryActionRecord`. Do not change `schemaVersion`, database version, stores, or indexes.

- [ ] **Step 4: Implement strict to/from mapping**

Serialize dates with `.toString()` and ids with `.toString()`. During reads, use `Object.hasOwn(record, 'routineContext') ? readRoutineContext(...) : null`; inside the reader use `readEntityId`, `readDayDate`, and `readString`, then pass the assembled value through the Task 1 guard before returning it.

```ts
function toRoutineContextRecord(context: WalkRoutineContext | null) {
  return context === null
    ? null
    : {
        source: toRoutineReferenceRecord(context.source),
        sourceTitle: context.sourceTitle,
        next: context.next === null ? null : toRoutineReferenceRecord(context.next),
      };
}
```

- [ ] **Step 5: Verify IndexedDB reopen and legacy compatibility**

Add repository coverage that saves, closes, and restores active and pending routine-linked Walks. Preserve the existing legacy fixtures byte-for-byte except for cloned test manipulation.

```powershell
npm run test -- src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts
npm run typecheck
git diff --check -- src/infrastructure/persistence/records/WalkRecord.ts src/infrastructure/persistence/mappers/WalkRecordMapper.ts src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts
```

Expected: PASS; `LIFE_OS_DATABASE_VERSION` and `LIFE_OS_STORE` are untouched.

---

### Task 3: Define the atomic port and implement `StartRoutineWalk`

**Files:**

- Create: `src/application/ports/RoutineWalkUnitOfWork.ts`
- Create: `src/application/walk/WalkCreationDefaults.ts`
- Create: `src/application/commands/StartRoutineWalk.ts`
- Create: `src/application/commands/StartRoutineWalk.test.ts`
- Modify: `src/application/commands/CreateWalk.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: existing repositories, `validateFactDate`, `resolveRoutineOccurrencesForDate`, Walk reflection question picker, and Task 1 context types.
- Produces: `RoutineWalkUnitOfWork`, `StartRoutineWalkInput`, and an atomic start command returning `Result<Walk, DomainError>`.

- [ ] **Step 1: Write failing start-command tests with a recording fake unit of work**

Cover normal start, rescheduled source, next selection, same active idempotency, a different active Walk, a different running Routine occurrence, skipped/replaced/stale source, closed day, timer validation, and double-submit. The normal assertion must prove one timestamp is shared:

```ts
const result = await command.execute({
  source: {
    routineBlockId: source.id,
    occurrenceDate: DATE,
    effectiveDate: DATE,
  },
  intent: WALK_INTENT.recovery,
  mode: WALK_MODE.timer,
  timerTargetMinutes: 30,
  reflectionQuestion: 'Что поможет отпустить напряжение?',
});

expect(result).toMatchObject({
  ok: true,
  value: {
    status: WALK_STATUS.running,
    returnContext: {
      origin: WALK_RETURN_ORIGIN.routine,
      routineContext: { sourceTitle: source.title },
    },
  },
});
expect(fakeUnitOfWork.starts[0]!.walk.startedAt).toEqual(NOW);
expect(fakeUnitOfWork.starts[0]!.execution.actualStartedAt).toEqual(NOW);
expect(fakeUnitOfWork.starts[0]!.walk.status).toBe(WALK_STATUS.running);
```

- [ ] **Step 2: Run the new command test and verify RED**

```powershell
npm run test -- src/application/commands/StartRoutineWalk.test.ts
```

Expected: FAIL because the port and command do not exist.

- [ ] **Step 3: Define the exact application port**

```ts
export interface RoutineWalkPlanExpectation {
  readonly source: WalkRoutineOccurrenceReference;
  readonly expectedRoutineBlockVersion: number;
  readonly expectedOverrideVersion: number | null;
}

export interface StartRoutineWalkCommitInput {
  readonly walk: Walk;
  readonly execution: RoutineOccurrenceExecution;
  readonly expectedExecutionVersion: number | null;
  readonly plan: RoutineWalkPlanExpectation;
}

export interface FinishRoutineWalkCommitInput {
  readonly walk: Walk;
  readonly expectedWalkVersion: number;
  readonly execution: RoutineOccurrenceExecution;
  readonly expectedExecutionVersion: number;
  readonly terminalStatus: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned;
}

export interface RoutineWalkUnitOfWork {
  start(input: StartRoutineWalkCommitInput): Promise<Walk>;
  finish(input: FinishRoutineWalkCommitInput): Promise<void>;
}
```

The port returns the stored active Walk from `start` so same-source concurrent retries can be idempotent without creating a duplicate id.

- [ ] **Step 4: Extract existing Walk creation defaults instead of duplicating rules**

Move the intent-to-type and reflection-template defaults used by `CreateWalk` into pure functions:

```ts
export function walkTypeForIntent(intent: WalkIntent): WalkType;
export function walkReflectionTemplateForIntent(
  intent: WalkIntent,
  requested?: WalkReflectionTemplate,
): WalkReflectionTemplate | null;
```

Update `CreateWalk` to call them and keep all existing command tests green.

- [ ] **Step 5: Implement `StartRoutineWalk` preparation and idempotency**

Use this public input:

```ts
export interface StartRoutineWalkInput {
  readonly source: WalkRoutineOccurrenceReference;
  readonly intent: WalkIntent;
  readonly reflectionTemplate?: WalkReflectionTemplate;
  readonly beforeState?: WalkStateSnapshot | null;
  readonly mode: WalkMode;
  readonly timerTargetMinutes?: number;
  readonly reflectionQuestion?: string;
}
```

Use an explicit dependency object so tests and production composition share one contract:

```ts
export interface StartRoutineWalkDependencies {
  readonly routineBlockRepository: RoutineBlockRepository;
  readonly overrideRepository: RoutineOccurrenceOverrideRepository;
  readonly executionRepository: RoutineOccurrenceExecutionRepository;
  readonly walkRepository: WalkRepository;
  readonly dayRepository: DayRepository;
  readonly currentDateProvider: CurrentDateProvider;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: RoutineWalkUnitOfWork;
}
```

The command must:

1. call `validateFactDate` for `source.effectiveDate`;
2. load blocks/overrides once and resolve that exact occurrence;
3. require not skipped/rescheduled-source and `effectiveAssignment.kind === walk`;
4. select the first later visible occurrence on the same effective date;
5. return an already-active Walk only when `sameWalkRoutineOccurrenceReference` matches;
6. fail a different active Walk with `walk.running_exists`;
7. reuse the exact running execution, reject a different running occurrence with `routine_walk.another_routine_running`, and reject a terminal source with `routine_walk.source_not_startable`;
8. use one `const now = clock.now()` to create and start both existing aggregates;
9. call `unitOfWork.start(...)` once.

Build return context exactly as follows:

```ts
function routineReferenceOfOccurrence(
  occurrence: EffectiveRoutineOccurrence,
): WalkRoutineOccurrenceReference {
  return {
    routineBlockId: occurrence.sourceBlockId,
    occurrenceDate: occurrence.occurrenceDate,
    effectiveDate: occurrence.effectiveDate,
  };
}

const routineContext: WalkRoutineContext = {
  source: input.source,
  sourceTitle: occurrence.title,
  next: nextOccurrence === null ? null : routineReferenceOfOccurrence(nextOccurrence),
};
const linkedEntity = {
  type: WALK_LINKED_ENTITY_TYPE.routine,
  id: input.source.routineBlockId,
} as const;

returnContext: {
  origin: WALK_RETURN_ORIGIN.routine,
  entity: linkedEntity,
  nextStep: nextOccurrence?.title ?? null,
  routineContext,
},
```

Catch only `DomainError` into `failure`; let unexpected Infrastructure failures propagate to the existing page-level safe message.

- [ ] **Step 6: Verify start behavior and ordinary CreateWalk regression**

```powershell
npm run test -- src/application/commands/StartRoutineWalk.test.ts src/application/commands/WalkCommands.test.ts src/application/commands/StartWalk.test.ts
npm run typecheck
git diff --check -- src/application/ports/RoutineWalkUnitOfWork.ts src/application/walk/WalkCreationDefaults.ts src/application/commands/StartRoutineWalk.ts src/application/commands/StartRoutineWalk.test.ts src/application/commands/CreateWalk.ts src/application/index.ts
```

Expected: PASS; `StartWalk` and `CreateWalk` retain their ordinary persistence paths.

---

### Task 4: Finish routine-linked Walks atomically through existing commands

**Files:**

- Create: `src/application/commands/routineWalkFinishSupport.ts`
- Modify: `src/application/commands/CompleteWalk.ts`
- Modify: `src/application/commands/AbandonWalk.ts`
- Modify: `src/application/commands/FinishWalk.test.ts`

**Interfaces:**

- Consumes: `RoutineWalkUnitOfWork`, exact routine context, existing `CompleteWalk`/`AbandonWalk` inputs, and Routine execution repository.
- Produces: a shared routine finish path while preserving the ordinary Walk repository path.

- [ ] **Step 1: Write failing routine completion and abandonment tests**

Use a routine-linked active Walk, matching running execution, recording UoW, and one `FakeClock`. Assert:

```ts
expect(await complete.execute({ walkId: active.id })).toMatchObject({
  ok: true,
  value: { status: WALK_STATUS.completed, endedAt: ENDED_AT },
});
expect(unitOfWork.finishes[0]).toMatchObject({
  expectedWalkVersion: active.version,
  expectedExecutionVersion: execution.version,
  terminalStatus: WALK_STATUS.completed,
  execution: { status: ROUTINE_EXECUTION_STATUS.completed, actualEndedAt: ENDED_AT },
});
```

Repeat for abandon and assert no Outcome/Reentry. Add both idempotency shapes: an active Walk whose execution is already in the requested terminal state, and a repeated command where Walk and execution are already in the same terminal state. Add opposite-terminal conflict, missing execution, version conflict, and paused Walk cases. Retain ordinary tests that assert only `WalkRepository.updateIfVersionMatches` is called.

- [ ] **Step 2: Run the focused finish tests and verify RED**

```powershell
npm run test -- src/application/commands/FinishWalk.test.ts
```

Expected: routine-linked cases FAIL because commands still write only Walk.

- [ ] **Step 3: Implement the shared terminal coordinator**

Expose this dependency group and function:

```ts
export interface RoutineWalkFinishDependencies {
  readonly executionRepository: RoutineOccurrenceExecutionRepository;
  readonly unitOfWork: RoutineWalkUnitOfWork;
}

export async function finishRoutineWalk(input: {
  readonly storedWalk: Walk;
  readonly finishedWalk: Walk;
  readonly terminalStatus: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned;
  readonly dependencies: RoutineWalkFinishDependencies;
  readonly occurredAt: Date;
}): Promise<void>;
```

Load execution by the exact block/occurrence reference. Missing or mismatched data throws `routine_walk.source_changed`. If it is running, call `complete(occurredAt)` or `abandon(occurredAt)`. If it already has the requested terminal status, pass it unchanged for idempotent persistence. If the stored Walk is also already in the requested terminal state, pass both unchanged so the UoW can verify and return without a write. The opposite terminal status on either aggregate throws `routine_walk.terminal_conflict` before mutation.

- [ ] **Step 4: Branch `CompleteWalk` and `AbandonWalk` only on routine context**

Add a nullable third constructor dependency to preserve existing ordinary test construction:

```ts
public constructor(
  readonly repository: WalkRepository,
  readonly clock: Clock,
  readonly routine?: RoutineWalkFinishDependencies,
) {}
```

Capture `const occurredAt = this.clock.now()` once and use it for both aggregate transitions. For an active Walk, create the finished Walk and use the old `updateIfVersionMatches` path when routine context is null. When routine context is non-null, require configured routine dependencies and call `finishRoutineWalk`. For a repeated routine-linked command whose Walk already has the requested terminal state, call the same coordinator with the unchanged Walk; return success only after it verifies the matching execution terminal state. Map an impossible missing production dependency to `persistence.transaction_failed`; do not silently fall back to a non-atomic write. Keep ordinary terminal retries on their existing error contract.

- [ ] **Step 5: Verify ordinary and linked terminal paths**

```powershell
npm run test -- src/application/commands/FinishWalk.test.ts src/application/commands/WalkCommands.test.ts src/application/queries/GetWalkStatistics.test.ts
npm run typecheck
git diff --check -- src/application/commands/routineWalkFinishSupport.ts src/application/commands/CompleteWalk.ts src/application/commands/AbandonWalk.ts src/application/commands/FinishWalk.test.ts
```

Expected: PASS; ordinary Walk tests show no Routine writes, linked tests show one UoW call.

---

### Task 5: Implement the single IndexedDB transaction

**Files:**

- Create: `src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.ts`
- Create: `src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.test.ts`
- Modify: `src/infrastructure/index.ts`
- Inspect only: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`

**Interfaces:**

- Consumes: Task 3 port, existing record mappers, `byStatus`/`byOccurrence` indexes, and current database version 17.
- Produces: atomic start/finish over existing stores with optimistic validation and safe DomainErrors.

- [ ] **Step 1: Write failing persistence tests**

Use one `IDBFactory` and real repositories around the same `LifeOsIndexedDb`. Cover:

1. normal atomic start and reopen;
2. rescheduled occurrence validation;
3. same-source concurrent start returns the stored Walk;
4. other active Walk and other running Routine are rejected with no writes;
5. source block/override version changes abort both writes;
6. duplicate Walk-id `ConstraintError` rolls back a newly added execution;
7. complete and abandon persist both terminal records;
8. opposite terminal and Walk/execution version conflict leave both stores unchanged.

The rollback assertion must read both repositories after rejection:

```ts
await expect(unitOfWork.start(inputWithDuplicateWalkId)).rejects.toMatchObject({
  code: 'persistence.transaction_failed',
});
expect(await walkRepository.findActive()).toBeNull();
expect(await executionRepository.findByOccurrence(source.id, DATE)).toBeNull();
```

- [ ] **Step 2: Run the persistence test and verify RED**

```powershell
npm run test -- src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Open exactly the existing four stores in one readwrite transaction**

```ts
const transaction = database.transaction(
  [
    LIFE_OS_STORE.walks,
    LIFE_OS_STORE.routineOccurrenceExecutions,
    LIFE_OS_STORE.routineBlocks,
    LIFE_OS_STORE.routineOccurrenceOverrides,
  ],
  'readwrite',
);
```

Register transaction completion before awaiting requests. Reuse local typed `observeRequest`, `observeTransaction`, `abortQuietly`, and `settleTransaction` helpers following `IndexedDbDayCompletionUnitOfWork`.

- [ ] **Step 4: Implement transactional start validation and writes**

Within the transaction:

- read the source block by id and override through `byOccurrence`;
- validate expected block/override versions;
- rehydrate and call `resolveRoutineOccurrencesForDate` for `effectiveDate`;
- require exact reference, non-skipped state, and assignment `walk`;
- query Walk `byStatus` for both running and paused;
- query Routine execution `byStatus` and `byOccurrence`;
- return a same-source active Walk without adding either record;
- reject any different active/running record;
- add the active Walk with `store.add`;
- add execution only when none exists; otherwise require the exact running occurrence/version.

Throw the spec error codes before writes when possible. All unknown request/transaction failures become:

```ts
new DomainError(
  'persistence.transaction_failed',
  'Связанная прогулка не была сохранена. Повторите попытку.',
  { cause: error },
);
```

- [ ] **Step 5: Implement transactional finish validation and writes**

Read Walk by id and execution by exact occurrence. Require the stored Walk version and matching routine reference. Accept either an active Walk being transitioned or the same requested terminal state being verified; reject the opposite Walk terminal state. For execution:

- running + expected version → put transitioned execution and terminal Walk;
- already requested terminal → put only terminal Walk;
- Walk and execution already requested terminal → complete the transaction without writes;
- opposite terminal → `routine_walk.terminal_conflict`;
- any other version/source mismatch → `routine_walk.version_conflict`.

Await both writes and transaction completion before returning.

- [ ] **Step 6: Verify rollback, reopen, and unchanged schema**

```powershell
npm run test -- src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.test.ts src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/infrastructure/persistence/IndexedDbRoutineOccurrenceExecutionRepository.test.ts
npm run typecheck
git diff --check -- src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.ts src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.test.ts src/infrastructure/index.ts
```

Expected: PASS; database version/store/index snapshots remain identical.

---

### Task 6: Wire the command and prove the application composition

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Create: `src/app/composition/RoutineWalkComposition.integration.test.ts`
- Modify: `src/app/composition/WalkComposition.integration.test.ts`

**Interfaces:**

- Consumes: Tasks 3–5 commands/adapter and existing application service registry.
- Produces: `application.startRoutineWalk`; production Complete/Abandon commands configured with the shared UoW.

- [ ] **Step 1: Write a failing full composition test**

Create an open current Day and two Routine blocks (source assignment `walk`, next reminder), then execute:

```ts
const started = await application.startRoutineWalk.execute({
  source: {
    routineBlockId: source.id,
    occurrenceDate: DATE,
    effectiveDate: DATE,
  },
  intent: WALK_INTENT.free,
  mode: WALK_MODE.timer,
  timerTargetMinutes: 20,
});
expect(started).toMatchObject({ ok: true, value: { status: WALK_STATUS.running } });
expect(await application.getRunningRoutineOccurrence.execute()).toMatchObject({
  execution: { status: ROUTINE_EXECUTION_STATUS.running },
});
```

Close/reopen the app, complete the restored Walk, record an outcome, verify pending Reentry contains exact next reference, complete Reentry, and assert the Routine execution is completed. Add a separate abandon/reopen scenario and a rescheduled source scenario.

- [ ] **Step 2: Run composition tests and verify RED**

```powershell
npm run test -- src/app/composition/RoutineWalkComposition.integration.test.ts src/app/composition/WalkComposition.integration.test.ts
```

Expected: FAIL because composition does not expose or configure `StartRoutineWalk`.

- [ ] **Step 3: Instantiate one adapter and wire all three commands**

In `createLifeOsApplication.ts`:

```ts
const routineWalkUnitOfWork = new IndexedDbRoutineWalkUnitOfWork(database);
const startRoutineWalk = new StartRoutineWalk({
  routineBlockRepository,
  overrideRepository: routineOccurrenceOverrideRepository,
  executionRepository: routineOccurrenceExecutionRepository,
  walkRepository,
  dayRepository,
  currentDateProvider,
  clock,
  idGenerator,
  unitOfWork: routineWalkUnitOfWork,
});
const routineWalkFinish = {
  executionRepository: routineOccurrenceExecutionRepository,
  unitOfWork: routineWalkUnitOfWork,
};
const completeWalk = new CompleteWalk(walkRepository, clock, routineWalkFinish);
const abandonWalk = new AbandonWalk(walkRepository, clock, routineWalkFinish);
```

Add `startRoutineWalk` to `LifeOsApplicationServices`, public fields, constructor assignment, and returned service object. Do not expose a second repository or session service.

- [ ] **Step 4: Preserve ordinary composition behavior**

Extend the existing ordinary Walk completion test to keep asserting Routine executions are unchanged. Also assert Routine start/finish does not create ActionSession, change LifeAction, or alter adjacent Routine blocks/overrides.

- [ ] **Step 5: Verify composition and reload behavior**

```powershell
npm run test -- src/app/composition/RoutineWalkComposition.integration.test.ts src/app/composition/WalkComposition.integration.test.ts src/app/composition/createLifeOsApplication.test.ts src/app/composition/RoutineExecutionRecovery.integration.test.ts
npm run typecheck
git diff --check -- src/app/composition/LifeOsApplication.ts src/app/composition/createLifeOsApplication.ts src/app/composition/RoutineWalkComposition.integration.test.ts src/app/composition/WalkComposition.integration.test.ts
```

Expected: PASS after fresh reopen for active, completed, and abandoned states.

---

### Task 7: Add pure transient launch and Routine return navigation contracts

**Files:**

- Create: `src/presentation/routine/RoutineWalkNavigation.ts`
- Create: `src/presentation/routine/RoutineWalkNavigation.test.ts`
- Modify: `src/presentation/walk/WalkReentryFlow.ts`
- Modify: `src/presentation/walk/WalkReentryFlow.test.ts`
- Modify: `src/application/walk/WalkReentryPolicy.ts`
- Modify: `src/application/walk/WalkReentryPolicy.test.ts`

**Interfaces:**

- Consumes: effective occurrences, exact routine references, and `WalkReentryAction`.
- Produces: transient `RoutineWalkLaunchRequest`, `RoutineWalkDestinationRequest`, exact matching helpers, and post-persistence destination callback.

- [ ] **Step 1: Write failing policy/navigation tests**

Assert a better/same routine outcome resolves to `resumeContext` with routine context, while worse remains Today with null routine context. Assert launch snapshot and return target:

```ts
expect(createRoutineWalkLaunchRequest(source, [source, next])).toEqual({
  source: routineWalkReferenceOf(source),
  sourceTitle: source.title,
  plannedTimeLabel: `${source.effectiveStartTime}–${source.effectiveEndTime}`,
  nextStep: next.title,
});

expect(routineDestinationFor(reentryAction)).toEqual({
  date: next.effectiveDate,
  focus: next,
});
```

Also cover no-next fallback to source effective date and exact id + occurrenceDate + effectiveDate matching.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npm run test -- src/application/walk/WalkReentryPolicy.test.ts src/presentation/routine/RoutineWalkNavigation.test.ts src/presentation/walk/WalkReentryFlow.test.ts
```

Expected: FAIL because routine context is not propagated and navigation contracts do not exist.

- [ ] **Step 3: Implement immutable presentation request types**

```ts
export interface RoutineWalkLaunchRequest {
  readonly source: WalkRoutineOccurrenceReference;
  readonly sourceTitle: string;
  readonly plannedTimeLabel: string;
  readonly nextStep: string | null;
}

export interface RoutineWalkDestinationRequest {
  readonly date: DayDate;
  readonly focus: WalkRoutineOccurrenceReference | null;
}
```

Export `routineWalkReferenceOf(occurrence: EffectiveRoutineOccurrence): WalkRoutineOccurrenceReference` and use it consistently in presentation tests and request construction. `createRoutineWalkLaunchRequest(source: EffectiveRoutineOccurrence, occurrences: readonly EffectiveRoutineOccurrence[])` selects the first later non-skipped/non-rescheduled-source occurrence only for display. Application recomputes it authoritatively at start. `routineDestinationFor(action: WalkReentryAction): RoutineWalkDestinationRequest | null` returns null unless kind is `resumeContext`, destination is Routine, and routine context is present.

- [ ] **Step 4: Propagate routine context in policy without changing recovery priority**

For the return-context branch of `resolveWalkReentryAction`, copy `walk.returnContext.routineContext ?? null`. Every Today/recovery/review action explicitly sets `routineContext: null`.

- [ ] **Step 5: Navigate only after successful Reentry persistence**

Change `CompleteWalkReentryFlowInput` from section-only navigation to:

```ts
readonly onNavigate: (action: WalkReentryAction) => void;
```

After command success, read the action from `result.value.reentry`, await `onReentryChanged()`, then call `onNavigate(action)`. Failed persistence or missing action must call neither callback. Preserve close-without-continuation behavior.

- [ ] **Step 6: Verify the pure contracts**

```powershell
npm run test -- src/application/walk/WalkReentryPolicy.test.ts src/presentation/routine/RoutineWalkNavigation.test.ts src/presentation/walk/WalkReentryFlow.test.ts
npm run typecheck
git diff --check -- src/application/walk/WalkReentryPolicy.ts src/application/walk/WalkReentryPolicy.test.ts src/presentation/routine/RoutineWalkNavigation.ts src/presentation/routine/RoutineWalkNavigation.test.ts src/presentation/walk/WalkReentryFlow.ts src/presentation/walk/WalkReentryFlow.test.ts
```

Expected: PASS; worse-impact recovery still navigates to Today.

---

### Task 8: Integrate the Routine card without bypassing the atomic lifecycle

**Files:**

- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`
- Modify: `src/presentation/routine/RoutineAssignmentNavigation.test.ts`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- Consumes: Task 7 launch/return requests, `GetActiveWalk`, existing plan/fact and recovery queries.
- Produces: one launch CTA, linked-active return state, orphan recovery, exact focus/fallback, and no generic terminal bypass.

- [ ] **Step 1: Write failing static UI tests for all card states**

Extract/export a focused `RoutineOccurrenceActions` component if needed for server-render tests. Assert:

- not-started walk assignment has exactly one primary `Начать прогулку` and no `Начать блок`/secondary `Открыть прогулки`;
- linked active occurrence shows `Прогулка идёт` and `Вернуться к прогулке`;
- linked active occurrence has no `Завершить блок` or `Прервать`;
- orphan running execution retains recovery complete/abandon controls;
- non-walk assignments keep existing controls and labels.

```ts
expect(walkMarkup.match(/Начать прогулку/g)).toHaveLength(1);
expect(walkMarkup).not.toContain('Начать блок');
expect(linkedMarkup).toContain('Прогулка идёт');
expect(linkedMarkup).not.toContain('Завершить блок');
expect(reminderMarkup).toContain('Начать блок');
```

- [ ] **Step 2: Run Routine presentation tests and verify RED**

```powershell
npm run test -- src/presentation/pages/RoutinePage.test.ts src/presentation/routine/RoutineAssignmentNavigation.test.ts
```

Expected: walk cards still render separate generic start/open behavior.

- [ ] **Step 3: Extend RoutinePage props and read active Walk**

Add:

```ts
readonly getActiveWalk?: Pick<GetActiveWalk, 'execute'>;
readonly onStartWalk?: (request: RoutineWalkLaunchRequest) => void;
readonly routineReturnTarget?: RoutineWalkDestinationRequest | null;
readonly onRoutineReturnHandled?: () => void;
```

Reload active Walk alongside plan/fact data. Determine linkage only with exact routine reference matching; never infer from title or selected date.

- [ ] **Step 4: Render integration-specific actions and preserve orphan recovery**

For a not-started walk assignment call `onStartWalk(createRoutineWalkLaunchRequest(block, visibleBlocks))`. For linked active show one return CTA that calls existing Walks navigation. Hide generic start/finish/abandon/assignment-open controls only in these linked states. If execution is running but no matching active Walk exists, leave `RoutineRecoveryPanel` and its terminal commands available.

- [ ] **Step 5: Implement return focus and graceful fallback**

Give each card a stable exact key/ref and `tabIndex={-1}`. After loaded data matches `routineReturnTarget.date`, focus and scroll the exact target card and add `routine-return-target`. If it no longer exists, focus the routine-list heading. Call `onRoutineReturnHandled` after either result so highlighting is not replayed.

- [ ] **Step 6: Add restrained styles and verify regressions**

Add only integration classes for source/status/return highlight. Use existing tokens, `min-height: 44px`, `overflow-wrap: anywhere`, and `@media (prefers-reduced-motion: reduce)` behavior.

```powershell
npm run test -- src/presentation/pages/RoutinePage.test.ts src/presentation/routine/RoutineAssignmentNavigation.test.ts src/application/commands/RoutineExecutionCommands.test.ts
npm run typecheck
git diff --check -- src/presentation/pages/RoutinePage.tsx src/presentation/pages/RoutinePage.test.ts src/presentation/routine/RoutineAssignmentNavigation.test.ts src/presentation/styles/global.css
```

Expected: PASS; reminder/action/evening Routine cards retain current behavior.

---

### Task 9: Integrate Walk preparation, terminal controls, Reentry, and the shell

**Files:**

- Modify: `src/presentation/walk/WalkSessionFlow.tsx`
- Modify: `src/presentation/pages/WalksPage.tsx`
- Modify: `src/presentation/pages/WalksPage.test.ts`
- Modify: `src/presentation/walk/WalkReentryReminder.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/presentation/layouts/ApplicationShellView.test.ts`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- Consumes: `StartRoutineWalk`, `AbandonWalk`, Task 7 requests, modified Reentry flow, and existing Walk priority/session guard.
- Produces: Routine launch priority, source context in preparation/active states, atomic complete/abandon calls, and exact Routine destination routing.

- [ ] **Step 1: Write failing UI/flow tests**

Cover:

- active Walk > pending Reentry > Routine launch request > center;
- launch request opens the existing intent/preparation flow without persisting a Walk;
- preparation renders source title/time/next step;
- active linked screen renders `Из распорядка: …`;
- complete calls existing `CompleteWalk`, then outcome/Reentry;
- abandon calls `AbandonWalk`, returns to center, and does not show outcome/Reentry;
- stale source leaves preparation open with `role="alert"`, retry, and Routine return;
- Routine Reentry handler selects date, day section, hash route, and focus request only after persistence.

Extend the entry selector assertion:

```ts
expect(
  selectWalkSessionEntry({
    activeWalk: null,
    pendingReentry: null,
    pendingLoadFailed: false,
    routineLaunchRequest,
  }),
).toEqual({ phase: 'routineLaunch', walk: null });
```

- [ ] **Step 2: Run focused presentation tests and verify RED**

```powershell
npm run test -- src/presentation/pages/WalksPage.test.ts src/presentation/walk/WalkReentryFlow.test.ts src/presentation/layouts/ApplicationShellView.test.ts
```

Expected: FAIL because WalksPage has no Routine request/start/abandon props and shell navigation carries only an app section.

- [ ] **Step 3: Extend WalksPage inputs and preserve priority**

Add props:

```ts
readonly startRoutineWalk: Pick<StartRoutineWalk, 'execute'>;
readonly abandonWalk: Pick<AbandonWalk, 'execute'>;
readonly routineLaunchRequest: RoutineWalkLaunchRequest | null;
readonly onRoutineLaunchConsumed: () => void;
readonly onReturnToRoutine: (request: RoutineWalkDestinationRequest) => void;
```

Extend `selectWalkSessionEntry` with `routineLaunch` after active/Reentry/error checks. A pending request survives active Walk and Reentry states. Consume it only after successful atomic start or explicit user return/cancel.

- [ ] **Step 4: Route prepared start through one command**

Keep ordinary preparation as current `CreateWalk` then `StartWalk`. With a Routine request, call only:

```ts
await props.startRoutineWalk.execute({
  source: props.routineLaunchRequest.source,
  intent: draft.intent,
  reflectionTemplate: draft.reflectionTemplate ?? undefined,
  beforeState: draft.beforeState,
  mode: WALK_MODE.timer,
  timerTargetMinutes: draft.durationMinutes,
  reflectionQuestion: draft.reflectionQuestion,
});
```

Pass a read-only source block into `WalkPreparationForm`; render title, planned time, and `После прогулки: {nextStep ?? 'вернуться в распорядок'}`. On stale-source errors, keep the request and form.

- [ ] **Step 5: Add an explicit abandon confirmation and source line to the active panel**

Generalize terminal confirmation to `'complete' | 'abandon' | null`. Both actions use the existing submission guard. Complete continues to quick outcome; abandon clears active state and returns to center with no Outcome/Reentry. The linked source line reads from persisted `walk.returnContext.routineContext`, so reload does not depend on the transient launch request.

- [ ] **Step 6: Make shell navigation carry exact Routine destination state**

In `ApplicationShell`, keep two nullable states:

```ts
const [routineWalkLaunchRequest, setRoutineWalkLaunchRequest] =
  useState<RoutineWalkLaunchRequest | null>(null);
const [routineWalkDestination, setRoutineWalkDestination] =
  useState<RoutineWalkDestinationRequest | null>(null);
```

Routine launch sets the first state and opens Walks. Routine Reentry sets selected date, `ROUTINE_SECTION.day`, destination focus, active Routine section, and `writeRoutineRoute(ROUTINE_SECTION.day, request.date)`. Non-routine actions continue through `openSection(getWalkReentryPresentation(action).destination)`.

Pass `application.startRoutineWalk`, `application.abandonWalk`, and both callbacks to WalksPage; pass `application.getActiveWalk`, launch callback, and destination target to RoutinePage.

- [ ] **Step 7: Verify presentation, shell, and startup regressions**

```powershell
npm run test -- src/presentation/pages/WalksPage.test.ts src/presentation/pages/RoutinePage.test.ts src/presentation/walk/WalkReentryFlow.test.ts src/presentation/walk/WalkReentryReminder.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/app/ApplicationStartup.test.ts src/app/WalkReentryStartup.test.ts
npm run typecheck
git diff --check -- src/presentation/walk/WalkSessionFlow.tsx src/presentation/pages/WalksPage.tsx src/presentation/pages/WalksPage.test.ts src/app/ApplicationShell.tsx src/presentation/styles/global.css
```

Expected: PASS; active reload still opens Walks, Routine deep links and Evening startup remain unchanged.

---

### Task 10: Add browser coverage and run the full WALK-08 quality gate

**Files:**

- Modify: `tests/e2e/lifeos.smoke.spec.ts`
- Modify only if selectors require a stable semantic hook: `src/presentation/pages/RoutinePage.tsx`
- Modify only if selectors require a stable semantic hook: `src/presentation/walk/WalkSessionFlow.tsx`

**Interfaces:**

- Consumes: completed Tasks 1–9 and existing Playwright runtime/viewport helpers.
- Produces: desktop/mobile evidence for full Routine → Walk → Reentry and abandon/reload flows.

- [ ] **Step 1: Add a failing WALK-08 Playwright scenario**

Use the current project viewports but explicitly test 1366×768 and both mobile sizes. Seed only an open Day and two Routine block records into the current test database, then reload; do not write Walk or execution records from the test. The UI must create those through application commands.

```ts
test('WALK-08 starts from Routine and returns to the next occurrence atomically', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 });
  await page.goto('/');
  await seedOpenDayAndRoutineWalk(page);
  await page.reload();
  await openRoutine(page, mobile);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Какой будет эта прогулка?' })).toBeFocused();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByText('Из распорядка: Прогулка после обеда')).toBeVisible();
});
```

Continue through completion, outcome, Reentry, and assert Routine day/date plus focused/highlighted next card. Attach screenshots of Routine launch, preparation, active, Reentry, and returned target.

- [ ] **Step 2: Add abandon, reload, console, touch, and overflow assertions**

In a second scenario, start a routine Walk, reload while active, confirm source restoration, abandon it, reload, and verify both Walk and source occurrence are abandoned with no Reentry panel. For every state:

- collect console/page/HTTP errors with `observeRuntimeIssues`;
- call `expectNoHorizontalOverflow`;
- verify relevant controls have at least 44 px height;
- use `expectStageWithinViewport` at 390×844 and 360×800;
- verify keyboard focus after return.

- [ ] **Step 3: Run the focused browser test and inspect artifacts**

```powershell
npm run test:e2e -- --grep "WALK-08"
```

Expected: both desktop-chrome and mobile-chrome PASS with no console/page errors. Open each attached screenshot and compare against the approved spec/current LifeOS language. Record any visual limitation; do not claim pixel fidelity without a Figma reference.

- [ ] **Step 4: Run the focused cumulative WALK-08 suite**

```powershell
npm run test -- src/domain/walk/Walk.test.ts src/application/commands/StartRoutineWalk.test.ts src/application/commands/FinishWalk.test.ts src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbRoutineWalkUnitOfWork.test.ts src/app/composition/RoutineWalkComposition.integration.test.ts src/app/composition/WalkComposition.integration.test.ts src/application/walk/WalkReentryPolicy.test.ts src/presentation/routine/RoutineWalkNavigation.test.ts src/presentation/pages/RoutinePage.test.ts src/presentation/pages/WalksPage.test.ts src/presentation/walk/WalkReentryFlow.test.ts
```

Expected: PASS with no skipped WALK-08 scenarios.

- [ ] **Step 5: Run the full LifeOS quality gate**

Run each command separately and record its exact summary/exit code:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:alpha
npm run test:e2e
npm run build
npm run format:check
git diff --check
git diff --stat
git status --short
```

If Playwright finishes tests but its managed Vite cleanup hangs, confirm the browser results first, terminate only the exact spawned Vite/Playwright process after resolving its PID, then rerun the focused browser gate with a manually managed Vite server. Do not hide a failed browser assertion as a cleanup issue.

- [ ] **Step 6: Perform final scope and architecture review**

Review the full cumulative diff and prove:

- there is no `WalkSession`/`RoutineWalkSession` aggregate, repository, store, or engine;
- Walk elapsed time still derives from timestamps and pause intervals;
- same-source reload/start is idempotent and another active Walk is rejected;
- old Walk records restore;
- ordinary Walk and non-walk Routine behavior is unchanged;
- Decision/Goal/Project/LifeAction/Today files have no WALK-08 behavior changes;
- WALK-09/10 were not started;
- `.codex-temp/` is untracked and excluded;
- no push occurred.

Do not create a product commit until the cumulative review is clean and the user explicitly authorizes a checkpoint.
