# WALK-09 Decision Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The root is the sole writer; subagents audit/review read-only.

**Goal:** Add a safe Decision → reflection Walk → Outcome → Reentry → original Decision flow.

**Architecture:** Reuse Walk and its persisted link/return contracts. A thin application
command delegates existing Walk commands; a read-only query projects the latest linked
Walk. Shared Decision UI and existing Shell selection perform navigation without Decision writes.

**Tech Stack:** Existing TypeScript, React, IndexedDB, Vitest and Playwright; no dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-walk-09-decision-integration-design.md`

## Global Constraints

- Work only in `D:\LifeOS-App`; preserve the staged/unstaged/untracked WALK-01–08 baseline.
- No commit/push, WALK-10, Decision automatic mutations, new aggregate or migration.
- Reflection is `intent = reflection`; keep existing timer/stopwatch `mode` contract.
- User explicitly authorizes TDD after the audit/design; execute inline without another approval gate.
- Do not run full `npm run test` automatically. Root is the sole writer.

### Task 1: Application contracts and persistence safety

**Files:** Create `src/application/commands/StartDecisionWalk.ts`,
`src/application/queries/GetLatestWalkOutcomeForDecision.ts`,
`src/app/composition/DecisionWalkComposition.integration.test.ts`.
Modify `src/application/index.ts`, `src/app/composition/LifeOsApplication.ts`,
`src/app/composition/createLifeOsApplication.ts`, `src/application/walk/WalkReentryPolicy.ts`
and its test.

**Interfaces:** `StartDecisionWalk.execute({decisionId, timerTargetMinutes, reflectionQuestion?,
reflectionTemplate?, beforeState?}): Promise<Result<Walk, DomainError>>`;
`GetLatestWalkOutcomeForDecision.execute(decisionId: EntityId): Promise<Walk | null>`.

- [x] RED: composition exposes a launch returning reflection intent, exact link/context,
      current date and preserved custom question; full Decision record stays equal through finish,
      outcome, Reentry and two reopen cycles. Missing/deleted sources and existing paused/running
      Walk create no second active Walk. Query ignores unrelated/unfinished Walks and orders by outcome.

```ts
expect(application.startDecisionWalk).toBeDefined();
const result = await application.startDecisionWalk.execute({ decisionId, timerTargetMinutes: 30 });
expect(result).toMatchObject({ ok: true, value: { intent: 'reflection' } });
expect(DecisionRecordMapper.toRecord(await readDecision())).toEqual(before);
```

- [x] Run `npm run test -- src/app/composition/DecisionWalkComposition.integration.test.ts src/application/walk/WalkReentryPolicy.test.ts`; observe assertion failures.
- [x] GREEN: validate source via GetDecisionById; precheck GetActiveWalk; delegate CreateWalk/StartWalk with existing link/context/template. Query Walks read-only. Scope policy branch to Decision-origin context before generic worse handling.
- [x] Rerun these tests plus existing Walk/Routine composition tests.

### Task 2: Existing UI and precise navigation

**Files:** Create `src/presentation/decision/DecisionWalkNavigation.ts`,
`src/presentation/decision/DecisionWalkSection.tsx`, and corresponding tests.
Modify `src/presentation/components/DecisionDetailsPanel.tsx`, `DecisionDetailsController.tsx`,
`src/presentation/pages/TodayPage.tsx`, `DecisionsPage.tsx`, `WalksPage.tsx`,
`src/presentation/walk/WalkSessionFlow.tsx`, `WalkReentryFlow.ts`, `WalkCompletionFlow.tsx`,
`src/app/ApplicationShell.tsx`, `src/presentation/styles/global.css`.

**Interfaces:** `DecisionWalkLaunchRequest {decisionId: EntityId, title: string}`;
`DecisionWalkIntegration {getLatestOutcome, onStart(decision: Decision): void}`;
`loadDecisionWalkContext(walk, getDecisionById)` yields ready/unavailable/not-linked for display
and exact navigation. `selectWalkSessionEntry` adds Decision preparation after active/pending priority.

- [x] RED: static rendering of preparation/active shows linked title; session entry selects
      Decision reflection preparation without overriding active/pending. E2E starts from the real
      shared Decision card, then checks the return card and saved result.

```ts
expect(markup).toContain('Связано с решением');
await expect(page.getByRole('button', { name: 'Обдумать на прогулке' })).toBeVisible();
await expect(page.getByRole('dialog', { name: decisionTitle })).toBeVisible();
```

- [x] GREEN: one shared compact section (secondary button + query-backed outcome), reused by
      Today and Decisions. Existing preparation gets a Decision context; active gets live query title.
      Reentry checks availability and routes the persisted return id through initialDecisionId.
      Missing/read failures display fallback; draft/current-date selection and rejection are safe.
- [x] Rerun presentation tests and focused WALK-09 Playwright test.

### Task 3: Edge/regression and visual verification

**Files:** Create `tests/e2e/walk09.decision.spec.ts`; extend only scoped tests if required.

- [x] Verify custom/default question, blank and worse outcome, missing source, reload active/pending,
      duplicate paused/running, original Decision rescheduled, exact id not title matching.
- [x] Run scoped Decision/Walk/Routine/persistence tests; no full-suite substitute or timeout bump.
- [x] Run Playwright WALK-09 desktop/mobile and existing ordinary/free/reflection/Routine smoke.
      Capture screenshots with `testInfo.outputPath`; use isolated contexts, no user database changes.
- [x] Inspect real Browser desktop/mobile, keyboard/focus, 44px actions, no overflow/bottom-nav
      overlap or console errors. Compare with initial shared panel and UI_RULES tokens.

### Task 4: Review and handoff

- [x] Read-only independent architecture/test review. Fix findings with a failing regression first.
- [x] Fresh typecheck, lint, build, scoped tests, E2E, changed-file format check and `git diff --check`.
- [x] Compare initial/final hashes of untouched files and index; inspect WALK-09 diff and status.
- [x] Report the user's 12 requested sections, RED/GREEN counts, screenshot links and limitations.
      WALK-10 stays unstarted; old C: worktrees untouched; no commit/push. Stop.

## Completion evidence — 2026-08-26

- Application/presentation/policy TDD: the initial feature checks produced 12 expected
  assertion failures before implementation. The final focused set is 4 files / 37 passing tests.
- Browser TDD first failed on the missing Decision launch action. Subsequent regressions
  covered reopening a closed Decision after date navigation and generic versus Decision-origin
  Reentry routing before their fixes.
- Final focus regression: the keyboard-launched preparation heading had the native outline
  color instead of LifeOS gold. The failing browser assertion was followed by one selector
  added to the existing shared focus rule; focus itself was retained. Preparation, active,
  completion and Reentry now assert the focused heading and gold 2px outline with 2px offset.
  Pointer transitions were changed to keyboard activation in the keyboard-specific test path;
  this does not claim a complete sequential Tab-order audit.
- Scoped business regression, before the final focus-only CSS adjustment: 91 files / 889 tests
  passed. This includes Decision, Walk, Routine, Today/navigation, startup, persistence and alpha.
- Combined browser regression: 17 passed / 3 intentionally skipped, including WALK-09 and
  existing ordinary/free/reflection/Routine flows. After the focus adjustment, the desktop
  regression passed, followed by 4 passing full-flow runs at desktop and 360/390/430px mobile;
  2 desktop-only duplicates of the additional mobile widths were intentionally skipped.
- Typecheck and production build passed again after the final focus change. Repository lint
  passed during the implementation gate; the subsequently changed E2E file passed ESLint again.
- Exact persisted Decision records are compared before and after the flow and reopen cycles,
  including version and nonempty actual-result/evidence data. Explicit user status/date changes
  remain intact. Walk completion creates no Action, work session or Routine execution.

### Reproduction commands

```powershell
npm.cmd run test -- src/app/composition/DecisionWalkComposition.integration.test.ts src/app/composition/DecisionWalkNavigation.integration.test.ts src/presentation/walk/DecisionWalkPresentation.test.ts src/application/walk/WalkReentryPolicy.test.ts
npm.cmd run test -- Decision Walk Routine Today applicationShellNavigation ApplicationStartup LifeOsIndexedDb src/infrastructure/persistence/mappers src/test/alpha/AlphaCycleGate.test.ts
npm.cmd run typecheck
npm.cmd run build
npm.cmd run format:check
git diff --check
```

Browser QA used a separately owned Vite server at `127.0.0.1:4174` and an ignored Playwright
config under `node_modules/.cache` with `webServer` disabled. This avoided the observed Windows
Playwright-owned server teardown hang; no product config, timeout or dependency was changed.
Final focused command:

```powershell
npm.cmd run test:e2e -- --config node_modules/.cache/walk09.playwright.config.mjs tests/e2e/walk09.decision.spec.ts --grep "complete Decision return" --output=test-results/walk09-final
```

Screenshots are in the ignored `test-results/walk09-final` directory (six stages per viewport).
The missing-Decision fallback and earlier combined regression evidence are in `test-results/walk09`.
Browser checks use isolated synthetic data. No new console/page errors were observed; the
existing unrelated missing `favicon.ico` console error is excluded, matching the existing smoke.

### Safety and limitations

- Initial baseline: 910 files. 895 remain byte-identical; 15 changed files and 10 new files are
  confined to WALK-09 (18 product files, 5 test files and 2 design/plan files). No baseline file
  is missing. Git index and HEAD are unchanged; existing staged WALK-01–08 work is preserved.
- The existing StartWalk compare-and-swap guard prevents a second active Walk. A simultaneous
  CreateWalk/StartWalk race may leave the losing Walk planned; no engine rewrite or cleanup
  behavior was added. The concurrency integration test explicitly covers this contract.
- The full unfiltered test suite was not run. Visual checks use the established LifeOS UI and
  UI_RULES, not an unavailable approved Figma node. Mobile coverage is browser emulation,
  not a physical-device or assistive-technology certification.
- No schema migration, new aggregate, dependency, automatic Decision mutation or Action creation.
  WALK-10 was not started. Old C: worktrees were not used or changed. No commit or push.
