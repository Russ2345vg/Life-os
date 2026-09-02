# R5 Relaxation Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reload-safe Relaxation stage between Environment and Shutdown with a persistent default practice, flexible action order, optional practice timer, manual completion, and conscious screen-free completion or skip.

**Architecture:** `EveningCycle` remains the single authoritative aggregate and gains the `RELAXING` state plus an embedded `RelaxationSnapshot`. A focused `RelaxationApplicationService` mutates the same `EveningCycleRepository` through optimistic CAS and resolves the latest prior saved default without adding a store or database migration. Presentation derives countdowns from persisted timestamps and an injected/display clock; React never writes domain state directly.

**Tech Stack:** TypeScript, React, Vitest, IndexedDB, CSS design tokens, Playwright managed E2E.

**Spec:** `docs/design/features/2026-08-30-r5-relaxation-stage.md`

## Global Constraints

- Implement only R5. Do not add Sleep Check, before/after ratings, or any R6 behavior.
- Preserve dependency flow `UI → Presentation → Application → Domain`; Infrastructure implements application ports and App performs composition.
- Use `EveningCycle` as the only authoritative state; do not add a `RelaxationPlan` repository, global settings subsystem, IndexedDB store, database-version bump, or dependency.
- The state flow is exactly `PREPARING → RELAXING → SHUTDOWN`; legacy `SHUTDOWN` and `COMPLETED` records without R5 data remain readable.
- Canonical practices are `READING`, `BREATHING`, `STRETCHING`, `MEDITATION`, and `CALM_MUSIC`; initial default is `READING`.
- Practice duration is an integer from 5 through 20 minutes; presets are 5, 10, 15, and 20. NORMAL starts at 15; QUICK and EMERGENCY start at 5.
- Screen-free duration is 25 minutes in NORMAL and 10 minutes in QUICK/EMERGENCY. Shortening changes 25 to 10 and retains the original start timestamp.
- Drink, hygiene, and practice must be completed; screen-free must be elapsed or consciously skipped. Completion order is unrestricted.
- Practice timer is optional and never auto-completes the practice. Persist timestamps, not per-second ticks.
- Use existing LifeOS tokens and components. Current/primary is gold, completed is green, skipped is explicit neutral, error is red; no permanent violet or decorative blue.
- Required viewports are 1600×900, 1280×720, 390×844, and 360×800; touch targets are at least 44×44 px.
- Add failing tests before production code in every task. Use only bounded commands from `docs/codex/TEST_MATRIX.md`.
- Preserve every pre-existing working-tree change. Before each task, inspect `git status --short` and the scoped diff. If a task file already contains unrelated user edits, stage only reviewed R5 hunks or leave the checkpoint uncommitted rather than including unrelated work.
- R5 has no dedicated pixel reference. Use the approved Deep Focus archetype plus `Evening_UI_Reference_for_Codex/04_preparation.png` and `05_shutdown.png` for hierarchy/material language; never claim pixel-perfect fidelity.

---

## File Structure

### New focused files

- `src/domain/evening-cycle/RelaxationSnapshot.ts` — typed R5 practices, screen-free state, invariants, timestamps, readiness, and immutable rehydration boundary.
- `src/domain/evening-cycle/RelaxationSnapshot.test.ts` — exhaustive R5 value-object contract.
- `src/application/evening-cycle/RelaxationApplicationService.ts` — initialization, latest-default resolution, optimistic commands, and R5 completion.
- `src/application/evening-cycle/RelaxationApplicationService.test.ts` — application/default/concurrency/refresh behavior.
- `src/presentation/pages/EveningRelaxationPresentation.ts` — pure labels, countdown/readiness derivation, and history presentation.
- `src/presentation/pages/EveningRelaxationPresentation.test.ts` — pure presentation contract.
- `src/presentation/pages/EveningRelaxationScene.tsx` — active/history React scene and bounded timer refresh hook.
- `src/presentation/pages/EveningRelaxationScene.test.ts` — interaction, async state, keyboard, manual completion, and refresh-facing render tests.
- `src/presentation/styles/evening-relaxation.css` — tokens-only Deep Focus layout, responsive reflow, focus, reduced motion, and status semantics.
- `src/presentation/pages/EveningRelaxationVisual.test.ts` — stylesheet/token/order/mobile structural guard.
- `tests/e2e/evening-relaxation.acceptance.spec.ts` — real persistence, refresh, screen-free skip/elapsed, timer, desktop/mobile, focus, overflow, and console acceptance.

### Existing files to modify

- Domain: `src/domain/evening-cycle/EveningCycleState.ts`, `EveningCycle.ts`, `EveningCycle.test.ts`, and `index.ts`; `src/domain/index.ts`.
- Application: `src/application/ports/EveningCycleRepository.ts`; `src/application/evening-cycle/index.ts`; `src/application/index.ts`; `src/application/preparation/PreparationService.ts` and `.test.ts`; `src/application/commands/CompleteCurrentDay.test.ts`.
- Infrastructure: `src/infrastructure/persistence/InMemoryEveningCycleRepository.ts`; `IndexedDbEveningCycleRepository.ts` and `.test.ts`; `records/EveningCycleRecord.ts`; `mappers/EveningCycleRecordMapper.ts`; existing mapper coverage in `IndexedDbEveningCycleRepository.test.ts` or a focused mapper test if already present.
- Presentation: `src/presentation/pages/EveningCommandCenterPresentation.ts`; `EveningCommandCenter.test.ts`; `EveningReviewPanel.tsx` and `.test.ts`; `PreparationPanelPresentation.ts`; `PreparationPanel.tsx` and `.test.ts` only for the continuation label/API rename.
- Composition: `src/app/composition/LifeOsApplication.ts`; `createLifeOsApplication.ts`; `createLifeOsApplication.test.ts`; `src/app/ApplicationShell.tsx`; `src/presentation/pages/RoutinePage.tsx` and `.test.ts`.
- Documentation: update the status/checklist in the R5 specification after verified implementation, without marking visual status `APPROVED` or `LOCKED` before explicit user approval.

---

### Task 1: Define the R5 domain snapshot and state-machine transitions

**Files:**

- Create: `src/domain/evening-cycle/RelaxationSnapshot.ts`
- Create: `src/domain/evening-cycle/RelaxationSnapshot.test.ts`
- Modify: `src/domain/evening-cycle/EveningCycleState.ts`
- Modify: `src/domain/evening-cycle/EveningCycle.ts`
- Modify: `src/domain/evening-cycle/EveningCycle.test.ts`
- Modify: `src/domain/evening-cycle/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Consumes: existing `DomainError`, `EveningCycleMode`, `copyDate`, `copyOptionalDate`, and aggregate version/timestamp conventions.
- Produces: `RELAXATION_PRACTICE`, `RelaxationPractice`, `SCREEN_FREE_STATE`, `ScreenFreeState`, `RelaxationSnapshot`, `EveningCycle.relaxation`, initialization/action methods, and `EVENING_CYCLE_STATE.relaxing` for all later tasks.

- [ ] **Step 1: Write failing value-object tests**

Add named tests that prove initial defaults, every practice, 5–20 validation, timer behavior, independent drink/hygiene completion, 25→10 screen-free shortening, elapsed readiness, explicit skip, date-copying, and rehydration invariants. Use fixed dates:

```ts
const startedAt = new Date('2026-08-30T12:00:00.000Z');
const snapshot = RelaxationSnapshot.start({
  defaultPractice: RELAXATION_PRACTICE.reading,
  practiceDurationMinutes: 15,
  screenFreeDurationMinutes: 25,
  occurredAt: startedAt,
});

expect(snapshot.defaultPractice).toBe(RELAXATION_PRACTICE.reading);
expect(snapshot.selectedPractice).toBe(RELAXATION_PRACTICE.reading);
expect(snapshot.readyAt(new Date('2026-08-30T12:30:00.000Z'))).toBe(false);

snapshot.completeDrink(new Date('2026-08-30T12:01:00.000Z'));
snapshot.completeHygiene(new Date('2026-08-30T12:02:00.000Z'));
snapshot.completePractice(new Date('2026-08-30T12:03:00.000Z'));
snapshot.startScreenFree(new Date('2026-08-30T12:04:00.000Z'));

expect(snapshot.readyAt(new Date('2026-08-30T12:28:59.999Z'))).toBe(false);
expect(snapshot.readyAt(new Date('2026-08-30T12:29:00.000Z'))).toBe(true);
```

Include explicit `DomainError.code` assertions for duration 4, 21, 10.5; unknown rehydrated practice/state; active screen-free without `startedAt`; skipped without `skippedAt`; completed without `completedAt`; and changing practice/duration after completion.

- [ ] **Step 2: Run the new domain test and confirm RED**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/RelaxationSnapshot.test.ts
```

Expected: FAIL because `RelaxationSnapshot` and exported R5 constants do not exist.

- [ ] **Step 3: Implement the typed snapshot contract**

Create the closed constants and exact public methods:

```ts
export const RELAXATION_PRACTICE = {
  reading: 'READING',
  breathing: 'BREATHING',
  stretching: 'STRETCHING',
  meditation: 'MEDITATION',
  calmMusic: 'CALM_MUSIC',
} as const;

export const SCREEN_FREE_STATE = {
  pending: 'PENDING',
  active: 'ACTIVE',
  skipped: 'SKIPPED',
  completed: 'COMPLETED',
} as const;

export type RelaxationPractice = (typeof RELAXATION_PRACTICE)[keyof typeof RELAXATION_PRACTICE];
export type ScreenFreeState = (typeof SCREEN_FREE_STATE)[keyof typeof SCREEN_FREE_STATE];
export type ScreenFreeDurationMinutes = 10 | 25;
```

`RelaxationSnapshot` must expose copied `Date | null` getters and these mutations returning `boolean` for idempotence:

```ts
choosePractice(practice: RelaxationPractice, persistAsDefault: boolean, occurredAt: Date): boolean;
setPracticeDuration(minutes: number, occurredAt: Date): boolean;
completeDrink(occurredAt: Date): boolean;
completeHygiene(occurredAt: Date): boolean;
startPracticeTimer(occurredAt: Date): boolean;
completePractice(occurredAt: Date): boolean;
startScreenFree(occurredAt: Date): boolean;
shortenScreenFree(occurredAt: Date): boolean;
skipScreenFree(occurredAt: Date): boolean;
screenFreeElapsedAt(now: Date): boolean;
readyAt(now: Date): boolean;
completeElapsedScreenFree(now: Date): boolean;
```

Store `defaultChangedForFuture: boolean`; set it only when `persistAsDefault` is explicitly true. Changing practice/duration while the practice timer is active sets `practiceTimerStartedAt` to `null`. Never auto-fill `practiceCompletedAt` when time elapses.

- [ ] **Step 4: Write failing EveningCycle transition tests**

Add tests using the existing cycle fixture:

```ts
cycle.completePreparation(new Date('2026-08-30T13:00:00.000Z'));
expect(cycle.state).toBe(EVENING_CYCLE_STATE.relaxing);

cycle.initializeRelaxation(
  RELAXATION_PRACTICE.reading,
  15,
  25,
  new Date('2026-08-30T13:01:00.000Z'),
);
cycle.completeRelaxationDrink(new Date('2026-08-30T13:02:00.000Z'));
cycle.completeRelaxationHygiene(new Date('2026-08-30T13:03:00.000Z'));
cycle.completeRelaxationPractice(new Date('2026-08-30T13:04:00.000Z'));
cycle.skipRelaxationScreenFree(new Date('2026-08-30T13:05:00.000Z'));
cycle.completeRelaxation(new Date('2026-08-30T13:06:00.000Z'));

expect(cycle.state).toBe(EVENING_CYCLE_STATE.shutdown);
```

Also prove incomplete readiness rejection, normal/special Preparation transitions, version increments only on actual mutation, clone-safe getters, and the internal legacy recovery bridge from `RELAXING` to `SHUTDOWN` without fabricated R5 facts.

- [ ] **Step 5: Run transition tests and confirm RED**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/EveningCycle.test.ts
```

Expected: FAIL because `RELAXING` and aggregate R5 methods do not exist.

- [ ] **Step 6: Implement aggregate ownership and transitions**

Add `relaxing: 'RELAXING'` between `preparing` and `shutdown`. Add optional `relaxation?: RelaxationSnapshot | null` to rehydration, a copied getter, and aggregate methods whose names exactly match the tests. `completePreparation` and special-mode `skipPreparation` target `RELAXING`; `completeRelaxation(now)` calls `completeElapsedScreenFree(now)`, validates `readyAt(now)`, then transitions to `SHUTDOWN`.

The aggregate surface used by the application service is exactly:

```ts
initializeRelaxation(
  defaultPractice: RelaxationPractice,
  practiceDurationMinutes: number,
  screenFreeDurationMinutes: ScreenFreeDurationMinutes,
  occurredAt: Date,
): boolean;
chooseRelaxationPractice(
  practice: RelaxationPractice,
  persistAsDefault: boolean,
  occurredAt: Date,
): boolean;
setRelaxationPracticeDuration(minutes: number, occurredAt: Date): boolean;
completeRelaxationDrink(occurredAt: Date): boolean;
completeRelaxationHygiene(occurredAt: Date): boolean;
startRelaxationPracticeTimer(occurredAt: Date): boolean;
completeRelaxationPractice(occurredAt: Date): boolean;
startRelaxationScreenFree(occurredAt: Date): boolean;
shortenRelaxationScreenFree(occurredAt: Date): boolean;
skipRelaxationScreenFree(occurredAt: Date): boolean;
completeRelaxation(occurredAt: Date): void;
recoverLegacyRelaxation(occurredAt: Date): void;
```

Add one narrowly named recovery-only method:

```ts
public recoverLegacyRelaxation(occurredAt: Date): void {
  if (this.#state !== EVENING_CYCLE_STATE.relaxing || this.#relaxation !== null) {
    throw invalidTransition(this.#state, EVENING_CYCLE_STATE.shutdown);
  }
  this.transition(EVENING_CYCLE_STATE.relaxing, EVENING_CYCLE_STATE.shutdown, occurredAt);
}
```

Use it only for synthetic recovery of a day that was already completed before its EveningCycle existed. Do not record an R5 skip or snapshot in that path.

- [ ] **Step 7: Run domain tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/RelaxationSnapshot.test.ts src/domain/evening-cycle/EveningCycle.test.ts
```

Expected: PASS with no test timer leaks or mutation-through-getter failures.

- [ ] **Step 8: Review and checkpoint Task 1**

Run:

```powershell
git diff --check -- src/domain/evening-cycle
git diff -- src/domain/evening-cycle src/domain/index.ts
git status --short
```

If every staged hunk belongs to R5, commit only reviewed hunks with message `feat: add relaxation domain state`. If pre-existing edits overlap, leave them uncommitted and record the green test checkpoint.

---

### Task 2: Persist R5 additively and support latest-default lookup

**Files:**

- Modify: `src/infrastructure/persistence/records/EveningCycleRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/EveningCycleRecordMapper.ts`
- Modify: `src/infrastructure/persistence/IndexedDbEveningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts`
- Modify: `src/infrastructure/persistence/InMemoryEveningCycleRepository.ts`
- Modify: `src/application/ports/EveningCycleRepository.ts`

**Interfaces:**

- Consumes: `EveningCycle.relaxation`, `RelaxationSnapshot.rehydrate`, existing schema-version-1 mapper helpers, and `DayDate` ordering.
- Produces: additive `EveningCycleRecord.relaxation?` and `findLatestWithRelaxationBefore(dateKey): Promise<EveningCycle | null>`.

- [ ] **Step 1: Add failing mapper/repository tests**

Extend the IndexedDB repository test with three named cases:

```ts
it('round-trips the complete relaxation snapshot without changing database version', async () => {
  expect(LIFE_OS_DATABASE_VERSION).toBe(19);
  const restored = await repository.findByDateKey(DayDate.fromString('2026-08-30'));
  expect(restored?.relaxation?.selectedPractice).toBe(RELAXATION_PRACTICE.breathing);
  expect(restored?.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.skipped);
  expect(restored?.relaxation?.screenFreeSkippedAt?.toISOString()).toBe('2026-08-30T13:10:00.000Z');
});

it('reads a legacy schema-version-1 record without relaxation facts', async () => {
  expect(restored.relaxation).toBeNull();
});

it('finds the latest strictly prior cycle that contains a relaxation default', async () => {
  const latest = await repository.findLatestWithRelaxationBefore(DayDate.fromString('2026-08-30'));
  expect(latest?.dateKey.toString()).toBe('2026-08-29');
});
```

Add malformed-record assertions for unknown practice, duration 4/21/decimal, invalid screen-free state, and state/timestamp mismatch. Assert that a same-date record is excluded from latest-default lookup.

- [ ] **Step 2: Run persistence test and confirm RED**

Run:

```powershell
npm run test:target -- src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts
```

Expected: FAIL because the record has no relaxation shape and the repository method is absent.

- [ ] **Step 3: Add the optional record shape and strict mapper**

Add this optional record member without changing `schemaVersion`:

```ts
readonly relaxation?: {
  readonly defaultPractice: string;
  readonly selectedPractice: string;
  readonly defaultChangedForFuture: boolean;
  readonly practiceDurationMinutes: number;
  readonly drinkCompletedAt: string | null;
  readonly hygieneCompletedAt: string | null;
  readonly practiceTimerStartedAt: string | null;
  readonly practiceCompletedAt: string | null;
  readonly screenFreeDurationMinutes: number;
  readonly screenFreeState: string;
  readonly screenFreeStartedAt: string | null;
  readonly screenFreeSkippedAt: string | null;
  readonly screenFreeCompletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
```

Map missing `relaxation` to `null`. Parse every enum and date with explicit validation before calling `RelaxationSnapshot.rehydrate`; never coerce an invalid value or synthesize missing legacy facts.

- [ ] **Step 4: Implement deterministic prior-default lookup**

Add the method to the port, in-memory adapter, and IndexedDB adapter. The IndexedDB implementation may use the existing bounded `getAll()` pattern, then map/filter/sort:

```ts
return (
  cycles
    .filter((cycle) => cycle.dateKey.isBefore(dateKey) && cycle.relaxation !== null)
    .sort((left, right) => right.dateKey.toString().localeCompare(left.dateKey.toString()))[0] ??
  null
);
```

If `DayDate` has no `isBefore`, express strict-before as `!candidate.dateKey.equals(dateKey) && !candidate.dateKey.isAfter(dateKey)` and test it. Do not add an index or bump version 19.

- [ ] **Step 5: Run persistence tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts
```

Expected: PASS for full round-trip, legacy read, invalid records, strict-before lookup, and version 19.

- [ ] **Step 6: Review and checkpoint Task 2**

Run:

```powershell
git diff --check -- src/application/ports/EveningCycleRepository.ts src/infrastructure/persistence
git diff -- src/application/ports/EveningCycleRepository.ts src/infrastructure/persistence
git status --short
```

Commit only reviewed R5 hunks as `feat: persist evening relaxation state`; otherwise retain the green checkpoint without absorbing existing changes.

---

### Task 3: Add the focused Relaxation application service

**Files:**

- Create: `src/application/evening-cycle/RelaxationApplicationService.ts`
- Create: `src/application/evening-cycle/RelaxationApplicationService.test.ts`
- Modify: `src/application/evening-cycle/index.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: `EveningCycleRepository.findLatestWithRelaxationBefore`, `Clock`, aggregate R5 methods, and `cloneEveningCycle`.
- Produces: `RelaxationApplicationService` with one initialization/read path and ten focused commands returning `Promise<EveningCycle>`.

- [ ] **Step 1: Write failing initialization/default tests**

Cover built-in reading, latest-prior default, ignoring legacy/same-date cycles, mode durations, initialization idempotence, refresh preservation, current-only replacement, and save-as-default carry-forward:

```ts
const initialized = await service.getOrInitialize(DayDate.fromString('2026-08-30'));

expect(initialized.relaxation?.selectedPractice).toBe(RELAXATION_PRACTICE.reading);
expect(initialized.relaxation?.practiceDurationMinutes).toBe(15);
expect(initialized.relaxation?.screenFreeDurationMinutes).toBe(25);

await service.choosePractice(
  DayDate.fromString('2026-08-30'),
  RELAXATION_PRACTICE.meditation,
  true,
);
const next = await service.getOrInitialize(DayDate.fromString('2026-08-31'));
expect(next.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.meditation);
```

Use a cycle already in `RELAXING`. Assert that `getStored` returns `null` facts for legacy completed history and never initializes it.

- [ ] **Step 2: Run application test and confirm RED**

Run:

```powershell
npm run test:target -- src/application/evening-cycle/RelaxationApplicationService.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement exact service API**

Export this class surface:

```ts
export class RelaxationApplicationService {
  public constructor(cycles: EveningCycleRepository, clock: Clock);

  public getOrInitialize(dateKey: DayDate): Promise<EveningCycle>;
  public getStored(dateKey: DayDate): Promise<EveningCycle | null>;
  public choosePractice(
    dateKey: DayDate,
    practice: RelaxationPractice,
    persistAsDefault: boolean,
  ): Promise<EveningCycle>;
  public setPracticeDuration(dateKey: DayDate, minutes: number): Promise<EveningCycle>;
  public completeDrink(dateKey: DayDate): Promise<EveningCycle>;
  public completeHygiene(dateKey: DayDate): Promise<EveningCycle>;
  public startPracticeTimer(dateKey: DayDate): Promise<EveningCycle>;
  public completePractice(dateKey: DayDate): Promise<EveningCycle>;
  public startScreenFree(dateKey: DayDate): Promise<EveningCycle>;
  public shortenScreenFree(dateKey: DayDate): Promise<EveningCycle>;
  public skipScreenFree(dateKey: DayDate): Promise<EveningCycle>;
  public complete(dateKey: DayDate): Promise<EveningCycle>;
}
```

Initialization chooses `15/25` for NORMAL and `5/10` for QUICK/EMERGENCY. Mutation retries at most twice, returns immediately on idempotent no-version-change commands, and throws `relaxation.concurrent_change` after the second CAS miss. All timestamps come from `Clock.now()`.

- [ ] **Step 4: Add failing command/concurrency tests**

Test every public mutation, wrong-state/completed rejection, one CAS retry success, two CAS misses, persistence error propagation, screen-free completion before/after deadline, and no partial transition:

```ts
await service.completeDrink(date);
await service.completeHygiene(date);
await service.completePractice(date);
await service.startScreenFree(date);
clock.set(new Date('2026-08-30T13:24:59.999Z'));
await expect(service.complete(date)).rejects.toMatchObject({
  code: 'relaxation.not_ready',
});
clock.set(new Date('2026-08-30T13:25:00.000Z'));
const completed = await service.complete(date);
expect(completed.state).toBe(EVENING_CYCLE_STATE.shutdown);
expect(completed.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.completed);
```

- [ ] **Step 5: Run application tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/application/evening-cycle/RelaxationApplicationService.test.ts
```

Expected: PASS for initialization, defaults, modes, every command, refresh, readiness, and concurrency.

- [ ] **Step 6: Review and checkpoint Task 3**

Run:

```powershell
git diff --check -- src/application/evening-cycle src/application/index.ts
git diff -- src/application/evening-cycle src/application/index.ts
git status --short
```

Commit only reviewed R5 hunks as `feat: add relaxation application commands`; otherwise preserve the checkpoint without staging unrelated work.

---

### Task 4: Redirect R4 into R5 and preserve legacy day recovery

**Files:**

- Modify: `src/application/preparation/PreparationService.ts`
- Modify: `src/application/preparation/PreparationService.test.ts`
- Modify: `src/application/evening-cycle/EveningCycleApplicationService.ts`
- Modify: `src/application/evening-cycle/EveningCycleApplicationService.test.ts`
- Modify: `src/application/commands/CompleteCurrentDay.test.ts`
- Modify: `src/presentation/pages/PreparationPanelPresentation.ts`
- Modify: `src/presentation/pages/PreparationPanel.tsx`
- Modify: `src/presentation/pages/PreparationPanel.test.ts`

**Interfaces:**

- Consumes: `EveningCycle.completePreparation()` now targeting `RELAXING` and recovery-only `recoverLegacyRelaxation()`.
- Produces: `PreparationService.continueToRelaxation(dateKey)` and exact user copy `Перейти к расслаблению →`.

- [ ] **Step 1: Change tests first from Shutdown to Relaxing**

Update/add tests before production renaming:

```ts
const result = await service.continueToRelaxation(cycleDate);
expect(result.plan.status).toBe(PREPARATION_PLAN_STATUS.completed);
expect((await cycles.findByDateKey(cycleDate))?.state).toBe(EVENING_CYCLE_STATE.relaxing);
```

Prove the `PreparationUnitOfWork` still commits plan completion and cycle transition atomically, concurrent recovery recognizes `RELAXING`, and emergency `skipPreparation` reaches `RELAXING` while retaining the `PREPARING` skip record.

Add `CompleteCurrentDay` regression coverage that a cycle in `RELAXING` cannot close the day, while legacy synthetic recovery still reaches completed without an invented relaxation snapshot.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm run test:target -- src/application/preparation/PreparationService.test.ts src/application/evening-cycle/EveningCycleApplicationService.test.ts src/application/commands/CompleteCurrentDay.test.ts src/presentation/pages/PreparationPanel.test.ts
```

Expected: FAIL on the missing `continueToRelaxation` API and old `SHUTDOWN` expectations.

- [ ] **Step 3: Rename and integrate the R4 continuation**

Rename `continueToShutdown` to `continueToRelaxation` in the service and every `Pick<>` consumer. Keep the UoW payload unchanged; only the cloned cycle target changes through the domain method. Concurrent recovery must accept a stored `RELAXING` cycle and verify the saved PreparationPlan is completed.

Update the button contract:

```ts
label: 'Перейти к расслаблению →';
```

Update `recoverCompletedCycle` to execute:

```ts
cycle.completePreparation(occurredAt);
cycle.recoverLegacyRelaxation(occurredAt);
cycle.complete(occurredAt);
```

Do not initialize, skip, or fabricate an R5 snapshot in this legacy synthetic path.

- [ ] **Step 4: Run focused integration tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/application/preparation/PreparationService.test.ts src/application/evening-cycle/EveningCycleApplicationService.test.ts src/application/commands/CompleteCurrentDay.test.ts src/presentation/pages/PreparationPanel.test.ts
```

Expected: PASS; R4 lands in `RELAXING`, day completion remains `SHUTDOWN`-only, and legacy recovery has no R5 facts.

- [ ] **Step 5: Review and checkpoint Task 4**

Run:

```powershell
git diff --check -- src/application/preparation src/application/evening-cycle src/application/commands/CompleteCurrentDay.test.ts src/presentation/pages/PreparationPanel.tsx src/presentation/pages/PreparationPanelPresentation.ts
git diff -- src/application/preparation src/application/evening-cycle src/application/commands/CompleteCurrentDay.test.ts src/presentation/pages/PreparationPanel.tsx src/presentation/pages/PreparationPanelPresentation.ts
git status --short
```

Commit only reviewed R5 hunks as `feat: route environment into relaxation`; otherwise keep the verified checkpoint uncommitted.

---

### Task 5: Build the pure R5 presentation contract and Evening Journey mapping

**Files:**

- Create: `src/presentation/pages/EveningRelaxationPresentation.ts`
- Create: `src/presentation/pages/EveningRelaxationPresentation.test.ts`
- Modify: `src/presentation/pages/EveningCommandCenterPresentation.ts`
- Modify: `src/presentation/pages/EveningCommandCenter.test.ts`

**Interfaces:**

- Consumes: stored `RelaxationSnapshot`, current `Date`, `EveningCycleState`, and existing journey/KPI tone semantics.
- Produces: `EveningRelaxationModel`, countdown formatting, disabled-reason copy, history labels, `relaxation` journey id, and Relaxation KPI.

- [ ] **Step 1: Write failing pure presentation tests**

Test exact journey order and state mapping:

```ts
expect(EVENING_JOURNEY.map((item) => item.id)).toEqual([
  'today',
  'reflection',
  'tomorrow',
  'preparation',
  'relaxation',
  'shutdown',
]);
expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.relaxing)).toBe('relaxation');
```

Test models for loading/active, optional timer not started, timer running/expired, screen-free pending/active/elapsed/skipped, ready CTA, NORMAL/QUICK/EMERGENCY durations, saved default/current distinction, and legacy history. Assert exact calm Russian copy, including `Перейти к завершению`, `Пропущено сегодня`, and a specific disabled reason such as `Завершите гигиену`.

- [ ] **Step 2: Run presentation tests and confirm RED**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningRelaxationPresentation.test.ts src/presentation/pages/EveningCommandCenter.test.ts
```

Expected: FAIL because the presentation module and journey id do not exist.

- [ ] **Step 3: Implement the pure model**

Export stable practice options and a single model builder:

```ts
export const RELAXATION_PRACTICE_OPTIONS = Object.freeze([
  { value: RELAXATION_PRACTICE.reading, label: 'Чтение' },
  { value: RELAXATION_PRACTICE.breathing, label: 'Дыхание' },
  { value: RELAXATION_PRACTICE.stretching, label: 'Растяжка' },
  { value: RELAXATION_PRACTICE.meditation, label: 'Медитация' },
  { value: RELAXATION_PRACTICE.calmMusic, label: 'Спокойная музыка' },
] as const);

export function buildEveningRelaxationModel(
  cycle: EveningCycle,
  now: Date,
  readOnly: boolean,
): EveningRelaxationModel;
```

Derive remaining seconds with `Math.max(0, targetSeconds - elapsedSeconds)`. Do not mutate the cycle. Determine the first missing readiness reason in visual recommendation order: drink, hygiene, screen-free, practice. Keep every action enabled independently; this order affects copy only.

Add `relaxation` to the journey before `shutdown`. Keep the KPI row at five cards by replacing the redundant Mode KPI with Relaxation; the existing mode selector remains in the header.

- [ ] **Step 4: Run pure presentation tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningRelaxationPresentation.test.ts src/presentation/pages/EveningCommandCenter.test.ts
```

Expected: PASS for journey availability/history and every R5 model state.

- [ ] **Step 5: Review and checkpoint Task 5**

Run:

```powershell
git diff --check -- src/presentation/pages/EveningRelaxationPresentation.ts src/presentation/pages/EveningRelaxationPresentation.test.ts src/presentation/pages/EveningCommandCenterPresentation.ts src/presentation/pages/EveningCommandCenter.test.ts
git diff -- src/presentation/pages/EveningRelaxationPresentation.ts src/presentation/pages/EveningCommandCenterPresentation.ts
git status --short
```

Commit reviewed R5-only hunks as `feat: present evening relaxation state`, or retain the green checkpoint if existing edits overlap.

---

### Task 6: Implement the active/history Relaxation scene and responsive visual layer

**Files:**

- Create: `src/presentation/pages/EveningRelaxationScene.tsx`
- Create: `src/presentation/pages/EveningRelaxationScene.test.ts`
- Create: `src/presentation/pages/EveningRelaxationVisual.test.ts`
- Create: `src/presentation/styles/evening-relaxation.css`

**Interfaces:**

- Consumes: `RelaxationApplicationService` public methods, `buildEveningRelaxationModel`, `DayDate`, and `onContinued(): void`.
- Produces: `EveningRelaxationScene` with current/history modes and `data-relaxation-*` hooks for browser QA.

- [ ] **Step 1: Write failing React interaction tests**

Render with a fake service and verify:

```tsx
<EveningRelaxationScene
  cycleDate={DayDate.fromString('2026-08-30')}
  service={service}
  onContinued={onContinued}
  readOnly={false}
/>
```

Named tests must prove:

- loading geometry before `getOrInitialize` resolves;
- all actions are enabled from first active render regardless of recommended order;
- drink/hygiene call separate commands;
- selecting a practice exposes explicit `Только сегодня` and `Сделать практикой по умолчанию` actions;
- presets and labeled manual integer input reject 4, 21, and 10.5 without calling the service;
- `Начать таймер` is optional and `Отметить выполненным` works without it;
- timer interval is installed only while a visible timer/window is active and is cleared on unmount;
- screen-free start/shorten/skip use distinct controls and skipped state is not styled/labeled as success;
- final CTA remains disabled with visible reason, then calls `complete` and `onContinued` once;
- service failure retains selection/draft and displays a focused inline retry message;
- read-only history has no mutation controls and shows exact saved facts;
- legacy history renders `Расслабление не записывалось для этого вечера`.

- [ ] **Step 2: Run scene tests and confirm RED**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningRelaxationScene.test.ts
```

Expected: FAIL because the scene does not exist.

- [ ] **Step 3: Implement the scene with one bounded display clock**

Use one effect that updates display time only while either timer is active:

```ts
useEffect(() => {
  if (!model.hasActiveClock || readOnly) return undefined;
  const intervalId = window.setInterval(() => setNow(new Date()), 1000);
  return () => window.clearInterval(intervalId);
}, [model.hasActiveClock, readOnly]);
```

Reload the saved cycle after each successful command. Guard all submits with one action key so a
double click cannot send the same command twice. Move focus to the scene heading after initial load,
to the inline error on failure, and to the readiness/next heading after successful continuation.
Use a polite timer live region that announces minute/state boundaries rather than every second.

- [ ] **Step 4: Write the visual structural test before CSS**

Assert the component imports `../styles/evening-relaxation.css`; the stylesheet contains only
token/semantic color references for R5, defines the required action order, has mobile breakpoints
covering 390/360 layouts, 44px minimum controls, `:focus-visible`, and
`prefers-reduced-motion: reduce`. Reject literal hex values in the new stylesheet.

- [ ] **Step 5: Run visual test and confirm RED**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningRelaxationVisual.test.ts
```

Expected: FAIL because the stylesheet is absent.

- [ ] **Step 6: Implement tokens-only Deep Focus CSS**

Create one dominant `.evening-relaxation-practice` surface, one compact drink/hygiene region, a
screen-free region before practice in DOM/visual order, and one continuation footer. Use existing
`--section-routine`, surface, text, border, spacing, radius, shadow, success, error, and focus tokens.
Desktop may use a supporting two-column grid inside the scene; at 48rem and below reflow to one
column in this exact order:

```text
status → drink/hygiene → screen-free → practice → continuation
```

No internal scroll trap, fixed mobile footer over content, hardcoded sample data, white native
surface, or color-only outcome is allowed.

- [ ] **Step 7: Run scene and visual tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningRelaxationScene.test.ts src/presentation/pages/EveningRelaxationVisual.test.ts
```

Expected: PASS with no act warnings, leaked intervals, or accessibility-name failures.

- [ ] **Step 8: Review and checkpoint Task 6**

Run:

```powershell
git diff --check -- src/presentation/pages/EveningRelaxationScene.tsx src/presentation/pages/EveningRelaxationScene.test.ts src/presentation/pages/EveningRelaxationVisual.test.ts src/presentation/styles/evening-relaxation.css
git diff -- src/presentation/pages/EveningRelaxationScene.tsx src/presentation/styles/evening-relaxation.css
git status --short
```

Commit reviewed R5-only files as `feat: add relaxation evening scene`.

---

### Task 7: Wire R5 through Evening review, composition, refresh, and history

**Files:**

- Modify: `src/presentation/pages/EveningReviewPanel.tsx`
- Modify: `src/presentation/pages/EveningReviewPanel.test.ts`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/app/ApplicationShell.test.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`

**Interfaces:**

- Consumes: `RelaxationApplicationService`, `EveningRelaxationScene`, `EVENING_CYCLE_STATE.relaxing`, and the renamed `continueToRelaxation` Preparation API.
- Produces: real application wiring, current scene selection, completed-history scene selection, and refresh-safe service propagation.

- [ ] **Step 1: Add failing composition and orchestration tests**

Assert `createLifeOsApplication()` constructs one service from the existing EveningCycle repository
and clock, and `LifeOsApplication.relaxation` is the same instance exposed to `ApplicationShell`.

Add `EveningReviewPanel` tests for:

```ts
expect(screen.getByRole('heading', { name: 'Переход к спокойствию' })).toBeVisible();
expect(screen.getByRole('button', { name: 'Перейти к завершению' })).toBeDisabled();
```

Cover current `RELAXING`, completion reload to `SHUTDOWN`, selected R5 history from a later current
stage, completed history with saved R5 facts, and legacy history without facts. Assert there are no
Sleep Check/rating labels.

- [ ] **Step 2: Run orchestration tests and confirm RED**

Run:

```powershell
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts src/app/ApplicationShell.test.ts src/presentation/pages/RoutinePage.test.ts src/presentation/pages/EveningReviewPanel.test.ts
```

Expected: FAIL because the service is not wired and `RELAXING` falls through to the old scene.

- [ ] **Step 3: Wire the service once through App and Presentation**

Construct:

```ts
const relaxation = new RelaxationApplicationService(eveningCycleRepository, clock);
```

Add it to `LifeOsApplicationServices`, public fields, constructor assignment, and the final
composition object. Pass it through `ApplicationShell`'s routine workflow and `RoutinePage` to
`EveningReviewPanel` using this exact view-facing type:

```ts
Pick<
  RelaxationApplicationService,
  | 'getOrInitialize'
  | 'getStored'
  | 'choosePractice'
  | 'setPracticeDuration'
  | 'completeDrink'
  | 'completeHygiene'
  | 'startPracticeTimer'
  | 'completePractice'
  | 'startScreenFree'
  | 'shortenScreenFree'
  | 'skipScreenFree'
  | 'complete'
>;
```

In `EveningReviewPanel`:

- render current `EveningRelaxationScene` when state is `RELAXING`;
- call `load(true)` after its continuation so the domain view changes to Shutdown;
- render read-only R5 history when selected view is `relaxation`;
- call `getStored`, never `getOrInitialize`, for completed/history cycles;
- keep selected view separate from current domain view;
- show the existing unavailable-history scene when the service is absent, without advancing state.

- [ ] **Step 4: Add refresh regression tests**

Unmount and remount the scene/panel with a repository-backed service after starting the practice
timer and screen-free window. Assert restored `startedAt`, selected practice, duration, and skip or
active state match exactly, and no command fires during render.

- [ ] **Step 5: Run orchestration tests and confirm GREEN**

Run:

```powershell
npm run test:target -- src/app/composition/createLifeOsApplication.test.ts src/app/ApplicationShell.test.ts src/presentation/pages/RoutinePage.test.ts src/presentation/pages/EveningReviewPanel.test.ts
```

Expected: PASS for composition identity, current/history scene selection, continuation reload, and
refresh restoration.

- [ ] **Step 6: Run the focused Evening/R4 regression set**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/EveningCycle.test.ts src/application/evening-cycle/RelaxationApplicationService.test.ts src/application/preparation/PreparationService.test.ts src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts src/presentation/pages/EveningCommandCenter.test.ts src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningRelaxationScene.test.ts
```

Expected: PASS; no R1–R4 state or Preparation regression.

- [ ] **Step 7: Review and checkpoint Task 7**

Run:

```powershell
git diff --check -- src/app src/presentation/pages
git diff -- src/app/composition/LifeOsApplication.ts src/app/composition/createLifeOsApplication.ts src/app/ApplicationShell.tsx src/presentation/pages/RoutinePage.tsx src/presentation/pages/EveningReviewPanel.tsx
git status --short
```

Commit only reviewed R5 hunks as `feat: integrate relaxation evening flow`; do not include unrelated
ApplicationShell, RoutinePage, or composition edits already present in the worktree.

---

### Task 8: Prove real persistence, refresh, mobile behavior, and the final R5 gate

**Files:**

- Create: `tests/e2e/evening-relaxation.acceptance.spec.ts`
- Modify: `docs/design/features/2026-08-30-r5-relaxation-stage.md` only after current-tree evidence passes.

**Interfaces:**

- Consumes: the fully composed real application and stable `data-relaxation-*` hooks from Task 6.
- Produces: browser evidence for R5 acceptance and final documented implementation status.

- [ ] **Step 1: Write the failing managed Playwright acceptance test**

Use real IndexedDB and the existing Routine navigation helpers/patterns. The scenario must:

1. start or seed an Evening cycle at `RELAXING` through public/domain-compatible fixture setup;
2. verify all actions are reachable out of order;
3. select meditation for today, reload, and verify the prior default remains reading;
4. save breathing as default, create/open the next evening, and verify breathing is inherited;
5. start the optional practice timer, reload, and verify elapsed display without auto-completion;
6. complete practice manually;
7. start screen-free at 25, shorten to 10, reload, and verify original start timestamp semantics;
8. cover a separate conscious skip path and verify `Пропущено сегодня` after reload;
9. complete drink/hygiene in reverse order and verify the CTA only enables when readiness is true;
10. advance to Shutdown and open read-only R5 history;
11. assert no Sleep Check, before/after rating, or R6 control exists;
12. collect `pageerror` and error-level console messages and expect both arrays to remain empty.

Run the same structural layout assertion at 1600×900 and 1280×720 in desktop-chrome, and 390×844
and 360×800 in mobile-chrome. At each viewport assert no document/scene horizontal overflow, no
active control smaller than 44×44, correct DOM vertical order, visible focus after keyboard Tab,
and a reachable continuation action.

- [ ] **Step 2: Run the targeted E2E file and confirm RED**

Run:

```powershell
npm run test:e2e -- tests/e2e/evening-relaxation.acceptance.spec.ts
```

Expected before final wiring/stable hooks: FAIL on the first missing R5 browser contract. The managed
runner must release port 4173 after failure.

- [ ] **Step 3: Make only acceptance-driven scoped corrections**

Fix the first concrete browser mismatch within R5 files. Do not weaken layout/touch/focus assertions,
change unrelated navigation, add sleeps, retry the full suite, or add R6 behavior. For countdown
boundaries, seed deterministic timestamps or use the app's injected clock/test fixture instead of a
real ten-minute wait.

- [ ] **Step 4: Run targeted tests after browser corrections**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/RelaxationSnapshot.test.ts src/application/evening-cycle/RelaxationApplicationService.test.ts src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts src/presentation/pages/EveningRelaxationPresentation.test.ts src/presentation/pages/EveningRelaxationScene.test.ts src/presentation/pages/EveningReviewPanel.test.ts
npm run test:e2e -- tests/e2e/evening-relaxation.acceptance.spec.ts
```

Expected: both commands PASS; managed E2E reports desktop/mobile projects and releases port 4173.

- [ ] **Step 5: Run the required current-tree verification gate once**

Run:

```powershell
npm run verify
```

Expected: exit code 0 for typecheck, lint, full unit/integration, infrastructure self-tests, alpha,
build, format check, and `git diff --check` according to the current package scripts. Do not run a
second full suite unless code changed after the green run.

- [ ] **Step 6: Perform real browser visual QA and Rule 38 review**

Use the managed E2E result plus an actual rendered inspection at route
`#/routine/evening?date=YYYY-MM-DD` or the current canonical equivalent. Record:

- source language: R5 spec, Deep Focus archetype, R4/Shutdown references;
- viewports: 1600×900, 1280×720, 390×844, 360×800;
- states: loading, active, timer active, screen-free pending/active/elapsed/skipped, saving, error,
  ready, read-only history, and legacy history;
- keyboard/focus, touch targets, long labels, reduced motion, and horizontal overflow;
- browser console/page errors;
- concrete remaining visual gaps.

Apply Rule 38: one dominant practice surface, clear CTA in 2–3 seconds, semantic colors, no card
around every text, token spacing, success/skip distinction, mobile reflow, visible focus, and a
usable monochrome hierarchy. Verdict cannot be pixel-perfect because R5 has no dedicated reference.

- [ ] **Step 7: Run final Git hygiene and inspect all scoped changes**

Run:

```powershell
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Re-read the final R5 diff for architecture direction, `any`, accidental database-version/store
changes, per-second persistence, user-data mutation, R6 text, accessibility, and unrelated files.

- [ ] **Step 8: Update documentation status from evidence**

Only after all required checks pass, update the R5 specification:

```text
Implementation: COMPLETE
Visual review: COMPLETE (not pixel-perfect; no dedicated reference)
```

Check completed Definition-of-Done items, but leave `Lock: UNLOCKED` and do not set visual status
to `APPROVED` until the user explicitly approves the rendered result.

- [ ] **Step 9: Final checkpoint and handoff**

If all R5 hunks can be isolated safely, commit them with `feat: add evening relaxation stage` after
reviewing `git diff --cached`. Otherwise leave the verified tree uncommitted and say why. Do not
push. Report commands, exit codes, durations, browser evidence, remaining manual QA, and exact final
line:

```text
R5 COMPLETE — WAITING FOR USER APPROVAL.
```

Do not start R6.
