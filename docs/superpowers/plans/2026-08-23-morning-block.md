# Morning Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first persistent, responsive `Распорядок → Утро` workflow without implementing the exercise library.

**Architecture:** A focused `MorningCycle` aggregate persists morning-only facts. Application services mutate it, while `GetMorningOverview` combines it with existing `TomorrowPlan`, `Decision`, `LifeAction`, and `RoutineBlock` data to derive progress and one next step. A dedicated React page renders the read model and delegates all state changes to application commands.

**Tech Stack:** TypeScript 6, React 19, Vitest, IndexedDB/fake-indexeddb, existing LifeOS CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-23-morning-block-design.md`

## Global Constraints

- Work only inside `C:\LifeOS-App` and preserve all existing uncommitted changes.
- Do not use `any`, access infrastructure from domain/presentation, or mutate domain state from React.
- Do not add dependencies, commits, exercise library, history, analytics, timers, sets, or repetitions.
- Mutations are current-date-only; selected historical/future dates are read-only.
- Complete the full project quality gate before reporting completion.

---

### Task 1: MorningCycle domain

**Files:**

- Create: `src/domain/morning-cycle/MorningPhysicalStatus.ts`
- Create: `src/domain/morning-cycle/MorningCycle.ts`
- Create: `src/domain/morning-cycle/MorningCycle.test.ts`
- Create: `src/domain/morning-cycle/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Produces: `MORNING_PHYSICAL_STATUS`, `MorningPhysicalStatus`, `MorningCycle`, `MorningCycleRehydrationData`.
- `MorningCycle.start(at)`, `completeWater(at, amountMl)`, `skipPhysical(at)`, `preparePhysical(at)`, `startPhysical(at)`, and `completePhysical(at)` return `boolean` for idempotent mutations.

- [ ] **Step 1: Write failing aggregate tests**

```ts
it('keeps the first start and water timestamps on repeated commands', () => {
  const cycle = createCycle();
  expect(cycle.start(STARTED_AT)).toBe(true);
  expect(cycle.start(LATER)).toBe(false);
  expect(cycle.completeWater(WATER_AT, 250)).toBe(true);
  expect(cycle.completeWater(LATER, 250)).toBe(false);
  expect(cycle.startedAt).toEqual(STARTED_AT);
  expect(cycle.waterCompletedAt).toEqual(WATER_AT);
  expect(cycle.waterAmountMl).toBe(250);
});

it('allows physical activation to finish or be skipped but not leave a terminal state', () => {
  const cycle = startedCycle();
  cycle.preparePhysical(NOW);
  cycle.startPhysical(LATER);
  cycle.completePhysical(DONE_AT);
  expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.done);
  expect(() => cycle.skipPhysical(AFTER_DONE)).toThrowError('завершена');
});
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/domain/morning-cycle/MorningCycle.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal aggregate**

```ts
export const MORNING_PHYSICAL_STATUS = {
  notConfigured: 'NOT_CONFIGURED',
  ready: 'READY',
  inProgress: 'IN_PROGRESS',
  done: 'DONE',
  skipped: 'SKIPPED',
} as const;

export interface MorningCycleRehydrationData {
  readonly id: EntityId;
  readonly dayId: EntityId;
  readonly dateKey: DayDate;
  readonly startedAt: Date | null;
  readonly waterCompletedAt: Date | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: MorningPhysicalStatus;
  readonly physicalUpdatedAt: Date | null;
  readonly updatedAt: Date;
  readonly version: number;
}
```

Validate ids, dates, positive water amount, allowed physical transitions, timestamp copying, and version increments. Starting is required before water or physical mutations.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/domain/morning-cycle/MorningCycle.test.ts`

Expected: PASS.

---

### Task 2: Repository contract and mutation service

**Files:**

- Create: `src/application/ports/MorningCycleRepository.ts`
- Create: `src/application/morning-cycle/MorningCycleApplicationService.ts`
- Create: `src/application/morning-cycle/MorningCycleApplicationService.test.ts`
- Create: `src/application/morning-cycle/index.ts`
- Create: `src/infrastructure/persistence/InMemoryMorningCycleRepository.ts`
- Modify: `src/application/ports/index.ts`
- Modify: `src/application/index.ts`
- Modify: `src/infrastructure/index.ts`

**Interfaces:**

```ts
export interface MorningCycleRepository {
  findByDayId(dayId: EntityId): Promise<MorningCycle | null>;
  findByDateKey(dateKey: DayDate): Promise<MorningCycle | null>;
  createIfAbsent(cycle: MorningCycle): Promise<MorningCycle>;
  saveIfVersionMatches(cycle: MorningCycle, expectedVersion: number): Promise<boolean>;
}

export class MorningCycleApplicationService {
  get(date: DayDate): Promise<MorningCycle | null>;
  start(date: DayDate): Promise<MorningCycle>;
  completeWater(date: DayDate): Promise<MorningCycle>;
  skipPhysical(date: DayDate): Promise<MorningCycle>;
}
```

- [ ] **Step 1: Write failing service tests**

Cover current-date enforcement, missing Day, idempotent `start`, idempotent `completeWater`, water-before-start blocking, skip-before-start blocking, and optimistic conflict reporting.

```ts
const first = await service.completeWater(TODAY);
const second = await service.completeWater(TODAY);
expect(second.waterCompletedAt).toEqual(first.waterCompletedAt);
expect(repository.all()).toHaveLength(1);
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/application/morning-cycle/MorningCycleApplicationService.test.ts`

Expected: FAIL because the service and repository are missing.

- [ ] **Step 3: Implement service and in-memory repository**

Use `DayRepository`, `CurrentDateProvider`, `Clock`, and `IdGenerator`. Return existing state for repeated commands. Throw `DomainError` with stable codes for non-current dates, missing Day, not-started mutations, and concurrent updates.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/application/morning-cycle/MorningCycleApplicationService.test.ts`

Expected: PASS.

---

### Task 3: Morning overview read model

**Files:**

- Create: `src/application/queries/GetMorningOverview.ts`
- Create: `src/application/queries/GetMorningOverview.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

```ts
export const MORNING_NEXT_STEP = {
  startMorning: 'startMorning',
  water: 'water',
  physical: 'physical',
  scheduleMainAction: 'scheduleMainAction',
  defineMainAction: 'defineMainAction',
  goToDay: 'goToDay',
} as const;

export interface MorningOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly startedAt: Date | null;
  readonly waterCompletedAt: Date | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: MorningPhysicalStatus;
  readonly mainAction: Readonly<{
    readonly id: EntityId;
    readonly title: string;
    readonly completed: boolean;
    readonly scheduledTime: string | null;
  }> | null;
  readonly progress: number;
  readonly ready: boolean;
  readonly nextStep: MorningNextStep;
}
```

- [ ] **Step 1: Write failing resolver tests**

Cover the full step order, 0/25/50/75/100 progress, `TomorrowPlan.firstAction` priority, fallback to the first main Decision's first eligible action, earliest effective non-skipped routine interval, missing action, and completed action without a time.

```ts
expect((await query.execute(DATE)).nextStep).toBe(MORNING_NEXT_STEP.scheduleMainAction);
expect((await query.execute(DATE)).mainAction?.scheduledTime).toBe('10:00–11:30');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/application/queries/GetMorningOverview.test.ts`

Expected: FAIL because the query does not exist.

- [ ] **Step 3: Implement the query**

Load cycle, plan, decisions, actions, and occurrences with one `Promise.all`. Resolve action and schedule using pure helpers in the same focused module. Freeze returned view models and never mutate repositories.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/application/queries/GetMorningOverview.test.ts`

Expected: PASS.

---

### Task 4: IndexedDB persistence

**Files:**

- Create: `src/infrastructure/persistence/records/MorningCycleRecord.ts`
- Create: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts`
- Create: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.ts`
- Create: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts`
- Modify: `src/infrastructure/persistence/records/index.ts`
- Modify: `src/infrastructure/persistence/mappers/index.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/index.ts`

**Interfaces:**

- Produces schema-version-1 records with ISO timestamps and the repository contract from Task 2.
- Raises `LIFE_OS_DATABASE_VERSION` from 14 to 15 and creates `morningCycles`, `byDayId`, and `byDateKey`.

- [ ] **Step 1: Write failing persistence tests**

```ts
expect((await repository.findByDateKey(DATE))?.waterCompletedAt).toEqual(WATER_AT);
expect((await repository.createIfAbsent(duplicate)).id.equals(original.id)).toBe(true);
expect(await repository.saveIfVersionMatches(changed, staleVersion)).toBe(false);
```

Also assert migration keeps all prior stores and creates the two unique indexes.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`

Expected: FAIL because store 15 and repository are missing.

- [ ] **Step 3: Implement mapper, repository, and migration**

Follow the optimistic transaction pattern of `IndexedDbEveningCycleRepository`; validate every record field through `RecordMapperSupport`.

- [ ] **Step 4: Run GREEN**

Run the RED command again.

Expected: PASS.

---

### Task 5: Composition root

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`

**Interfaces:**

- Adds `morningCycleRepository`, `morningCycle`, and `getMorningOverview` to `LifeOsApplication`.

- [ ] **Step 1: Extend composition tests first**

Assert the application exposes all three services and that the same IndexedDB repository feeds both mutation and overview services.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/app/composition/createLifeOsApplication.test.ts`

Expected: FAIL because the services are absent.

- [ ] **Step 3: Wire services minimally**

Instantiate `IndexedDbMorningCycleRepository`, `MorningCycleApplicationService`, and `GetMorningOverview` alongside existing routine services. Add only narrow exports and constructor fields.

- [ ] **Step 4: Run GREEN**

Run the RED command again.

Expected: PASS.

---

### Task 6: Morning page and routine integration

**Files:**

- Create: `src/presentation/pages/MorningBlockPage.tsx`
- Create: `src/presentation/pages/MorningBlockPage.test.ts`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`
- Modify: `src/app/ApplicationShell.tsx`

**Interfaces:**

```ts
export interface MorningBlockPageProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly getMorningOverview: Pick<GetMorningOverview, 'execute'>;
  readonly morningCycle: Pick<
    MorningCycleApplicationService,
    'start' | 'completeWater' | 'skipPhysical'
  >;
  readonly onPlanMainAction: (actionId: EntityId) => void;
  readonly onDefineMainAction: () => void;
  readonly onOpenDay: () => void;
}
```

- [ ] **Step 1: Write failing static-render and integration tests**

Assert exact title/subtitle, four summary cards, progress semantics, water CTA disappearance, physical future-module notice and skip, scheduled/completed/unscheduled action states, long-title wrapping hooks, and read-only date controls.

Add a `RoutinePage` test proving morning renders `MorningBlockPage` instead of the ordinary empty list while Day/Evening keep existing markup.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/presentation/pages/MorningBlockPage.test.ts src/presentation/pages/RoutinePage.test.ts`

Expected: FAIL because the page and workflow props do not exist.

- [ ] **Step 3: Implement page state and commands**

Use an explicit load union (`loading | ready | error`), one busy flag, one command error with Retry, refs for water/physical/main-action cards, and one handler switching only on `overview.nextStep`. Reload after every successful command.

In `RoutinePage`, prefill the existing `RoutineBlockForm` with selected action, `ROUTINE_BLOCK_CATEGORY.work`, `ROUTINE_BLOCK_ASSIGNMENT.existingAction`, current selected date, title, and required=true. Leave time fields for the user. Route `defineMainAction` to the existing day/management entry rather than creating a second editor.

- [ ] **Step 4: Run GREEN**

Run the RED command again.

Expected: PASS.

---

### Task 7: Visual system, regression, and manual QA

**Files:**

- Modify: `src/presentation/styles/global.css`
- Modify: `src/presentation/pages/MorningBlockPage.test.ts`

**Interfaces:**

- Produces `.morning-block-*` styles scoped under `.morning-block-page` using existing tokens.

- [ ] **Step 1: Add failing CSS contract assertions**

Assert scoped grid selectors, `min-width: 0`, `overflow-wrap: anywhere`, mobile one-column rules at 760/430 px, 44 px minimum controls, and no purple accent literals.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/presentation/pages/MorningBlockPage.test.ts`

Expected: FAIL because the CSS contract is absent.

- [ ] **Step 3: Implement responsive styles**

Use graphite surfaces, restrained gold CTA/current accents, green only for completed/ready states, thin borders, existing radii, tabular time/progress numbers, and `prefers-reduced-motion` behavior.

- [ ] **Step 4: Run focused GREEN and nearby regressions**

Run: `npx vitest run src/domain/morning-cycle src/application/morning-cycle src/application/queries/GetMorningOverview.test.ts src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts src/presentation/pages/MorningBlockPage.test.ts src/presentation/pages/RoutinePage.test.ts src/presentation/routine/RoutineNavigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the full quality gate**

Run sequentially:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 6: Run browser QA**

Open `#/routine/morning?date=<current-date>` and verify start, water, reload persistence, physical skip, main-action planning, ready state, return to day, no duplicate water, desktop 1600×900/1280/1024, mobile 390×844/360×800, no horizontal scroll, no stuck backdrop, and no infinite loading.
