# MOR-04.2 / MOR-05 Shortened Morning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved main-action check and add a persistent, reversible shortened MorningCycle with safe physical overrides, weighted progress, and neutral remaining-time forecast.

**Architecture:** Keep `TomorrowPlan`/`Decision`/`LifeAction`/`RoutineBlock` authoritative for main-action data. Extend `MorningCycle` only with per-run mode/configuration and safe-boundary metadata; calculate progress/forecast in pure application policy functions consumed by the Center query. Reuse the existing Morning Center and in-page detail archetypes.

**Tech Stack:** TypeScript, React, Vitest, IndexedDB mappers/repositories, Playwright E2E, existing LifeOS CSS tokens.

**Spec:** `docs/design/features/2026-08-28-mor-05-shortened-morning.md`

## Global Constraints

- Work only in the current authoritative dirty worktree; no new worktree, commit, or push.
- Preserve MOR-01…MOR-04 facts and unrelated modules.
- Use TDD for new logic; presentation-only polish does not require artificial red/green cycles.
- Do not implement MOR-06, history, analytics, automation, or a new visual language.
- Run targeted tests, typecheck/lint, targeted MOR-05 E2E; full verify at most once.

---

### Task 1: MOR-04.2 authoritative main-action projection

**Files:**

- Create: `src/application/queries/GetMorningMainActionOverview.ts`
- Create: `src/application/queries/GetMorningMainActionOverview.test.ts`
- Modify: `src/application/queries/GetMorningCenterOverview.ts`
- Modify: composition exports/wiring.

**Interfaces:** Produce title/expectedResult/scheduledTime/firstStep/candidates/ready from existing repositories. Candidates are active target-date LifeActions belonging to the plan primary Decision.

- [ ] Write failing selection/projection tests with literal expected fields and candidate ordering.
- [ ] Run targeted test and confirm RED because the query is absent.
- [ ] Implement the projection by extracting/reusing the authoritative selection rules from `GetMorningOverview`.
- [ ] Run targeted tests to GREEN.

### Task 2: MOR-04.2 candidate assignment and presentation

**Files:**

- Modify: `src/application/tomorrow-plan/TomorrowPlanService.ts` and tests.
- Create: `src/presentation/pages/MorningMainActionPage.tsx` and test.
- Modify: `MorningCenterPage.tsx`, `RoutinePage.tsx`, `ApplicationShell.tsx` and scoped tests.

**Interfaces:** `assignFirstActionForTargetDate(date, actionId)` uses repository CAS and existing TomorrowPlan domain validation. The page renders the four approved facts, candidate radios when firstAction is absent, and routes missing time to the existing RoutineBlock form.

- [ ] Write failing service and presentation behavior tests.
- [ ] Confirm RED for missing target-date command/detail view.
- [ ] Implement the minimal command/orchestration and existing-form handoff.
- [ ] Run MOR-04 targeted tests to GREEN before MOR-05 changes.

### Task 3: Per-run shortened mode and configuration

**Files:**

- Create: `src/domain/morning-cycle/MorningShortenedMode.ts`.
- Modify: `MorningCycle.ts`, its tests, stage exports.

**Interfaces:** Persist `normal | shortened_active | reverted_to_normal`, immutable-copy configuration (`coldShower`, `physical`, `mirror`), and an ever-shortened/history-eligibility fact. `activateShortened(config, at)` and `revertToNormal(at)` are idempotent and preserve cycle identity/facts.

- [ ] Write failing lifecycle, idempotency, cross-date isolation and defensive-copy tests.
- [ ] Confirm RED.
- [ ] Implement minimal domain state/validation.
- [ ] Run domain tests to GREEN.

### Task 4: Physical safe-boundary override

**Files:**

- Modify: `MorningPhysicalExecution.ts` and tests.
- Modify: `MorningCycle.ts` and tests.

**Interfaces:** A pending override never suppresses the current unresolved set. After that set resolves, `advancePhysicalExecution` applies suppression before selecting the next allowed set. Resolved actuals and original plan items remain unchanged; repeated activation is a no-op.

- [ ] Write failing tests for mid-set activation, preserved actual, boundary application, keep/shorten/skip and revert-before-boundary.
- [ ] Confirm RED with unchanged current set.
- [ ] Implement suppression metadata and safe advance/complete rules.
- [ ] Run domain tests to GREEN.

### Task 5: Application commands and persistence round-trip

**Files:**

- Modify: `MorningCycleApplicationService.ts` and tests.
- Modify: `MorningCycleRecord.ts`, mapper and mapper/repository tests.

**Interfaces:** Add activate/revert commands through existing current-date and CAS mutation path. New record fields are optional with safe defaults for existing v1 records; no new store/schema version.

- [ ] Write failing command/CAS and legacy/new round-trip tests.
- [ ] Confirm RED.
- [ ] Implement mapper/record/service changes.
- [ ] Run targeted application and persistence tests to GREEN.

### Task 6: Weighted progress and remaining forecast policy

**Files:**

- Create: `src/application/morning-cycle/MorningForecastPolicy.ts` and test.
- Modify: `GetMorningCenterOverview.ts` and tests.

**Interfaces:** Calculate completed weighted work from baseline minutes × internal significance coefficients and scenario-specific remaining work. Accept an optional typical-duration profile but use baseline values in v1. Return stage estimate/status (`normal|shortened|skipped`) and never copy calculations into JSX.

- [ ] Write failing literal table tests for normal, shortened, reverted, partial physical execution and non-regression on activation.
- [ ] Confirm RED against the existing 20%-per-stage model.
- [ ] Implement the pure policy and Center projection integration.
- [ ] Run query tests to GREEN.

### Task 7: MOR-05 approved Center states

**Files:**

- Create: `src/presentation/pages/MorningShortenedConfiguration.tsx` and test.
- Create: `src/presentation/styles/morning-shortened.css`.
- Modify: `MorningCenterPage.tsx`, `MorningStagePresentation.ts`, global import and targeted presentation tests.

**Interfaces:** Before activation show `Сократить утро`; configuration uses per-stage radio options. Active state shows `Сокращённый режим`, updated neutral stage labels, and `Вернуться к обычному`; current stage remains the visual center.

- [ ] Write failing semantic/state tests for normal/config/active/reverted/read-only.
- [ ] Confirm RED for missing configuration component.
- [ ] Implement orchestration and scoped presentation using existing tokens/segmented pattern.
- [ ] Run targeted presentation tests to GREEN.

### Task 8: Targeted E2E, browser QA, and handoff

**Files:**

- Modify: `tests/e2e/morning-center.acceptance.spec.ts`.
- Update: this spec status after evidence.

- [ ] Add targeted flow normal → shortened → reload → reverted and mid-set safe-boundary assertions.
- [ ] Run targeted MOR-04/MOR-05 unit/integration suites, then typecheck/lint.
- [ ] Run targeted MOR-05 E2E at desktop/mobile.
- [ ] Inspect real normal/active/reverted states, focus, safe area, overflow, reduced motion and console.
- [ ] Run `git diff --check`, inspect diff/status, leave local server running, and stop before MOR-06.
