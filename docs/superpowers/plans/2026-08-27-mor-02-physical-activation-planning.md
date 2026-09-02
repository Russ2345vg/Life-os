# MOR-02 Physical Activation Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reload-safe exercise catalog and current-morning physical plan editor to the accepted Morning Center without implementing exercise execution.

**Architecture:** A single persisted `ExerciseDefinition` catalog owns reusable system and custom exercises. The existing `MorningCycle` owns an ordered discriminated-union plan for its date and remains the only physical-stage aggregate; its existing application service performs current-date CAS mutations, while focused queries supply Morning Center and editor read models.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, IndexedDB/fake-indexeddb, Playwright, existing LifeOS CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-27-mor-02-physical-activation-planning-design.md`

## Global Constraints

- Work only in `D:\LifeOS-App`; preserve the accepted, uncommitted MOR-01/MOR-01.1 tree.
- Do not reuse an old LifeOS/Obsidian copy, add dependencies, push, or start MOR-03.
- Keep dependency flow UI → Presentation → Application → Domain; Infrastructure implements ports and App composes them.
- Do not use `any`, mutate domain state in React, or create a second exercise catalog or physical-plan store.
- Built-in and custom definitions use one `exerciseDefinitions` repository/store; the selected daily plan stays in `MorningCycle`.
- Measurement values remain a strict repetitions/duration union; no shared implicit target field.
- Persist every selection and stepper action immediately; no separate daily-plan Save action.
- The execution CTA changes presentation state only and never calls `startPhysical`, `completePhysical`, or an execution/result command.
- Visual source: the MOR-02 brief, accepted MOR-01, and `docs/codex/UI_RULES.md`; final verdict must include `Требуется ручная визуальная проверка` because no MOR-02 Figma/image exists.
- Do not commit implementation files from this dirty tree unless the user separately authorizes a commit; each task ends with a scoped diff checkpoint instead.

---

### Task 1: Exercise definition and physical-plan value contracts

**Files:**

- Create: `src/domain/morning-exercise/ExerciseDefinition.ts`
- Create: `src/domain/morning-exercise/ExerciseDefinition.test.ts`
- Create: `src/domain/morning-exercise/MorningPhysicalPlan.ts`
- Create: `src/domain/morning-exercise/MorningPhysicalPlan.test.ts`
- Create: `src/domain/morning-exercise/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Produces: `ExerciseDefinition`, `EXERCISE_MEASUREMENT_TYPE`, `EXERCISE_DEFINITION_SOURCE`, `SYSTEM_EXERCISE_DEFINITION_SEEDS`, and normalized-name helpers.
- Produces: `MorningPhysicalPlanItem`, plan bounds/defaults, defensive copy/assertion helpers, `createDefaultMorningPhysicalPlanItem`, `adjustMorningPhysicalPlanItem`, and `summarizeMorningPhysicalPlan`.
- Consumes: existing `Entity`, `EntityId`, `DomainError`, and defensive date-copy helpers.

- [ ] **Step 1: Write failing definition tests**

Add tests that name the breaks they catch:

```ts
it('normalizes a custom name and preserves a stable measurement type', () => {
  const definition = ExerciseDefinition.create({
    id: EntityId.create('custom-burpees'),
    name: '  Бёрпи   утром  ',
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    source: EXERCISE_DEFINITION_SOURCE.custom,
    occurredAt: NOW,
  });

  expect(definition.name).toBe('Бёрпи утром');
  expect(definition.normalizedName).toBe('бёрпи утром');
  expect(definition.measurementType).toBe('REPETITIONS');
  expect(definition.archivedAt).toBeNull();
});

it.each(['', '   ', 'x'.repeat(81)])('rejects an unusable exercise name: %j', (name) => {
  expect(() => createCustom(name)).toThrowError();
});

it('keeps five stable system definitions in priority order', () => {
  expect(SYSTEM_EXERCISE_DEFINITION_SEEDS.map(({ name }) => name)).toEqual([
    'Отжимания',
    'Подтягивания',
    'Приседания',
    'Планка',
    'Пресс',
  ]);
});
```

Archive behavior must prove the original ID/type remain unchanged and repeated archival is idempotent.

- [ ] **Step 2: Run the definition target and confirm RED**

Run:

```powershell
npm run test:target -- src/domain/morning-exercise/ExerciseDefinition.test.ts
```

Expected: FAIL because the module and exported contracts do not exist.

- [ ] **Step 3: Implement the minimal definition model**

Use exact public constants and a single canonical seed table:

```ts
export const EXERCISE_MEASUREMENT_TYPE = {
  repetitions: 'REPETITIONS',
  duration: 'DURATION',
} as const;

export const EXERCISE_DEFINITION_SOURCE = {
  system: 'SYSTEM',
  custom: 'CUSTOM',
} as const;

export const SYSTEM_EXERCISE_DEFINITION_SEEDS = [
  { id: 'morning-exercise.push-ups', name: 'Отжимания', measurementType: 'REPETITIONS' },
  { id: 'morning-exercise.pull-ups', name: 'Подтягивания', measurementType: 'REPETITIONS' },
  { id: 'morning-exercise.squats', name: 'Приседания', measurementType: 'REPETITIONS' },
  { id: 'morning-exercise.plank', name: 'Планка', measurementType: 'DURATION' },
  { id: 'morning-exercise.abs', name: 'Пресс', measurementType: 'REPETITIONS' },
] as const;
```

`normalizeExerciseDefinitionName` must trim, collapse internal whitespace, and lowercase for the unique key. `ExerciseDefinition.create/rehydrate/archive` validates dates, source, type, version, and archive chronology and returns defensive dates.

- [ ] **Step 4: Run the definition target and confirm GREEN**

Run the same target. Expected: all definition tests PASS with no warnings.

- [ ] **Step 5: Write failing plan-value tests**

Cover hand-derived literals for both union branches:

```ts
it('creates measurement-specific defaults without leaking them into a definition', () => {
  expect(createDefaultMorningPhysicalPlanItem(id('push-ups'), 'REPETITIONS')).toEqual({
    exerciseDefinitionId: id('push-ups'),
    measurementType: 'REPETITIONS',
    sets: 3,
    targetReps: 10,
  });
  expect(createDefaultMorningPhysicalPlanItem(id('plank'), 'DURATION')).toEqual({
    exerciseDefinitionId: id('plank'),
    measurementType: 'DURATION',
    sets: 3,
    targetDurationSeconds: 30,
  });
});

it('summarizes six sets as an explainable twelve-minute estimate', () => {
  expect(summarizeMorningPhysicalPlan([repetitionItem(3, 15), repetitionItem(3, 6)])).toEqual({
    selectedCount: 2,
    totalSets: 6,
    estimatedMinutes: 12,
  });
});
```

Add table cases for sets `0`, `11`, fractions, `NaN`, infinities; repetitions `0` and `101`; duration `4`, `601`, and non-5-second increments; incompatible fields; duplicate definition IDs; and boundary-preserving decrement/increment behavior.

- [ ] **Step 6: Run the plan-value target and confirm RED**

```powershell
npm run test:target -- src/domain/morning-exercise/MorningPhysicalPlan.test.ts
```

Expected: FAIL because the value functions do not exist.

- [ ] **Step 7: Implement the strict plan union and central calculation**

Use these bounds and adjustment contract:

```ts
export const MORNING_PHYSICAL_PLAN_LIMIT = {
  minSets: 1,
  maxSets: 10,
  minReps: 1,
  maxReps: 100,
  minDurationSeconds: 5,
  maxDurationSeconds: 600,
  durationStepSeconds: 5,
  estimatedMinutesPerSet: 2,
} as const;

export type MorningPhysicalPlanAdjustment =
  | { readonly field: 'sets'; readonly delta: -1 | 1 }
  | { readonly field: 'target'; readonly delta: -1 | 1 };
```

Adjustment returns the unchanged item at a limit, rejects unsupported deltas, increments repetitions by 1 and duration by 5 seconds, and always returns a defensive `EntityId`-preserving copy. `summarizeMorningPhysicalPlan` is the only source of counts and estimate.

- [ ] **Step 8: Run both domain targets and inspect the scoped diff**

```powershell
npm run test:target -- src/domain/morning-exercise/ExerciseDefinition.test.ts
npm run test:target -- src/domain/morning-exercise/MorningPhysicalPlan.test.ts
git diff --check -- src/domain/morning-exercise src/domain/index.ts
git diff -- src/domain/morning-exercise src/domain/index.ts
```

Expected: both targets PASS; diff contains only the new focused domain contracts and barrel export.

---

### Task 2: Persist the daily plan in the existing MorningCycle

**Files:**

- Modify: `src/domain/morning-cycle/MorningCycle.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.test.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.test.ts`
- Modify: `src/infrastructure/persistence/records/MorningCycleRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts`

**Interfaces:**

- Consumes: Task 1 plan-item types, defaults, adjustment, assertions, and summary.
- Produces: defensive `MorningCycle.physicalPlanItems` plus `selectPhysicalExercise`, `deselectPhysicalExercise`, and `adjustPhysicalExercise` aggregate operations.
- Produces: service commands with current-date/CAS guarantees and record round-trip of `physicalPlanItems`.

- [ ] **Step 1: Write failing MorningCycle behavior tests**

Add tests proving:

```ts
it('selects one exercise once and makes a non-empty plan ready', () => {
  const cycle = startedCycle();

  expect(cycle.selectPhysicalExercise(id('push-ups'), 'REPETITIONS', NOW)).toBe(true);
  expect(cycle.selectPhysicalExercise(id('push-ups'), 'REPETITIONS', LATER)).toBe(false);
  expect(cycle.physicalPlanItems).toEqual([
    {
      exerciseDefinitionId: id('push-ups'),
      measurementType: 'REPETITIONS',
      sets: 3,
      targetReps: 10,
    },
  ]);
  expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.ready);
});

it('returns to not configured only after the last planned exercise is removed', () => {
  const cycle = cycleWithTwoExercises();
  cycle.deselectPhysicalExercise(id('push-ups'), NOW);
  expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.ready);
  cycle.deselectPhysicalExercise(id('pull-ups'), LATER);
  expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.notConfigured);
});
```

Also cover selection order, remove/reselect append order, both target adjustments, defensive reads, idempotent boundary clicks, terminal-state rejection, and legacy rehydrate of `READY` with an empty plan.

- [ ] **Step 2: Run the MorningCycle target and confirm RED**

```powershell
npm run test:target -- src/domain/morning-cycle/MorningCycle.test.ts
```

Expected: FAIL on the missing plan field and methods.

- [ ] **Step 3: Implement aggregate ownership**

Add `physicalPlanItems` to creation/rehydration, store a defensive array, validate it through Task 1 helpers, and expose the three typed mutations. Each real change calls the existing `change(occurredAt)` once. Planning requires a started active cycle, rejects `IN_PROGRESS`/`DONE`/`SKIPPED`, and never calls execution methods.

- [ ] **Step 4: Run the MorningCycle target and confirm GREEN**

Expected: the expanded MorningCycle suite PASS, including existing physical transition tests.

- [ ] **Step 5: Write failing application-service tests**

Extend the constructor fixture with an exercise-definition repository and assert:

```ts
const selected = await service.selectPhysicalExercise(DATE, id('push-ups'));
expect(selected.physicalPlanItems[0]).toMatchObject({
  measurementType: 'REPETITIONS',
  sets: 3,
  targetReps: 10,
});

await expect(service.selectPhysicalExercise(YESTERDAY, id('push-ups'))).rejects.toThrow(
  'Изменять утренний блок можно только для текущего дня.',
);
```

Add missing/archived definition rejection, deselect, both adjustments, a successful one-conflict retry, and the existing two-conflict error.

- [ ] **Step 6: Run the service target and confirm RED**

```powershell
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
```

Expected: FAIL because the repository dependency and commands are absent.

- [ ] **Step 7: Implement service commands without duplicating CAS**

Add `ExerciseDefinitionRepository` to the service constructor. Selection resolves an active definition before entering the existing `mutate`; deselection/adjustment use the stored plan. Export these exact methods:

```ts
selectPhysicalExercise(date: DayDate, definitionId: EntityId): Promise<MorningCycle>;
deselectPhysicalExercise(date: DayDate, definitionId: EntityId): Promise<MorningCycle>;
adjustPhysicalExercise(
  date: DayDate,
  definitionId: EntityId,
  adjustment: MorningPhysicalPlanAdjustment,
): Promise<MorningCycle>;
```

Update `cloneMorningCycle` so every unrelated MOR-01 mutation preserves a defensive plan copy.

- [ ] **Step 8: Write mapper/repository RED tests**

Add exact round-trip assertions for both union branches, a legacy record missing `physicalPlanItems`, explicit legacy null, duplicate IDs, incompatible target fields, and close/reopen IndexedDB persistence.

- [ ] **Step 9: Run persistence targets and confirm RED**

```powershell
npm run test:target -- src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
```

Expected: FAIL because record/mapping support is absent.

- [ ] **Step 10: Implement additive record mapping and confirm GREEN**

Keep `schemaVersion: 1`. Write a measurement-specific record union and a reader that returns `[]` when the field is missing or null, but validates every known item otherwise. Run:

```powershell
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
npm run test:target -- src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
git diff --check -- src/domain/morning-cycle src/application/morning-cycle src/infrastructure/persistence
```

Expected: all targets PASS and existing water/shower/physical facts remain intact.

---

### Task 3: One persisted exercise catalog and database migration

**Files:**

- Create: `src/application/ports/ExerciseDefinitionRepository.ts`
- Modify: `src/application/ports/index.ts`
- Create: `src/infrastructure/persistence/records/ExerciseDefinitionRecord.ts`
- Modify: `src/infrastructure/persistence/records/index.ts`
- Create: `src/infrastructure/persistence/mappers/ExerciseDefinitionRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/index.ts`
- Create: `src/infrastructure/persistence/IndexedDbExerciseDefinitionRepository.ts`
- Create: `src/infrastructure/persistence/IndexedDbExerciseDefinitionRepository.test.ts`
- Create: `src/infrastructure/persistence/InMemoryExerciseDefinitionRepository.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`
- Modify: `src/infrastructure/index.ts`

**Interfaces:**

- Produces: `ExerciseDefinitionRepository.findById`, `findAll`, and `add`.
- Produces: IndexedDB version 19, `LIFE_OS_STORE.exerciseDefinitions`, unique `byNormalizedName`, and five system records in the same store.
- Consumes: Task 1 entity, seed table, normalization, and the established mapper/request helpers.

- [ ] **Step 1: Write repository and migration RED tests**

Repository tests must prove fresh system definitions, custom add/reopen, normalized duplicate rejection, archived records retained in `findAll`, and defensive entity reconstruction.

Migration test outline:

```ts
it('upgrades a literal version-18 database without losing existing morning data', async () => {
  const factory = new IDBFactory();
  await createVersion18Fixture(factory, existingMorningRecord);

  const database = await new LifeOsIndexedDb(factory).open();

  expect(database.version).toBe(19);
  expect([...database.objectStoreNames]).toContain('exerciseDefinitions');
  expect(await readMorningRecord(database, existingMorningRecord.id)).toEqual(
    existingMorningRecord,
  );
  expect(await readExerciseNames(database)).toEqual([
    'Отжимания',
    'Подтягивания',
    'Приседания',
    'Планка',
    'Пресс',
  ]);
});
```

- [ ] **Step 2: Run migration/repository targets and confirm RED**

```powershell
npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbExerciseDefinitionRepository.test.ts
```

Expected: FAIL on database version/store/repository symbols.

- [ ] **Step 3: Implement the port, record, mapper, and adapters**

Use this port:

```ts
export interface ExerciseDefinitionRepository {
  findById(id: EntityId): Promise<ExerciseDefinition | null>;
  findAll(): Promise<readonly ExerciseDefinition[]>;
  add(definition: ExerciseDefinition): Promise<boolean>;
}
```

`add` returns `false` for an existing ID or normalized-name constraint and never overwrites. `findAll` returns system definitions in canonical seed order followed by custom definitions by creation time/name; ordering is resolved in application/query code if IndexedDB cursor order is not semantic.

- [ ] **Step 4: Implement version 19 and canonical seeding**

Increment `LIFE_OS_DATABASE_VERSION` to `19`, append `exerciseDefinitions` to `LIFE_OS_STORE`, add `createVersionNineteenSchema`, create the unique name index, and add records derived from `SYSTEM_EXERCISE_DEFINITION_SEEDS` with stable seed timestamps and version 1 in the upgrade transaction. Do not keep a second UI list of built-ins.

- [ ] **Step 5: Run targets and inspect migration output**

```powershell
npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbExerciseDefinitionRepository.test.ts
git diff --check -- src/application/ports src/infrastructure
```

Expected: both targets PASS, including literal v18 preservation and close/reopen.

---

### Task 4: Catalog command and focused planning read models

**Files:**

- Create: `src/application/morning-exercise/MorningExerciseCatalogService.ts`
- Create: `src/application/morning-exercise/MorningExerciseCatalogService.test.ts`
- Create: `src/application/morning-exercise/index.ts`
- Create: `src/application/queries/GetMorningPhysicalActivationOverview.ts`
- Create: `src/application/queries/GetMorningPhysicalActivationOverview.test.ts`
- Modify: `src/application/queries/GetMorningCenterOverview.ts`
- Modify: `src/application/queries/GetMorningCenterOverview.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: definition/cycle repositories, `Clock`, `IdGenerator`, `CurrentDateProvider`, Task 1 summary.
- Produces: `MorningExerciseCatalogService.createCustom(name, measurementType)`.
- Produces: immutable `MorningPhysicalActivationOverview` with active library, selected ordered rows, capabilities, and real summary.
- Extends: `MorningCenterOverview.physicalPlan` and physical stage estimate/copy data.

- [ ] **Step 1: Write catalog-service RED tests**

```ts
it('creates one reusable custom duration definition', async () => {
  const created = await service.createCustom('  Вис на перекладине ', 'DURATION');

  expect(created.name).toBe('Вис на перекладине');
  expect(created.source).toBe('CUSTOM');
  expect((await repository.findAll()).map(({ name }) => name)).toContain('Вис на перекладине');
});

it('rejects a normalized duplicate without overwriting the original', async () => {
  await service.createCustom('Бёрпи', 'REPETITIONS');
  await expect(service.createCustom('  бёрпи ', 'DURATION')).rejects.toThrow(
    'Упражнение с таким названием уже существует.',
  );
});
```

- [ ] **Step 2: Run the catalog target and confirm RED, then implement GREEN**

```powershell
npm run test:target -- src/application/morning-exercise/MorningExerciseCatalogService.test.ts
```

Expected RED: service absent. Implement using `Clock`, `IdGenerator`, and repository `add`; rerun and expect PASS.

- [ ] **Step 3: Write focused overview RED tests**

Use real in-memory repositories. Prove:

- the library order prioritizes Отжимания and Подтягивания;
- selected rows follow plan order and expose exactly one target field;
- selected archived definitions remain resolvable but are absent from selectable library;
- current date is editable only for an active cycle before execution;
- historical date is read-only;
- empty summary is `{ selectedCount: 0, totalSets: 0, estimatedMinutes: 0 }`;
- `3×15` plus `3×6` returns `{ selectedCount: 2, totalSets: 6, estimatedMinutes: 12 }`.

- [ ] **Step 4: Run the focused overview target and confirm RED**

```powershell
npm run test:target -- src/application/queries/GetMorningPhysicalActivationOverview.test.ts
```

Expected: FAIL because the query/read model is absent.

- [ ] **Step 5: Implement the immutable editor read model**

Use exact shapes:

```ts
interface MorningPhysicalLibraryItem {
  readonly id: EntityId;
  readonly name: string;
  readonly measurementType: ExerciseMeasurementType;
  readonly selected: boolean;
}

interface MorningPhysicalActivationOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly canEditPlan: boolean;
  readonly canCreateCustom: boolean;
  readonly library: readonly MorningPhysicalLibraryItem[];
  readonly selectedItems: readonly MorningPhysicalSelectedItem[];
  readonly summary: MorningPhysicalPlanSummary;
}
```

Resolve selected IDs against all definitions and throw a persistence-integrity `DomainError` if a referenced definition is missing; never fabricate a name.

- [ ] **Step 6: Add Morning Center RED assertions**

Extend the existing query fixtures so an empty plan keeps the accepted 10-minute baseline and a six-set plan reports `selectedCount: 2`, `totalSets: 6`, physical stage `estimatedMinutes: 12`, and recalculated remaining time. Confirm `READY` does not advance the stage or add physical progress.

- [ ] **Step 7: Run the Morning Center target and confirm RED, then implement GREEN**

```powershell
npm run test:target -- src/application/queries/GetMorningCenterOverview.test.ts
```

Implement the summary by calling `summarizeMorningPhysicalPlan`; do not reproduce the formula. Rerun both query targets and expect PASS.

- [ ] **Step 8: Inspect the application diff**

```powershell
git diff --check -- src/application src/domain/morning-exercise
git diff -- src/application/morning-exercise src/application/queries src/application/index.ts
```

Expected: no JSX/business-rule duplication and no execution command.

---

### Task 5: App composition and restart-safe integration

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`

**Interfaces:**

- Consumes: `IndexedDbExerciseDefinitionRepository`, catalog service, focused overview, and expanded MorningCycle service.
- Produces: `application.exerciseDefinitionRepository`, `morningExerciseCatalog`, and `getMorningPhysicalActivationOverview`.
- Passes: focused services through `ApplicationShell` → `RoutinePage` → `MorningCenterPage` without exposing concrete infrastructure to Presentation.

- [ ] **Step 1: Write composition RED tests**

Assert the real adapter type and one restart scenario:

```ts
expect(application.exerciseDefinitionRepository).toBeInstanceOf(
  IndexedDbExerciseDefinitionRepository,
);

await application.morningCycle.selectPhysicalExercise(application.currentDate, PUSH_UPS_ID);
application.close();

const reopened = await createLifeOsApplication({ indexedDb: sameFactory, clock, currentDate });
expect(
  (await reopened.getMorningPhysicalActivationOverview.execute(reopened.currentDate)).summary,
).toEqual({ selectedCount: 1, totalSets: 3, estimatedMinutes: 6 });
```

Also create a custom duration definition before close and assert it remains in the reopened library.

- [ ] **Step 2: Run composition/Routine targets and confirm RED**

```powershell
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
```

Expected: FAIL on missing services and prop contracts.

- [ ] **Step 3: Wire infrastructure and application services**

Construct one `IndexedDbExerciseDefinitionRepository(database)`, pass it into the existing `MorningCycleApplicationService`, construct `MorningExerciseCatalogService` and `GetMorningPhysicalActivationOverview`, expose them on `LifeOsApplication`, and include them in the explicit constructor assignment. Update barrels rather than importing Infrastructure from Presentation.

- [ ] **Step 4: Extend presentation service picks only as far as needed**

`RoutinePage` should receive:

```ts
readonly morningCenter: {
  readonly getOverview: Pick<GetMorningCenterOverview, 'execute'>;
  readonly getPhysicalOverview: Pick<GetMorningPhysicalActivationOverview, 'execute'>;
  readonly cycle: Pick<MorningCycleApplicationService,
    | 'start'
    | 'completeWater'
    | 'completeColdShower'
    | 'skipColdShower'
    | 'shorten'
    | 'abandonUnfinished'
    | 'selectPhysicalExercise'
    | 'deselectPhysicalExercise'
    | 'adjustPhysicalExercise'>;
  readonly exerciseCatalog: Pick<MorningExerciseCatalogService, 'createCustom'>;
  readonly clock: Pick<Clock, 'now'>;
};
```

- [ ] **Step 5: Run integration targets and inspect scope**

```powershell
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
git diff --check -- src/app src/presentation/pages/RoutinePage.tsx src/presentation/pages/RoutinePage.test.ts
```

Expected: PASS; Day/Evening branches and existing MOR-01 wiring remain unchanged.

---

### Task 6: Physical activation presentation and responsive styling

**Files:**

- Create: `src/presentation/pages/MorningPhysicalActivationPage.tsx`
- Create: `src/presentation/pages/MorningPhysicalActivationPage.test.ts`
- Create: `src/presentation/components/MorningExerciseIcon.tsx`
- Modify: `src/presentation/pages/MorningCenterPage.tsx`
- Modify: `src/presentation/pages/MorningCenterPage.test.ts`
- Create: `src/presentation/styles/morning-physical-activation.css`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- Consumes: Task 4 overview/query, Task 2 planning commands, catalog creation command, and Morning Center callbacks.
- Produces: accessible `MorningPhysicalActivationPage` controller, pure renderable view, inline custom form, selected steppers, metrics, and presentation-only execution entry.
- Extends: `MorningCenterViewKind` with `physicalActivation`; Back restores `#morning-physical-trigger` focus.

- [ ] **Step 1: Write static presentation RED tests**

Add tests for the observable copy and semantics:

```ts
expect(markup).toContain('Физическая активация');
expect(markup).toContain('Выбери упражнения и настрой нагрузку на сегодняшнее утро.');
expect(markup).toContain('Библиотека');
expect(markup).toContain('Сегодняшний набор');
expect(markup).toContain('Выбрано');
expect(markup).toContain('2 упражнения');
expect(markup).toContain('6 подходов');
expect(markup).toContain('≈ 12 мин');
expect(markup).not.toContain('MOR-03');
expect(markup).not.toContain('будет реализовано позже');
```

Separate cases cover empty plan with disabled `Начать выполнение`, selected gold state/check, repetitions versus seconds labels, inline custom form, pending/error/read-only, long custom name, and the `План на утро готов` entry without execution controls.

- [ ] **Step 2: Run presentation targets and confirm RED**

```powershell
npm run test:target -- src/presentation/pages/MorningPhysicalActivationPage.test.ts
npm run test:target -- src/presentation/pages/MorningCenterPage.test.ts
```

Expected: FAIL because the page and physical-stage action do not exist.

- [ ] **Step 3: Implement the controller and pure view**

The controller loads on date/query change, reloads after every command, disables mutations while pending, and exposes retry. Use controlled custom-name/type form state only for transient form input; catalog/plan state always comes from the query.

Use a real button per library card with `aria-pressed`, accessible stepper names such as `Увеличить подходы: Отжимания`, and an `aria-live="polite"` summary. Keep the DOM order on mobile as library → selected set → CTA; CSS may place the right rail on desktop without changing reading order.

- [ ] **Step 4: Integrate the Morning Center stage action and focus flow**

Add `onOpenPhysicalActivation` to the center view. The physical card renders `Открыть` only when it is the current editable stage or a read-only saved plan is available. Opening focuses `#morning-physical-heading`; Back sets a restore flag and focuses `#morning-physical-trigger`. Quick Start behavior remains unchanged.

Stage copy uses the read-model summary:

```ts
physicalPlan.totalSets === 0 ? 'Упражнения не выбраны' : `${exerciseCountLabel} · ${setsLabel}`;
```

Plural helpers belong in one presentation helper and have literal tests for 1, 2, 5, 11, 21.

- [ ] **Step 5: Add code-native icons and scoped CSS**

`MorningExerciseIcon` renders small outline SVG paths for push-ups, pull-ups, squats, plank, abs, and a generic custom exercise; it accepts a stable system definition ID and never puts icon mapping in Domain.

Import the new stylesheet from `global.css`. Reuse tokens only. Desktop uses `minmax(0, 1.45fr) minmax(18rem, 0.75fr)`; at `max-width: 48rem` use one column. Add `min-width: 0`, wrapping for long names, `:focus-visible`, 2.75rem minimum controls, selected gold border/check, pending/disabled opacity, safe bottom spacing, and `prefers-reduced-motion` handling. Do not add sticky overlays, glow, purple, or hardcoded sample data.

- [ ] **Step 6: Run presentation/Routine targets and static hygiene**

```powershell
npm run test:target -- src/presentation/pages/MorningPhysicalActivationPage.test.ts
npm run test:target -- src/presentation/pages/MorningCenterPage.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
git diff --check -- src/presentation src/app/ApplicationShell.tsx
```

Expected: PASS with no developer terms in rendered states and no CSS overflow-prone fixed widths.

---

### Task 7: Targeted MOR-02 acceptance, full gate, and local handoff

**Files:**

- Modify: `tests/e2e/morning-center.acceptance.spec.ts`
- Update after execution: `docs/superpowers/plans/2026-08-27-mor-02-physical-activation-planning.md` checkboxes/evidence only if the project convention requires it.

**Interfaces:**

- Exercises: the complete real route, application commands, IndexedDB persistence, responsive CSS, focus, and console/page errors.
- Produces: fresh command evidence and a running local preview address; no product behavior beyond MOR-02.

- [ ] **Step 1: Add a separate MOR-02 E2E scenario before changing E2E-only selectors**

Drive the UI rather than seeding plan records:

1. Open today's morning route and complete Quick Start.
2. Open Physical activation and confirm heading focus.
3. Select Отжимания and Подтягивания.
4. Adjust to `3 × 15` and `3 × 6` using accessible stepper names.
5. Assert `2 упражнения`, `6 подходов`, and `≈ 12 мин`.
6. Deselect Подтягивания, assert one exercise, then select it again and restore `3 × 6`.
7. Reload; assert selected definitions and targets persist.
8. Return to Morning Center; assert `2 упражнения · 6 подходов`.
9. Reopen; assert the same values.
10. Expand `+ Добавить своё`, create a duration exercise, select it, and assert seconds controls.
11. Verify execution CTA is disabled in an empty-plan subscenario and shows only `План на утро готов` when enabled.
12. Verify Back restores focus, all visible controls are at least 44px, no horizontal overflow at 1600×900, 1280×720, 390×844, and 360×800, and collected console/pageerror issues remain empty.

- [ ] **Step 2: Run the E2E list and targeted MOR-02 file**

```powershell
npm run test:e2e:list
npm run test:e2e -- tests/e2e/morning-center.acceptance.spec.ts
```

Expected: managed runner lists and passes the MOR-01 and MOR-02 scenarios with retries disabled, then releases port 4173.

- [ ] **Step 3: Run targeted regression set in canonical order**

```powershell
npm run test:target -- src/domain/morning-exercise/ExerciseDefinition.test.ts
npm run test:target -- src/domain/morning-exercise/MorningPhysicalPlan.test.ts
npm run test:target -- src/domain/morning-cycle/MorningCycle.test.ts
npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts
npm run test:target -- src/application/morning-exercise/MorningExerciseCatalogService.test.ts
npm run test:target -- src/application/queries/GetMorningPhysicalActivationOverview.test.ts
npm run test:target -- src/application/queries/GetMorningCenterOverview.test.ts
npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbExerciseDefinitionRepository.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts
npm run test:target -- src/presentation/pages/MorningPhysicalActivationPage.test.ts
npm run test:target -- src/presentation/pages/MorningCenterPage.test.ts
npm run test:target -- src/presentation/pages/RoutinePage.test.ts
```

Record exit code, duration, and pass counts for every command. Any timeout code 124 is unresolved/failing evidence.

- [ ] **Step 4: Run broad pre-gate checks after stabilization**

```powershell
npm run test:fast
npm run typecheck
npm run lint
```

Expected: all exit 0. Fix only MOR-02 regressions using a new RED test before implementation changes.

- [ ] **Step 5: Run the final quality gate exactly once**

```powershell
npm run verify
```

Expected: typecheck, lint, full tests, infrastructure self-tests, alpha, E2E, build, format check, and `git diff --check` all complete with exit 0. Do not rerun without a new reason.

- [ ] **Step 6: Perform final diff/status and browser evidence review**

```powershell
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Read the full MOR-02 diff for architecture, user-data, persistence, accessibility, and scope regressions. Confirm no dependency/lockfile changes, secrets, generated artifacts, MOR-03 execution, or unrelated edits.

- [ ] **Step 7: Start the bounded local preview and leave it running**

Start Vite with a strict explicit host/port through the project's installed binary rather than using `npm run dev` as a gate:

```powershell
npm exec vite -- --host 127.0.0.1 --port 4173 --strictPort
```

Leave the owned process running only after readiness is confirmed. Report `http://127.0.0.1:4173/#/routine/morning?date=<today>` and do not run the managed E2E while that port is occupied.

- [ ] **Step 8: Deliver the required evidence and stop**

Report changed files, the `ExerciseDefinition` model, the embedded daily-plan format, repetitions/duration separation, `MorningCycle` relationship, targeted commands/results, targeted E2E result, one final verify result, browser states/viewports/console result, manual visual-review limitation, and local address. Do not push and do not begin MOR-03.
