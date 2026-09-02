# Evening Ritual v2 R12 Final Regression Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. This R12 run is executed inline by the primary agent; no subagent may edit the shared worktree.

**Goal:** Produce fresh release-candidate evidence for the complete Evening Ritual v2 journey, repair only confirmed regressions through red-green tests, and issue a strict READY/NOT READY verdict.

**Architecture:** `EveningCycle` remains the authoritative domain aggregate. UI actions flow through presentation models and application services; IndexedDB repositories and mappers persist the additive v2 snapshots. R12 does not add features, redesign screens, bump the database schema, or rewrite legacy records.

**Tech Stack:** TypeScript, React, Vitest, fake-indexeddb, Playwright, Vite, IndexedDB.

**Spec:** User-provided R12 acceptance matrix plus `docs/design/features/2026-08-31-r7-short-skip-modes.md`, `docs/design/features/2026-08-31-r9-evening-ritual-backward-compatibility.md`, `docs/codex/TEST_MATRIX.md`, and `docs/codex/UI_RULES.md`.

## Global Constraints

- Scope is final regression only: no new functions and no redesign.
- Preserve all existing user/uncommitted changes and do not commit, push, or use destructive Git.
- Every confirmed defect follows reproduce → failing regression test → minimal owning-layer fix → targeted regression.
- R12 requires fresh `npm run verify` and `npm run test:e2e`; a timeout or unavailable browser check is not a pass.
- The final report uses `Область | Статус | Дефект | Исправление | Regression test` and ends with the exact R12 waiting marker.

---

### Task 1: Establish the candidate and evidence map

**Files:**

- Read: `AGENTS.md`
- Read: `docs/codex/TEST_MATRIX.md`
- Read: `docs/codex/UI_RULES.md`
- Read: current Evening domain/application/persistence/presentation tests

**Interfaces:**

- Consumes: the current dirty worktree as the sole release candidate.
- Produces: a scenario-to-test map and a list of evidence gaps.

- [ ] Confirm `git rev-parse --show-toplevel`, branch/worktree state, `git status --short`, `git diff --stat`, `git diff --name-status`, and `git diff --check`.
- [ ] Map NORMAL, unresolved Decision/LifeAction, carry-forward, adaptive Reflection, Environment core/skip, Relaxation, Sleep Check, SHORT_CAPTURE, QUICK/SKIPPED, refresh/midnight/idempotency/failures, history, migration, and analytics to named tests.
- [ ] Confirm port `127.0.0.1:4173` is free without terminating its owner.

### Task 2: Run the focused contract regressions

**Files:**

- Test: `src/domain/evening-cycle/EveningCycle.test.ts`
- Test: `src/application/evening-cycle/EveningCycleApplicationService.test.ts`
- Test: `src/application/reflection/ReflectionApplicationService.test.ts`
- Test: `src/application/preparation/PreparationService.test.ts`
- Test: `src/application/evening-cycle/RelaxationApplicationService.test.ts`
- Test: `src/application/evening-cycle/SleepCheckApplicationService.test.ts`
- Test: `src/application/commands/CompleteCurrentDay.test.ts`
- Test: `src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts`
- Test: `src/infrastructure/persistence/EveningRitualV2Compatibility.test.ts`
- Test: `src/application/queries/GetEveningHistory.test.ts`
- Test: `src/application/queries/GetEveningAnalytics.test.ts`
- Test: `src/application/queries/DetectEveningPatterns.test.ts`
- Test: `src/test/e8/EveningModesE8.test.ts`
- Test: `src/test/alpha/AlphaCycleGate.test.ts`

**Interfaces:**

- Consumes: existing public domain/application/persistence contracts.
- Produces: fresh bounded evidence for every non-visual R12 branch.

- [ ] Run one canonical `npm run test:target -- <all listed selectors>` invocation and record exit code, duration, test-file count, and test count.
- [ ] If a target fails, isolate the first failure with one-file `npm run test:target -- <file>` and enter Task 3 before continuing.
- [ ] Run `npm run test:fast` only if a fix touches a shared domain/application invariant.

### Task 3: Repair each confirmed defect with TDD

**Files:**

- Test: the closest existing `*.test.ts`/`*.test.tsx` contract at the failing layer.
- Modify: only the production owner of the confirmed invariant.

**Interfaces:**

- Consumes: a consistently reproduced failure and a falsifiable root-cause hypothesis.
- Produces: one minimal repair plus red-green evidence and neighboring checks.

- [ ] Capture the exact command, expected result, actual result, frequency, stack/error, and data/state path.
- [ ] Trace the defect through UI → Presentation → Application → Domain → Infrastructure and identify the owning layer.
- [ ] Add the smallest regression test and run it before the fix; it must fail for the expected behavioral reason.
- [ ] Apply one minimal production change with no unrelated refactor or timeout/retry weakening.
- [ ] Re-run the regression test to green, then run the neighboring test file(s).
- [ ] Return to Task 2 for any remaining focused regressions.

### Task 4: Run browser E2E and responsive/accessibility QA

**Files:**

- Test: `tests/e2e/evening-relaxation.acceptance.spec.ts`
- Test: `tests/e2e/evening-sleep-check.acceptance.spec.ts`
- Read: applicable Evening presentation components and CSS.

**Interfaces:**

- Consumes: the built application and real IndexedDB-backed browser flow.
- Produces: runtime, persistence, responsive, keyboard/focus, accessibility, and console evidence.

- [ ] Run `npm run test:e2e:list` to record the exact current suite.
- [ ] Run the managed `npm run test:e2e` once with its heartbeat/deadline; on failure isolate only the first failing scenario.
- [ ] Start one owned local dev server solely for manual QA and stop that exact process afterward.
- [ ] Traverse the available Evening route through NORMAL completion and Recovery, refreshing each key stage; separately exercise QUICK and conscious SKIPPED where the current UI exposes them.
- [ ] Inspect 1600×900, 1440×900, 1280×720, 1024×768, 390×844, and 360×800 for horizontal overflow, hierarchy, CTA reachability, and ≥44 px touch targets.
- [ ] Check keyboard order, focus-visible, accessible names, reduced motion, page/console errors, and obvious duplicate listeners/timers/subscriptions.
- [ ] If an acceptance branch cannot be exercised, record it as unconfirmed/manual QA or a release blocker; do not infer a pass from static code.

### Task 5: Execute the final release gate and issue the verdict

**Files:**

- Read: final worktree diff and all evidence produced by Tasks 1–4.

**Interfaces:**

- Consumes: stabilized current tree with no unresolved defect.
- Produces: the required R12 report and exact READY/NOT READY status.

- [ ] Run fresh `npm run verify` once and record every stage, exit code, duration, and failure count.
- [ ] Run final `git diff --check`, `git diff --stat`, `git diff --name-status`, and `git status --short`.
- [ ] Re-read the final diff for architecture, persistence, user-data, accessibility, performance, and scope regressions.
- [ ] Map each R12 criterion to direct fresh evidence and report migration compatibility, manual visual QA, known limitations, and release blockers.
- [ ] Print `READY FOR EVENING RITUAL V2 RELEASE CANDIDATE` only if every required gate and criterion is confirmed; otherwise print `NOT READY` with blockers.
- [ ] End with `R12 COMPLETE — WAITING FOR USER APPROVAL.` and stop.
