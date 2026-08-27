# WALK-13 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. The main agent alone
> writes in the user-selected workspace; no staging or commits.

**Goal:** Explainable deterministic Walk observations and one optional recommendation.

**Architecture:** Extend WALK-12's ephemeral projection with evidence from a pure insight
engine. A read-only query and pure policy select the Center suggestion. UI preserves existing
commands, source launches and the one-primary-action hierarchy.

**Tech Stack:** Existing TypeScript, React, Vitest, IndexedDB adapters and Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-walk-13-insights-design.md`

## Global constraints

- Work only in `D:\LifeOS-App`; WALK-01–12 are a protected dirty baseline.
- No staging, commit, push, new dependency, persistence or WALK-14.
- Read-only queries; no AI, fake probabilities, causal/medical/optimality copy.
- Confidence <3 none, 3–7 preliminary, >=8 stable with noncausal caveat.
- All creation and mutations remain behind existing explicitly invoked commands.

## Task 1 — Evidence and deterministic policy

Files: add `src/application/walk/WalkInsights.ts`, `WalkInsightEngine.ts`,
`WalkInsightEngine.test.ts`, `WalkRecommendationPolicy.ts`, `WalkRecommendationPolicy.test.ts`.
Extend `GetWalkAnalytics.ts`, `WalkAnalytics.ts`, existing analytics query tests and presentation.
Add `src/application/queries/GetWalkRecommendation.ts` and exports/composition wiring.

Interfaces: `buildWalkInsights(observations): readonly WalkInsight[]`;
`selectWalkRecommendation(analytics, currentState): WalkRecommendation | null`;
`GetWalkRecommendation.execute(currentState = null)` returns the selected suggestion or null.
Each observation contains intent, durationMilliseconds, startedAt and beforeState/afterState.
Each insight contains kind, intent, metric, optional segment and evidence with paired samples.

- [x] RED: pure engine tests use controlled observation DTOs, actual paired deltas and literal
      expected counts. Query regression asserts new derived insights on completed-only data.

```ts
expect(buildWalkInsights(recoveryPairs(2))).toEqual([]);
expect(buildWalkInsights(recoveryPairs(8))[0]?.evidence).toMatchObject({
  sampleSize: 8,
  confidenceLevel: 'stable',
  averageDelta: -2,
  improvedCount: 8,
});
```

- [x] Run `npm run test -- src/application/walk/WalkInsightEngine.test.ts` and observe missing
      behavior fail before production code.
- [x] GREEN: implement shared confidence, buckets, paired cohorts, favorable gates, deterministic
      comparisons and immutable evidence. Reuse existing completed selection/duration getter.
- [x] RED policy: contextual recovery outranks stronger reflection only with explicit current
      high tension and >=3 similar pairs; missing state must select historical evidence or null.
- [x] GREEN: fixed sorting, default 30 minutes and source evidence; no command dependencies.
- [x] Extend real IndexedDB composition test: query result exists and records/reentry survive
      unchanged across queries and reopen; wire service via existing composition.
- [x] Run engine/policy/analytics/composition tests and typecheck.

## Task 2 — Center and Analytics UI

Files: new `src/presentation/walk/WalkRecommendationPanel.tsx`,
`WalkInsightsPresentation.ts`, `WalkInsightsPanel.tsx`; extend `WalkSessionFlow.tsx`,
`WalksPage.tsx`, `WalkAnalyticsScreen.tsx`, `ApplicationShell.tsx`, local CSS and existing tests.

Interfaces: Center uses read-only recommendation query and callback to select intent;
currentState is a `WalkStateSnapshot | null` draft owned by WalksPage, with controlled optional
input in Center/preparation. Recommendation does not set an enabled state from default sliders.

- [x] RED: extend rendered Center tests to require one main CTA, Why disclosure, evidence,
      neutral ordinary choices and Analytics maximum four observations.

```ts
expect(html).toContain('Почему LifeOS это предлагает?');
expect(html).toContain('Предварительное наблюдение');
expect((html.match(/class="primary-button/g) ?? []).length).toBe(1);
```

- [x] GREEN: mount query only in idle Center; preserve source launch/reentry behavior; optional
      draft controls, ordinary selection, evidence disclosure and retry. No UI business rules.
- [x] Add scoped styles with existing tokens, 44px controls and stacked narrow layout.
- [x] Run presentation tests, neighboring Walk tests, typecheck and lint.

## Task 3 — Browser behavior, preservation and final gate

Files: add `tests/e2e/walk13.insights.spec.ts`; reuse existing fixture construction and isolated
Playwright profiles. No test hooks in product code and no mutation of live browser user data.

- [x] RED before UI implementation: browser test asserts evidence and one CTA on a seeded Center,
      no write on Why, current-state context and explicit recommended start/alternate choice.
- [x] GREEN after UI: desktop/mobile scenarios, 360/390/430, low data, error/retry and Insights.
- [x] Compare persisted stores before/after viewing, explanation and navigation. Assert no Walk
      creation until preparation submit, and explicit current-state transfer to beforeState.
- [x] Save and inspect Center/Why/Insights/low-data/mobile screenshots in ignored test output.
- [x] Run WALK-08–12 neighboring unit/integration and browser regressions, then typecheck, lint,
      all tests, alpha, complete Playwright smoke, build and format check.
- [x] Review only WALK-13 delta against the saved baseline; run both Git diff checks and status.
- [ ] Deliver user's requested sectioned report; stop. No WALK-14 and no Git-write operations.

## Verification evidence — 2026-08-26

- RED then GREEN observed for engine, policy, composition, presentation and browser behavior.
- Final sequential `npm run test`: 255 files, 2161 tests passed (92.80s).
- `npm run test:alpha`: 1 passed. Typecheck, lint, build and format check passed.
- Final sequential `npm run test:e2e`: 85 passed, 17 project-specific skips (7.1m).
  WALK-13 contributes 15 passed scenarios; desktop and mobile 360/390/430 are covered.
- Earlier concurrent build/Vitest runs exhausted memory; these were not counted as passing.
  All heavy gates were rerun sequentially without timeout, retry or heap-limit changes.
- E2E caught a neutral Center height regression (506.625px against the existing 500px limit).
  Only the scoped CTA top margin changed; the unchanged desktop/mobile regression passed
  separately (6/6) and in the final full suite.
- Read-only review found no remaining architecture/state/scope defects. Cohort wording was
  clarified; third-cohort comparison and period-switch sample loss received extra coverage.
- Screenshots were inspected and retained in ignored `node_modules/.cache/walk13/evidence`:
  Center, Why, Analytics, low data and mobile 360/390/430. No videos.
- Limits: browser QA uses synthetic isolated data and desktop Chrome/mobile emulation,
  not physical phones. Embedded reference images were inspected; DOCX page rendering was
  unavailable because soffice is absent. A separately delayed-response race test was not added;
  context isolation is enforced by component keys and covered by error/retry behavior and review.
- WALK-13 delta: 26 files (18 product, 6 tests, 2 documents), 14 new; no deletions.
  Baseline and Git index are preserved. No staging, commit, push, persistence or WALK-14 changes.
