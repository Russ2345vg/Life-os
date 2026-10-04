# Morning Workout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent ready-made morning workout before the daily main-focus block and ship it as LifeOS 1.0.33.

**Architecture:** Extend the existing `MorningCycle` aggregate and IndexedDB stores instead of creating parallel ritual state. A focused `MorningWorkoutService` maps the aggregate to a Planner V2 read model, owns ready-plan creation and load recommendations, while `PlannerToday` renders a list-first card and gates morning focus on the physical stage result.

**Tech Stack:** TypeScript 6, React 19, IndexedDB, Vitest, Playwright, Tauri 2 release scripts.

**Spec:** `docs/design/features/2026-10-04-morning-workout.md`

## Global Constraints

- Equipment is limited to a pull-up bar and mat.
- The workout is a ready-made daily complex of about 30 minutes and has no timer.
- Users record actual sets and repetitions or seconds.
- The workout appears before morning focus; focus unlocks after workout completion or explicit skip.
- Accepted recommendations seed the next morning and remain in sync through `morning_cycle`.
- Reuse the approved Premium UI direction, existing tokens and controls; add no dependency.
- Preserve every pre-existing dirty change authorized for the release.

## Review Focus

- Legacy databases missing the two new system exercises must migrate without losing records; Task 2 adds an upgrade test from version 32.
- A reload during an active workout must reopen the same unresolved set; Task 2 adds repository round-trip coverage.
- A malformed or stale recommendation must not corrupt the next plan; Task 1 validates recommendation plan shape during rehydration.
- Double clicks on set completion must not advance twice; Task 3 tests serialized service commands and idempotent reload.
- Focus must stay blocked for loading/error/in-progress workout states and unlock only for done/skipped; Task 4 adds component and E2E assertions.

---

### Task 1: Workout domain and adaptive recommendation

**Files:**

- Create: `src/domain/morning-exercise/MorningPhysicalRecommendation.ts`
- Modify: `src/domain/morning-exercise/ExerciseDefinition.ts`
- Modify: `src/domain/morning-exercise/index.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.ts`
- Test: `src/domain/morning-cycle/MorningCycle.test.ts`
- Test: `src/domain/morning-exercise/MorningPhysicalRecommendation.test.ts`

**Interfaces:**

- Consumes: `MorningPhysicalPlanItem`, `MorningPhysicalExecution`, existing plan adjustment invariants.
- Produces: `buildMorningPhysicalRecommendation(plan, execution): MorningPhysicalPlanItem[] | null`, persisted recommendation state and `MorningCycle.acceptPhysicalRecommendation()` / `dismissPhysicalRecommendation()`.

- [ ] **Step 1: Write failing tests for the exact ready plan, increase/decrease rules, non-progressing mobility, recommendation decisions and malformed rehydration.**
- [ ] **Step 2: Run `npm run test:target -- src/domain/morning-exercise/MorningPhysicalRecommendation.test.ts src/domain/morning-cycle/MorningCycle.test.ts` and confirm the new assertions fail for missing behavior.**
- [ ] **Step 3: Add warm-up/stretching seeds, recommendation value objects and aggregate methods with optional backward-compatible rehydration fields.**
- [ ] **Step 4: Run the same targeted command and confirm it passes.**
- [ ] **Step 5: Commit the domain and specification changes as `feat: add adaptive morning workout domain`.**

### Task 2: IndexedDB repositories and migration

**Files:**

- Create: `src/application/morning/MorningCycleRepository.ts`
- Create: `src/application/morning/ExerciseDefinitionRepository.ts`
- Create: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.ts`
- Create: `src/infrastructure/persistence/IndexedDbExerciseDefinitionRepository.ts`
- Modify: `src/infrastructure/persistence/records/MorningCycleRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Test: `src/infrastructure/persistence/mappers/MorningCycleRecordMapper.test.ts`
- Test: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.integration.test.ts`
- Test: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`

**Interfaces:**

- Consumes: recommendation state from Task 1.
- Produces: `MorningCycleRepository.findByDate`, `latestBefore`, `save`, `subscribe`; `ExerciseDefinitionRepository.list`; IndexedDB schema version 33.

- [ ] **Step 1: Write failing mapper, repository and v32→v33 migration tests, including active execution round-trip and preserved legacy records.**
- [ ] **Step 2: Run only those tests and confirm failures are caused by missing repositories/migration fields.**
- [ ] **Step 3: Implement mapped persistence, commit notifications and the idempotent seed migration for warm-up/stretching.**
- [ ] **Step 4: Run the targeted persistence tests and confirm they pass.**
- [ ] **Step 5: Commit as `feat: persist morning workout progress`.**

### Task 3: Morning workout application service

**Files:**

- Create: `src/application/morning/MorningWorkoutService.ts`
- Create: `src/application/morning/MorningWorkoutService.test.ts`
- Modify: `src/application/index.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Test: `src/app/composition/createLifeOsApplication.test.ts`

**Interfaces:**

- Consumes: repositories from Task 2, current day id/date, `Clock` and `IdGenerator`.
- Produces: `MorningWorkoutService.get(date)`, `start(date)`, `completeCurrentSet(date, actual)`, `skipCurrentSet(date)`, `skip(date)`, `acceptRecommendation(date)`, `dismissRecommendation(date)`, `subscribe(listener)` and `MorningWorkoutSnapshot`.

- [ ] **Step 1: Write failing service tests for ready-plan creation, reload resume, serialized double completion, completion recommendation, accept/dismiss and next-day seeding.**
- [ ] **Step 2: Run the service/composition tests and verify the new tests fail for missing APIs.**
- [ ] **Step 3: Implement the application service and compose it from the existing database and current day.**
- [ ] **Step 4: Run the targeted service/composition tests and confirm they pass.**
- [ ] **Step 5: Commit as `feat: expose morning workout service`.**

### Task 4: Planner V2 workout card and focus gate

**Files:**

- Create: `src/presentation/planner-v2/MorningWorkoutCard.tsx`
- Create: `src/presentation/planner-v2/morning-workout.css`
- Create: `src/presentation/planner-v2/MorningWorkoutCard.test.tsx`
- Modify: `src/presentation/planner-v2/MorningFocusCard.tsx`
- Modify: `src/presentation/planner-v2/PlannerToday.tsx`
- Modify: `src/presentation/planner-v2/PlannerToday.test.tsx`
- Modify: `src/presentation/planner-v2/PlannerWorkspace.tsx`
- Modify: `src/presentation/planner-v2/planner-v2.css`
- Test: `tests/e2e/current.morning-workout.spec.ts`
- Modify: `tests/e2e/current.morning-focus.spec.ts`

**Interfaces:**

- Consumes: `MorningWorkoutService` and snapshot from Task 3.
- Produces: list-first accessible workout card, persisted commands and `workoutResolved` focus gate.

- [ ] **Step 1: Write failing component tests for loading/error/not-started/in-progress/completed/skipped, focus gating and duplicate submission prevention.**
- [ ] **Step 2: Run the component tests and confirm the new assertions fail.**
- [ ] **Step 3: Implement the card, responsive styles and Planner integration using existing tokens and controls.**
- [ ] **Step 4: Run component tests and scoped Playwright desktop/mobile scenarios; inspect focus order and console.**
- [ ] **Step 5: Commit as `feat: add morning workout to today ritual`.**

### Task 5: Release 1.0.33

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: release notes generated under `src-tauri/target/release-channel/v1.0.33/` (not committed unless already tracked by policy).

**Interfaces:**

- Consumes: completed Tasks 1–4 and all authorized pre-existing work in the branch.
- Produces: committed/pushed `codex/morning-workout-release-1.0.33`, tag/release assets for LifeOS 1.0.33 and verified public download URLs.

- [ ] **Step 1: Run focused tests, `npm run test:fast`, `npm run test:release`, then the release criterion `npm run verify:full`.**
- [ ] **Step 2: Perform desktop 1440×900 and mobile 390×844 browser comparison, keyboard/focus and console QA; run `git diff --check` and inspect the final diff/status.**
- [ ] **Step 3: Request a fresh read-only final review, fix any confirmed blocker, and rerun only checks invalidated by fixes.**
- [ ] **Step 4: Bump all four version sources to 1.0.33, commit, push branch and tag/source commit as required by the release scripts.**
- [ ] **Step 5: Run `npm run release:publish -- prepare 1.0.33 --owner Russ2345vg --notes "Утренняя зарядка, фокус по главной задаче, Pomodoro и исправление голосового ввода."`, inspect prepared manifests/checksums, then publish the exact prepared assets.**
- [ ] **Step 6: Verify GitHub source/release visibility, public `latest.json`, Windows installer and Android APK links, and report any native install check that still requires a second machine.**
