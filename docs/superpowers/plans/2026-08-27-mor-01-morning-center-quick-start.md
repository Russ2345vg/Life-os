# MOR-01 Morning Center and Quick Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reload-safe Morning Center with five-stage progress, approximate remaining time, shortening entry point, and Quick Start for water and cold shower on the existing morning routine route.

**Architecture:** `MorningCycle` remains the aggregate; existing water fields and one stable cold-shower stage snapshot are the persisted facts. `MorningCycleApplicationService` is the sole mutation boundary, `GetMorningCenterOverview` is the sole MOR-01 read model, and a focused presentation component is embedded in the existing Routine morning subsection.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, IndexedDB/fake-indexeddb, Playwright 1.62, existing LifeOS CSS tokens and clean architecture.

**Spec:** `docs/superpowers/specs/2026-08-27-mor-01-morning-center-quick-start-design.md`

## Global constraints

- Work in the user-approved current checkout; do not create a worktree, commit, push, or discard the uncommitted MOR-00 foundation.
- Extend only the existing `MorningCycle`, application service, repository-backed read path, and morning Routine UI.
- Do not add dependencies, a database-version bump, a second store, or copies of LifeAction, Decision, Project, TomorrowPlan, RoutineBlock, or routine-execution data.
- Do not implement physical activation, Mirror, main action, or work-block actions, automatic stage skipping, personalization, learned forecasts, or history.
- Add production behavior only after its focused test fails for the expected missing contract.

---

### Task 1: Cold-shower aggregate contract

**Files:**

- Modify: `src/domain/morning-cycle/MorningStageState.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.test.ts`
- Modify: `src/domain/morning-cycle/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Produces: `MORNING_STAGE_ID.coldShower`, shower commands, and idempotent `MorningCycle.shorten(at)` over the existing marker.
- Preserves: existing water and physical contracts, lifecycle guards, defensive `stageStates` reads, and version semantics.

- [ ] Add one test for completing the shower, one for skipping it, one for repeated same-choice idempotency, one for opposite terminal-choice rejection, and one for closed/not-started guards.
- [ ] Run `npm run test -- src/domain/morning-cycle/MorningCycle.test.ts`; confirm RED because the two commands and stable id do not exist.
- [ ] Add the stable stage id and minimal private stage transition helper. Replace only the aggregate's internal readonly array so it can atomically replace the shower snapshot.
- [ ] Re-run the focused domain test and confirm GREEN.

### Task 2: Application commands and persistence round-trip

**Files:**

- Modify: `src/application/morning-cycle/MorningCycleApplicationService.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts`

**Interfaces:**

- Consumes: `MorningCycle.completeColdShower(at)` and `MorningCycle.skipColdShower(at)`.
- Produces: shower commands and `MorningCycleApplicationService.shorten(date)`, all returning `Promise<MorningCycle>` through the existing CAS mutation loop.

- [ ] Add service tests for both commands, current-date enforcement, repeated same-choice stability, and opposite-choice rejection.
- [ ] Run the focused service test and confirm RED from missing application methods.
- [ ] Add both guarded commands by delegating to the existing `mutate` path; do not expose arbitrary stage mutation.
- [ ] Re-run the focused service test and confirm GREEN.
- [ ] Add an IndexedDB test that saves a shower choice, reopens the repository, and reads the same stage id/status/timestamp without changing DB or record schema versions.
- [ ] Run the focused IndexedDB test and confirm it is GREEN using the existing mapper path; if it exposes a real missing production contract, add only that contract after a failing test.

### Task 3: Authoritative Morning Center query

**Files:**

- Create: `src/application/queries/GetMorningCenterOverview.ts`
- Create: `src/application/queries/GetMorningCenterOverview.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: `MorningCycleRepository.findByDateKey(date)` and `findLatestUnfinishedBefore(date)` plus `CurrentDateProvider`.
- Produces: immutable `MorningCenterOverview` with lifecycle, five ordered stage states, overall progress, approximate remaining time, shortening state, recovery, and Quick Start facts.

- [ ] Add pure resolution tests for no cycle, partial/completed Quick Start, existing physical completion, normal/shortened estimates, terminal and historical states, and previous unfinished visibility only for the current date.
- [ ] Add an execute test using the real in-memory repository and current-date provider; confirm RED because the query does not exist.
- [ ] Implement the focused query and resolver with defensive dates and no timer/progress persistence.
- [ ] Export the query and re-run the focused test to GREEN.

### Task 4: Composition wiring

**Files:**

- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`

**Interfaces:**

- Consumes: existing `morningCycleRepository` and `currentDateProvider`.
- Produces: `application.getMorningCenterOverview` alongside the existing legacy `getMorningOverview`; no legacy consumer is silently redirected.

- [ ] Add a composition assertion that the focused query exists and executes against the same morning repository.
- [ ] Run the composition test and confirm RED because the application property is missing.
- [ ] Construct, type, expose, and assign `GetMorningCenterOverview` without changing existing composition order or storage.
- [ ] Re-run the composition test and confirm GREEN.

### Task 5: Morning Center presentation

**Files:**

- Create: `src/presentation/pages/MorningCenterPage.tsx`
- Create: `src/presentation/pages/MorningCenterPage.test.ts`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- Consumes: `Pick<GetMorningCenterOverview, 'execute'>`, the focused MorningCycle start/water/shower/shorten/recovery commands, and `Pick<Clock, 'now'>`.
- Produces: a focused Morning Center rendered only for `ROUTINE_SECTION.morning`; Quick Start completion focuses the next preview stage while day/evening behavior remains unchanged.

- [ ] Add presentation tests for loading/recovery, overall progress/time, current/completed/upcoming stages, normal/shortened state, Quick Start pending/completed/skipped states, historical read-only state, explicit shower-only skip copy, and disabled busy controls.
- [ ] Add a RoutinePage regression asserting the morning subsection renders the Morning Center boundary while Day and Evening retain existing behavior; confirm RED.
- [ ] Implement the page state machine: load/retry, mutation/reload, center/detail navigation, elapsed-time refresh, focus movement/restoration, and error alerts.
- [ ] Wire query, commands, and clock through `ApplicationShell` and `RoutinePage`; do not read or mutate repositories in React.
- [ ] Add scoped token-based styles for 1600×900, 1280×720, 390×844, and 360×800, including real content-boundary overflow checks, 44px targets, safe bottom padding, focus, disabled, error, and success states.
- [ ] Re-run presentation and Routine tests and confirm GREEN.

### Task 6: Acceptance and verification

**Files:**

- Create: `tests/e2e/morning-center.acceptance.spec.ts`
- Modify only if a verified testability boundary is missing: existing E2E helpers.

**Interfaces:**

- Exercises: direct route, recovery, start, water, shower complete/skip, reload/resume, historical read-only state, keyboard focus, responsive layout, and console/page errors.

- [ ] Add the acceptance test and run it alone; confirm RED before the UI path is complete, then GREEN after the implementation.
- [ ] Run focused domain, application, persistence, composition, presentation, and acceptance tests together.
- [ ] Run targeted tests, `npm run test:fast`, `npm run typecheck`, `npm run lint`, and the targeted MOR-01 E2E; run `npm run verify` exactly once after stabilization.
- [ ] Run browser QA against the approved reference at 1600×900, 1280×720, 390×844, and 360×800; inspect overflow, focus, touch targets, reload state, and console/page errors.
- [ ] Run `git diff --check`, inspect the complete diff and status, obtain independent read-only architecture/test/UI/final review, fix only MOR-01 findings, repeat affected checks, and stop before MOR-02.
