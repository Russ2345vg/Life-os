# R6 Sleep Check Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the persisted «Сон» Sleep Check stage between Relaxation and the existing Shutdown flow, including before/after ratings, three sequential questions, at most one corrective action, one retry, refresh-safe history, and Deep Focus UI.

**Architecture:** `EveningCycle` stays the only Evening state machine and gains `SLEEP_CHECK` plus an embedded `SleepCheckSnapshot`. A focused `SleepCheckApplicationService` mutates the existing `EveningCycleRepository` through the current optimistic CAS convention; record persistence is additive schema-v1 data. Presentation derives the active question and history from saved facts, while React owns only drafts and operation state.

**Tech Stack:** TypeScript, React, Vitest, IndexedDB, Playwright, existing LifeOS CSS tokens.

**Spec:** `docs/design/features/2026-08-30-r6-sleep-check-stage.md`

## Global Constraints

- State flow is exactly `PREPARING → RELAXING → SLEEP_CHECK → SHUTDOWN → COMPLETED` for new cycles.
- `EveningCycle`, `EveningCycleRepository`, and the existing Shutdown/Recovery path remain authoritative.
- Store `calmBefore`, `sleepReadinessBefore`, `calmAfter`, and `sleepReadinessAfter` as `1 | 2 | 3 | 4 | 5`; never fabricate missing legacy values.
- Show exactly one active question; `HOLDING_THOUGHT: YES` is problematic, while `CALM_MIND: NO` and `READY_FOR_SLEEP: NO` are problematic.
- Permit at most one corrective action for the entire check, tied to its question, followed by one retry of that question.
- A negative retry does not block completion. Completed/history state is immutable through the current-flow UI.
- Use the existing CAS retry limit, existing store, record schema version 1, and IndexedDB version 19. No new repository, store, dependency, or destructive migration.
- Preserve `dateKey/dayId` across midnight and preserve all R3–R5 facts exactly.
- Main agent is the only file author. Fresh subagents provide task implementation analysis and separate review evidence; they do not edit files.
- TDD is mandatory: record a targeted expected failure before each production behavior, then run the same target green.
- R6 gate is targeted tests → targeted R6 desktop/mobile Playwright spec → `npm run verify` → stop. Do not run the full E2E suite automatically.
- Preserve unrelated dirty-tree changes; never stage, revert, format, or commit unrelated files.

## Planned file responsibilities

- `src/domain/evening-cycle/SleepCheckSnapshot.ts` — all R6 typed values, ratings, answers, corrective-action and retry invariants.
- `src/domain/evening-cycle/EveningCycle.ts` — ownership, state transitions, versioning, legacy bridge, and snapshot mutation boundary.
- `src/application/evening-cycle/SleepCheckApplicationService.ts` — typed R6 commands and bounded CAS retry.
- `src/infrastructure/persistence/records/EveningCycleRecord.ts` and mapper — optional additive R6 serialization/validation.
- `src/presentation/components/SubjectiveRatingScale.tsx` — reusable accessible 1–5 radio control.
- `src/presentation/pages/EveningSleepCheckPresentation.ts` — pure active-phase, progress, copy, readiness, and history model.
- `src/presentation/pages/EveningSleepCheckScene.tsx` — Deep Focus interaction and application-command orchestration.
- `src/presentation/styles/evening-sleep-check.css` — R6-scoped tokens-based layout, state, responsive, and reduced-motion rules.
- `tests/e2e/evening-sleep-check.acceptance.spec.ts` — one targeted desktop and one targeted mobile R6 flow.

---

### Task 1: Define R6 domain contracts and EveningCycle transitions

**Files:**

- Create: `src/domain/evening-cycle/SleepCheckSnapshot.ts`
- Create: `src/domain/evening-cycle/SleepCheckSnapshot.test.ts`
- Modify: `src/domain/evening-cycle/EveningCycleState.ts`
- Modify: `src/domain/evening-cycle/EveningCycle.ts`
- Modify: `src/domain/evening-cycle/EveningCycle.test.ts`
- Modify: `src/domain/evening-cycle/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Produces `SubjectiveRating`, `SleepCheckQuestionId`, `SleepCheckAnswerValue`, `CorrectiveActionKind`, `SleepCheckAnswer`, `SleepCheckCorrectiveAction`, `SleepCheckSnapshot`, guards/constants, `EveningCycle.sleepCheck`, and state `SLEEP_CHECK`.
- Produces aggregate methods `setBeforeRelaxationRatings`, `setAfterRelaxationRatings`, `answerSleepCheckQuestion`, `chooseSleepCheckCorrectiveAction`, `completeSleepCheckCorrectiveAction`, `retrySleepCheckQuestion`, `completeSleepCheck`, and legacy recovery bridge.

- [ ] Write failing `SleepCheckSnapshot.test.ts` cases for rating range, fixed question order, problematic detection, one initial answer, one global corrective action, question/action binding, capture validation, completion idempotency, one retry, negative retry readiness, frozen completion, copied dates, and unknown persisted values.
- [ ] Extend `EveningCycle.test.ts` with a failing normal chain that requires BEFORE ratings, proves `RELAXING → SLEEP_CHECK → SHUTDOWN`, rejects bypass, keeps `dateKey/dayId` across midnight, allows legacy `SHUTDOWN/COMPLETED` without R6 facts, and keeps repeated identical commands version-idempotent.
- [ ] Run `npm run test:target -- src/domain/evening-cycle/SleepCheckSnapshot.test.ts src/domain/evening-cycle/EveningCycle.test.ts`; expected failure is missing R6 exports/state/behavior, not syntax or fixture failure.
- [ ] Implement the minimal focused value object and aggregate methods. Use closed string constants, immutable copies, `DomainError`, and no presentation labels.
- [ ] Update rehydration invariants: RELAXING may hold an unstarted before-rated snapshot; SLEEP_CHECK requires a started snapshot; SHUTDOWN/COMPLETED accept `null` legacy or a completed R6 snapshot.
- [ ] Change ordinary `completeRelaxation` to finalize R5 and start the embedded snapshot before transitioning to `SLEEP_CHECK`. Keep a controlled completed-day legacy bridge that creates no R6 facts.
- [ ] Run the same targeted command; expected PASS with every new domain test green.
- [ ] Request a separate read-only review for spec coverage, invariants, idempotency, unknown IDs, legacy compatibility, and accidental R5/Recovery changes; fix findings through a new failing test where behavior changes.

### Task 2: Add focused application commands and concurrency behavior

**Files:**

- Create: `src/application/evening-cycle/SleepCheckApplicationService.ts`
- Create: `src/application/evening-cycle/SleepCheckApplicationService.test.ts`
- Modify: `src/application/evening-cycle/RelaxationApplicationService.test.ts`
- Modify: `src/application/evening-cycle/EveningCycleApplicationService.ts`
- Modify: `src/application/evening-cycle/EveningCycleApplicationService.test.ts`
- Modify: `src/application/evening-cycle/index.ts`
- Modify: `src/application/index.ts`
- Modify: `src/application/reflection/ReflectionApplicationService.ts`
- Modify: `src/application/reflection/ReflectionApplicationService.test.ts`
- Modify: `src/application/preparation/PreparationService.ts`
- Modify: `src/application/preparation/PreparationService.test.ts`
- Modify: `src/application/commands/CompleteCurrentDay.test.ts`

**Interfaces:**

- Consumes Task 1 aggregate methods and the existing `EveningCycleRepository`, `Clock`, and `cloneEveningCycle` contracts.
- Produces `SleepCheckApplicationService` methods `getStored`, `setBeforeRatings`, `setAfterRatings`, `answerQuestion`, `chooseCorrectiveAction`, `completeCorrectiveAction`, `retryQuestion`, and `complete`.

- [ ] Write failing service tests for every command, exact same-command idempotency, conflicting duplicate rejection, one CAS retry, two-miss stale error, raw persistence failure, earlier-answer preservation, corrective-action retry dedupe, refresh reads, and saved `dateKey` after midnight.
- [ ] Change the R5 continuation expectation to `SLEEP_CHECK`, and add failing regressions proving ordinary Day completion rejects `SLEEP_CHECK`, later-stage Reflection/Preparation readers accept it, and completed-day legacy recovery reaches `SHUTDOWN` without R6 facts.
- [ ] Run `npm run test:target -- src/application/evening-cycle/SleepCheckApplicationService.test.ts src/application/evening-cycle/RelaxationApplicationService.test.ts src/application/evening-cycle/EveningCycleApplicationService.test.ts src/application/reflection/ReflectionApplicationService.test.ts src/application/preparation/PreparationService.test.ts src/application/commands/CompleteCurrentDay.test.ts`; expected failure is the missing service and new state handling.
- [ ] Implement the service with the existing two-attempt load → clone → mutate → `saveIfVersionMatches` loop. Reapply typed intent after a CAS miss and return scoped `sleep_check.concurrent_change` after the second miss.
- [ ] Copy `sleepCheck` in `cloneEveningCycle`; adapt only exhaustive post-stage consumers and error copy required by the new state. Do not change the repository port or create a UoW.
- [ ] Run the same target command; expected PASS.
- [ ] Request separate read-only application review for mutation boundaries, stale writes, idempotency, wrong-stage mutation, completion bypass, recovery, and midnight identity; fix findings test-first.

### Task 3: Persist full and partial R6 state additively

**Files:**

- Modify: `src/infrastructure/persistence/records/EveningCycleRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/EveningCycleRecordMapper.ts`
- Modify: `src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts` only if a regression assertion is needed to prove version/store stability.

**Interfaces:**

- Consumes Task 1 snapshot rehydration API.
- Produces optional `sleepCheck` schema-v1 record round-trip; no new store, index, or repository API.

- [ ] Add failing raw-record and repository tests for complete round-trip, after-ratings partial refresh, answer refresh, corrective-action refresh, retry refresh, completed history, malformed rating/question/action/timestamp/order rejection, and a legacy R3/R4/R5 record without `sleepCheck` mapping to `null`.
- [ ] Assert `schemaVersion === 1`, database version remains 19, and all pre-existing EveningCycle/R5 fields are equal after an R6 round-trip.
- [ ] Run `npm run test:target -- src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`; expected failure is missing record/mapper support.
- [ ] Add the optional nested record and strict `readSleepCheck` mapping. Serialize only stored facts; use `undefined → null` legacy behavior and domain rehydration for cross-field validation.
- [ ] Run the same targeted command; expected PASS.
- [ ] Request separate read-only persistence review for additive compatibility, no migration, CAS retry duplication, partial refresh, legacy fabrication, R3–R5 preservation, and malformed-data handling; fix findings test-first.

### Task 4: Wire composition and Evening Journey state resolution

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/app/ApplicationShell.test.ts`
- Modify: `src/presentation/pages/TodayPage.tsx`
- Create: `src/presentation/pages/TodayPage.test.ts`
- Modify: `src/presentation/pages/RoutinePage.tsx`
- Modify: `src/presentation/pages/RoutinePage.test.ts`
- Modify: `src/presentation/pages/EveningCommandCenter.tsx`
- Modify: `src/presentation/pages/EveningCommandCenterPresentation.ts`
- Modify: `src/presentation/pages/EveningCommandCenter.test.ts`
- Modify: `src/presentation/pages/EveningModePresentation.ts`
- Modify: `src/presentation/styles/global.css` only for existing hard-coded Evening journey column counts.
- Modify: `src/presentation/styles/evening-final-scenes.css` only for existing hard-coded Evening journey column counts.
- Modify: `src/presentation/pages/EveningE95VisualSystem.test.ts`
- Modify: `src/presentation/pages/EveningRelaxationVisual.test.ts`
- Modify: `src/test/e8/EveningModesE8.test.ts`

**Interfaces:**

- Consumes Task 2 service.
- Produces one composed `application.sleepCheck`, journey id `sleep`, label `Сон`, state mapping, availability/order, KPI/progress, and required-stage semantics.

- [ ] Add failing tests that composition constructs exactly one service from the existing Evening repository, both Today and Routine entry points pass Relaxation and Sleep Check services through, and journey ordering is Relaxation → Sleep → existing Shutdown.
- [ ] Add failing exhaustive-state tests for current, completed, and historical `SLEEP_CHECK`, mode progress, return-to-current copy, and no accidental R7 skip.
- [ ] Run `npm run test:target -- src/app/composition/createLifeOsApplication.test.ts src/app/ApplicationShell.test.ts src/presentation/pages/TodayPage.test.ts src/presentation/pages/RoutinePage.test.ts src/presentation/pages/EveningCommandCenter.test.ts src/presentation/pages/EveningE95VisualSystem.test.ts src/presentation/pages/EveningRelaxationVisual.test.ts src/test/e8/EveningModesE8.test.ts`; expected failure is missing service/state mapping or obsolete six-stage/no-R6 contracts.
- [ ] Wire the focused service and update typed presentation mappings. Keep selected history view separate from domain state and preserve the existing Shutdown label/scene.
- [ ] Update only the existing journey grid/count rules needed for seven steps, keeping page-level horizontal overflow forbidden and current state visible on mobile. Run the same target command; expected PASS.
- [ ] Request separate read-only integration review for exhaustive state consumers, service multiplicity, layer direction, navigation availability, Shutdown preservation, and R7 scope; fix findings test-first.

### Task 5: Build pure R6 presentation and the accessible rating control

**Files:**

- Create: `src/presentation/components/SubjectiveRatingScale.tsx`
- Create: `src/presentation/components/SubjectiveRatingScale.test.ts`
- Create: `src/presentation/pages/EveningSleepCheckPresentation.ts`
- Create: `src/presentation/pages/EveningSleepCheckPresentation.test.ts`
- Modify: `src/presentation/pages/EveningRelaxationPresentation.ts` only for the BEFORE-rating gate model if necessary.
- Modify: `src/presentation/pages/EveningRelaxationPresentation.test.ts` only for that model.

**Interfaces:**

- Consumes saved `EveningCycle.sleepCheck` facts.
- Produces a pure phase model for AFTER ratings, active question, corrective action, retry, summary, read-only history, and legacy history plus a controlled 1–5 radio component.

- [ ] Write failing model tests for exactly one active question, progress 1/3–3/3, inverted problematic meaning of `HOLDING_THOUGHT: YES`, fixed action mapping, one retry, negative retry readiness, summary values, history count, loading/error inputs, and legacy missing facts.
- [ ] Write failing render tests proving two labeled radio groups expose five numbered 44px-capable options with checked/selected semantics, keyboard-native inputs, visible text, disabled state, and no color-only meaning.
- [ ] Run `npm run test:target -- src/presentation/components/SubjectiveRatingScale.test.ts src/presentation/pages/EveningSleepCheckPresentation.test.ts src/presentation/pages/EveningRelaxationPresentation.test.ts`; expected failure is missing components/models.
- [ ] Implement pure presentation derivation and the focused shared control without duplicating domain rules or storing labels in the domain.
- [ ] Run the same target command; expected PASS.
- [ ] Request separate read-only presentation review for question count/order, semantics, derived state, legacy/history immutability, ARIA, keyboard, and duplicate component risk; fix findings test-first.

### Task 6: Implement BEFORE ratings and the Sleep Deep Focus scene

**Files:**

- Create: `src/presentation/pages/EveningSleepCheckScene.tsx`
- Create: `src/presentation/pages/EveningSleepCheckScene.test.ts`
- Create: `src/presentation/styles/evening-sleep-check.css`
- Create: `src/presentation/pages/EveningSleepCheckVisual.test.ts`
- Modify: `src/presentation/pages/EveningRelaxationScene.tsx`
- Modify: `src/presentation/pages/EveningRelaxationScene.test.ts`
- Modify: `src/presentation/styles/evening-relaxation.css` only for a scoped BEFORE gate hook if required.

**Interfaces:**

- Consumes Tasks 2 and 5.
- Produces the complete active R6 interaction and a BEFORE-rating gate that blocks active R5 controls until the real pair is saved.

- [ ] Add failing scene tests for loading, BEFORE saving/retry, AFTER saving/retry, exactly one question, answer saving, corrective action, capture max/label, retry, negative retry, ready summary, final CTA, stale conflict, refresh-safe `getStored`, and read-only history without mutation controls.
- [ ] Add failing visual/CSS contracts for one dominant container, graphite/night semantics, gold selection/primary, green completion only, red error only, 44px targets, 390/360 single-column reflow, no horizontal overflow, keyboard-safe capture CTA, visible focus, and reduced motion.
- [ ] Run `npm run test:target -- src/presentation/pages/EveningRelaxationScene.test.ts src/presentation/pages/EveningSleepCheckScene.test.ts src/presentation/pages/EveningSleepCheckVisual.test.ts`; expected failure is missing R6 scene/gate.
- [ ] Implement the minimal React scenes. Local state may hold ratings, answer/capture drafts, loading/saving/error, and focus refs only. Every fact save calls the application service and replaces UI from the returned cycle.
- [ ] Move focus after save to the next heading/error/summary, use `aria-live` only for bounded status changes, and disable duplicate submissions without hiding saved content.
- [ ] Run the same target command; expected PASS.
- [ ] Request a separate read-only UI review against the R6 spec, Design Rules 19/21/25/28/32/33/38, tokens, mobile order, and no multi-card questionnaire; fix findings test-first.

### Task 7: Integrate current/history scenes and refresh recovery

**Files:**

- Modify: `src/presentation/pages/EveningReviewPanel.tsx`
- Modify: `src/presentation/pages/EveningReviewPanel.test.ts`
- Modify: `src/presentation/pages/EveningCompletedHistoryScenes.tsx`
- Modify: `src/presentation/pages/EveningCompletedHistoryScenes.test.ts`
- Modify: `src/presentation/pages/EveningCompletedHistoryPresentation.ts` only if the existing history scene needs a focused R6 helper.

**Interfaces:**

- Consumes Tasks 4 and 6.
- Produces current `SLEEP_CHECK`, selected read-only Sleep history, completed history, and legacy unavailable state through the existing Evening Review controller.

- [ ] Add failing integration tests for RELAXING BEFORE gate, current SLEEP_CHECK, refresh after first answer, after corrective completion, after retry, ready summary, transition to existing Shutdown, completed R6 history, and legacy R3/R4/R5 history with no fake ratings/answers.
- [ ] Assert history shows the two rating pairs and one completed-action summary compactly, does not expose mutation controls, does not initialize the snapshot, and does not become analytics.
- [ ] Run `npm run test:target -- src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts`; expected failure is missing composed R6 branches.
- [ ] Integrate the new service/scene while preserving selected-view behavior, Shutdown/Recovery rendering, and existing R3–R5 history branches.
- [ ] Run the same target command; expected PASS.
- [ ] Request separate read-only integration/history review for refresh, history immutability, legacy facts, scene exclusivity, existing Shutdown behavior, and error preservation; fix findings test-first.

### Task 8: Targeted browser flow, verification, and final review

**Files:**

- Create: `tests/e2e/evening-sleep-check.acceptance.spec.ts`
- Modify: `tests/e2e/evening-relaxation.acceptance.spec.ts` only to replace obsolete “no R6” assertions with the approved transition contract.
- Modify: `docs/design/features/2026-08-30-r6-sleep-check-stage.md` only after evidence is current.

**Interfaces:**

- Consumes the integrated R6 flow.
- Produces current-tree test, browser, accessibility, Rule 38, console, and quality-gate evidence.

- [ ] Write the targeted Playwright spec first for one desktop positive flow and one 390×844 corrective-action/refresh flow. Cover BEFORE/AFTER ratings, three questions, `HOLDING_THOUGHT: YES`, capture, retry, summary, final CTA, and existing Shutdown.
- [ ] Run only `npm run test:e2e -- tests/e2e/evening-sleep-check.acceptance.spec.ts`; expected initial failure must identify the first missing browser contract. Do not run the complete suite.
- [ ] Fix only concrete R6 integration or selector/accessibility defects with the smallest production change and a matching unit/render regression where possible.
- [ ] Run the complete targeted R6 unit/integration set: `npm run test:target -- src/domain/evening-cycle/SleepCheckSnapshot.test.ts src/domain/evening-cycle/EveningCycle.test.ts src/application/evening-cycle/SleepCheckApplicationService.test.ts src/application/evening-cycle/RelaxationApplicationService.test.ts src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts src/presentation/components/SubjectiveRatingScale.test.ts src/presentation/pages/EveningSleepCheckPresentation.test.ts src/presentation/pages/EveningSleepCheckScene.test.ts src/presentation/pages/EveningSleepCheckVisual.test.ts src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts`; expected PASS.
- [ ] Re-run only `npm run test:e2e -- tests/e2e/evening-sleep-check.acceptance.spec.ts`; expected PASS at desktop and 390×844. Manually inspect 360×800 and 1280×720 using the same scenario if the targeted spec does not encode them.
- [ ] Check keyboard order, focus restoration, screen-reader labels, selected rating semantics, progress, 44px targets, capture keyboard visibility, reduced motion, monochrome meaning, horizontal overflow, loading/error/saving/ready/history, and browser console/page errors.
- [ ] Run `npm run verify` once on the final current tree; record exit code, duration, test counts, warnings, and any failure exactly. Do not run the full E2E suite automatically.
- [ ] Run `git diff --check`, `git diff --stat`, `git diff --name-status`, inspect the final scoped diff, and run `git status --short`. Preserve and report unrelated pre-existing changes.
- [ ] Request a final independent read-only review of the complete R6 diff against the spec, architecture direction, persistence/legacy, accessibility, verification evidence, scope, and R7 exclusion. Fix load-bearing findings test-first and re-run affected checks.
- [ ] Only after fresh evidence passes, update the R6 DoD/evidence without marking visual `APPROVED` or `LOCKED`, and report exactly `R6 COMPLETE — WAITING FOR USER APPROVAL.`
