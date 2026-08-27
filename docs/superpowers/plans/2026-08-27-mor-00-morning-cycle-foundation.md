# MOR-00 Morning Cycle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `MorningCycle` and `morningCycles` store with a reload-safe, idempotent one-run-per-date lifecycle while leaving all MOR-01 UI and behavior out of scope.

**Architecture:** `MorningCycle` remains the aggregate and source of morning-run facts. `MorningCycleApplicationService` remains the mutation boundary. The existing repository contract and IndexedDB store gain only a descending lookup for the latest active prior-date run; mapper defaults preserve old schema-version-1 records. Existing LifeAction, Decision, Project, TomorrowPlan, RoutineBlock, Day, and routine-execution models are referenced, never copied.

**Tech Stack:** TypeScript 6, Vitest, IndexedDB/fake-indexeddb, existing LifeOS clean architecture.

**Spec:** `docs/superpowers/specs/2026-08-27-mor-00-morning-cycle-foundation-design.md`

## Global constraints

- Work in the user-approved current checkout; do not create a worktree, commit, or push.
- Use the existing `MorningCycle` and `morningCycles` store; do not add a `MorningRun` engine or a database-version bump.
- Do not add UI, routes, dependencies, MOR-01 stages, progress formulas, time forecasts, shortened-mode behavior, or action/schedule copies.
- Preserve current water and physical activation behavior and all unrelated working-tree changes.
- Implement each production change only after its focused test fails for the expected reason.

### Task 1: Explicit MorningCycle lifecycle and persisted stage snapshots

**Files:**

- Create: `src/domain/morning-cycle/MorningCycleState.ts`
- Create: `src/domain/morning-cycle/MorningStageState.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.test.ts`
- Modify: `src/domain/morning-cycle/index.ts`
- Modify: `src/domain/index.ts`

**Contract:**

```ts
export interface MorningStageState {
  readonly stageId: string;
  readonly status: MorningStageStatus;
  readonly updatedAt: Date | null;
}

cycle.start(at);
cycle.markReadyToWork(at);
cycle.finish(at);
cycle.abandon(at);
cycle.isActive();
```

- [x] Add focused tests for defaults, valid lifecycle transitions, invalid transitions, repeated commands preserving timestamps and version, terminal `isActive() === false`, stage validation, and defensive copies.
- [x] Run `npx vitest run src/domain/morning-cycle/MorningCycle.test.ts` and confirm RED from missing lifecycle behavior.
- [x] Add the minimal enums, validation, state fields, lifecycle commands, and exports without changing existing water/physical semantics.
- [x] Re-run the focused test and confirm GREEN.

### Task 2: Legacy-safe record mapping and prior-active lookup

**Files:**

- Modify: `src/infrastructure/persistence/records/MorningCycleRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts`
- Create: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts`
- Modify: `src/application/ports/MorningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/InMemoryMorningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts`

**Contract:**

```ts
findLatestUnfinishedBefore(dateKey: DayDate): Promise<MorningCycle | null>;
```

- [x] Add mapper tests for exact round-trip, absent legacy fields, explicit nullable timestamps, and invalid lifecycle/stage values.
- [x] Add repository tests proving reload preserves the lifecycle/stages and descending lookup skips terminal records and excludes the boundary date.
- [x] Run the two focused persistence test files and confirm RED.
- [x] Extend schema-version-1 records and mapper defaults; add the repository method using existing indexes and defensive aggregate copies. Do not migrate, clear, or recreate storage.
- [x] Re-run the focused persistence tests and confirm GREEN.

### Task 3: Current context and idempotent application transitions

**Files:**

- Modify: `src/application/morning-cycle/MorningCycleApplicationService.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.test.ts`

**Contract:**

```ts
export interface MorningCycleContext {
  readonly current: MorningCycle | null;
  readonly previousUnfinished: MorningCycle | null;
}

getCurrentContext(): Promise<MorningCycleContext>;
markReadyToWork(date: DayDate): Promise<MorningCycle>;
finish(date: DayDate): Promise<MorningCycle>;
abandonUnfinished(date: DayDate): Promise<MorningCycle>;
```

- [x] Add service tests proving repeated start retains the id, yesterday never becomes current, today and yesterday are returned separately, terminal runs disappear from active context, and repeated abandonment keeps one record and timestamp.
- [x] Run `npx vitest run src/application/morning-cycle/MorningCycleApplicationService.test.ts` and confirm RED.
- [x] Implement context lookup and transitions through the existing CAS mutation path. Keep start/read compatibility and current-date guards on ordinary mutations.
- [x] Re-run the focused service test and confirm GREEN.

### Task 4: Integration and regression verification

**Files:**

- Modify only if a missing contract is exposed: existing application composition tests and exports.
- Verify unchanged: Routine and Today presentation tests.

- [x] Run focused MOR-00 tests together, including mapper, IndexedDB, service, and aggregate tests.
- [x] Run the existing Routine and Today test files discovered by `rg`.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:alpha`, `npm run test:e2e`, `npm run build`, and `npm run format:check` as required by `docs/codex/TEST_MATRIX.md`.
- [x] Run `git diff --check`, inspect the complete `git diff`, and inspect `git status --short`.
- [x] Obtain an independent read-only final review, fix only MOR-00 findings, repeat affected checks, and stop with the requested nine-part report. Do not continue to MOR-01.
