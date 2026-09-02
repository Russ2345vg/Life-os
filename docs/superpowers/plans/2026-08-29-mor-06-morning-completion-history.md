# MOR-06 Morning Completion and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Do not create a new worktree and do not commit or push.

**Goal:** Complete the accepted morning lifecycle with a real-data summary, idempotent handoff to Today, and explainable 7/30-day history.

**Architecture:** Strengthen MorningCycle readiness with a derived policy over existing cycle facts plus the existing main-action query. Keep MOR-03 execution as the physical source of truth, add range reading to the MorningCycle repository, and project summary/history through application queries into a focused final UI.

**Tech Stack:** TypeScript 6, React 19, IndexedDB, Vitest, Playwright, existing LifeOS CSS tokens.

**Spec:** `docs/design/features/2026-08-29-mor-06-morning-completion-history.md`

## Global Constraints

- Implement MOR-06 only; preserve MOR-00…MOR-05 except required integration points.
- No dependency, worktree, commit, push, work-session, timer, achievement, streak, or MOR-07 work.
- Mirror is optional and never gates readiness.
- Hygiene, work clothing, and phrase-reading are neither stored nor displayed.
- Use only real MorningCycle, MorningPhysicalExecution, TomorrowPlan, Decision, LifeAction, and routine occurrence data.

---

### Task 1: Readiness and idempotent lifecycle

**Files:**

- Modify: `src/domain/morning-cycle/MorningStageState.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.ts`
- Modify: `src/domain/morning-cycle/MorningCycle.test.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.ts`
- Modify: `src/application/morning-cycle/MorningCycleApplicationService.test.ts`

**Interfaces:**

- Produces: guarded readiness from existing quick-start/physical/main-action facts, explicit allowed no-main-action resolution, and one-time `READY_TO_WORK → FINISHED`.

- [ ] Write failing domain tests for blocked mandatory facts, optional Mirror, allowed skips, and no-main-action resolution.
- [ ] Run `npm run test:target -- src/domain/morning-cycle/MorningCycle.test.ts` and confirm expected failures.
- [ ] Implement the minimal domain readiness policy and stage resolution.
- [ ] Write failing application tests for automatic CAS promotion, refresh reconciliation, and duplicate finish.
- [ ] Run `npm run test:target -- src/application/morning-cycle/MorningCycleApplicationService.test.ts` and confirm expected failures.
- [ ] Implement application orchestration using the existing main-action overview as the external readiness source.
- [ ] Run both targeted files green.

### Task 2: Real-data summary, history, and persistence range

**Files:**

- Modify: `src/application/ports/MorningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/InMemoryMorningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbMorningCycleRepository.test.ts`
- Create: `src/application/queries/GetMorningCompletionOverview.ts`
- Create: `src/application/queries/GetMorningCompletionOverview.test.ts`
- Create: `src/application/queries/GetMorningHistory.ts`
- Create: `src/application/queries/GetMorningHistory.test.ts`
- Modify: application/infrastructure export barrels and composition.

**Interfaces:**

- Produces: `findBetween(start, end)`, completion projection, history items, and explainable 7/30-day summaries.

- [ ] Write and fail repository range tests against IndexedDB ordering and inclusive boundaries.
- [ ] Implement `findBetween` without a schema or storage change.
- [ ] Write and fail projection tests using literal MOR-03 results and shortened/normal fixtures.
- [ ] Implement pure aggregation over `MorningPhysicalExecution.sets` and paused session duration.
- [ ] Write and fail history/statistics tests, including shortened mornings excluded from normal-duration learning.
- [ ] Implement history using existing cycles and main-action query data.
- [ ] Run all new targeted query/repository tests green.

### Task 3: Final screen, history view, and Today handoff

**Files:**

- Create: `src/presentation/pages/MorningCompletionPage.tsx`
- Create: `src/presentation/pages/MorningCompletionPage.test.tsx`
- Create: `src/presentation/styles/morning-completion.css`
- Modify: `src/presentation/pages/MorningCenterPage.tsx`
- Modify: `src/presentation/pages/MorningCenterPage.test.ts`
- Modify: `src/presentation/pages/MorningMainActionPage.tsx`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/app/ApplicationShell.test.ts`

**Interfaces:**

- Consumes: completion/history queries and guarded lifecycle commands.
- Produces: clear prepared-center entry, accepted final screen, mobile history, and navigation-only handoff to Today.

- [ ] Write failing component tests for ready, partial_allowed, finished, real physical values, history, retry, and duplicate-click disabled state.
- [ ] Run targeted component tests and confirm expected failures.
- [ ] Implement the focused final/history UI with existing tokens and accessible controls.
- [ ] Update Morning Center so Mirror is visibly optional, prepared mornings point to the final screen, and finished dates reopen closed.
- [ ] Wire the CTA to finish once, then navigate to Today without starting any work execution.
- [ ] Run targeted component and shell tests green.

### Task 4: Acceptance and visual refinement

**Files:**

- Modify: `tests/e2e/morning-center.acceptance.spec.ts`

**Interfaces:**

- Produces: acceptance coverage for normal, allowed partial, shortened, refresh, history, desktop, and mobile paths.

- [ ] Write a failing targeted MOR-06 E2E path before final UI refinement.
- [ ] Run the managed MOR-06 E2E selector and confirm the expected failure.
- [ ] Refine only evidenced layout/behavior gaps.
- [ ] Run targeted unit/integration tests, `npm run test:fast` if shared contracts require it, `npm run typecheck`, `npm run lint`, and targeted managed E2E.
- [ ] Run desktop/mobile browser QA, keyboard/focus, console inspection, and Design Rule №38.
- [ ] Run at most one `npm run verify` before handoff because lifecycle/history touch persistent state.
- [ ] Run `git diff --check`, inspect `git diff`, and report the full dirty status without overwriting pre-existing MOR work.
- [ ] Leave the explicitly started local server running for the user's manual visual acceptance; do not commit or push.
