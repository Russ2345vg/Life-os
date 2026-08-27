# WALK-12 Analytics v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline
> execution. AGENTS.md reserves all file writes for the main agent; subagents review read-only.
> Steps use checkboxes. User approval covers the minimal design recorded below.

**Goal:** Provide honest read-only 7/30-day analytics for completed Walks and their saved outcomes.

**Architecture:** One application projection over existing Walk/Capture ports. Share period and
basic statistics with GetWalkStatistics. Add a Walks sub-screen and minimal optional initial
History intent, without changing Domain, storage, global navigation or lifecycle commands.

**Tech Stack:** Existing TypeScript, React, CSS, Vitest/fake-indexeddb and Playwright only.

**Spec:** `docs/superpowers/specs/2026-08-26-walk-12-analytics-design.md`

## Global Constraints

- Only `D:\LifeOS-App`; preserve WALK-01–11 baseline (961 nonignored files, 148 status rows).
- No staging, commit, push, new worktree, package change, analytics database or WalkAnalyticsRecord.
- No WALK-13 recommendations/AI/forecasts/causality/GPS/maps/weather; no user-data mutation.
- Default 30 days, alternative 7; inclusive Walk.date boundaries ending at CurrentDateProvider.
- Paired metric samples only, no zero substitution; 1–2 facts, 3–7 preliminary, 8+ stable category.
- Exact empty copy and canonical start CTA; processed captures count as saved thoughts.
- Reuse Concept B visual language, 44px touch controls, mobile 360/390/430 without overflow.

---

## File structure

Create application `walk/WalkStatisticsCalculation.ts` (shared pure projection),
`walk/WalkAnalytics.ts` (readonly types and pure state aggregation),
`queries/GetWalkAnalytics.ts` (port orchestration) and focused tests.
Modify `GetWalkStatistics.ts` only to delegate its existing calculation; keep its exports/API.
Wire the query in `application/index.ts`, `LifeOsApplication.ts`, `createLifeOsApplication.ts`
and `ApplicationShell.tsx`.
Create presentation `WalkAnalyticsPresentation.ts`, `WalkAnalyticsScreen.tsx` and focused tests;
modify WalksPage navigation, add optional History initialFilter, and append scoped CSS.
Create composition integration and `tests/e2e/walk12.analytics.spec.ts` coverage.

### Task 1: Read-only application analytics

**Files:** Create the application files above and `GetWalkAnalytics.test.ts`; modify the old
statistics query. Test with real rehydrated Walks and existing in-memory repositories.

**Interfaces:**

```ts
type WalkAnalyticsPeriod = 'last7Days' | 'last30Days';
interface WalkAnalyticsMetric {
  readonly sampleSize: number;
  readonly averageBefore: number | null;
  readonly averageAfter: number | null;
  readonly averageDelta: number | null;
}
// GetWalkAnalytics receives findAll, CurrentDateProvider and findByWalkId ports.
// execute(period = 'last30Days') returns range, completedCount, daysWithWalks,
// total/averageDurationMilliseconds, state, byIntent, unclassifiedCount,
// impactCounts, withTextResultCount, withCapturesCount, captureCount and days.
```

- [x] Write contract tests with hand-derived expected values, including:

```ts
const result = await query.execute('last7Days');
expect(result.completedCount).toBe(3);
expect(result.totalDurationMilliseconds).toBe(3600000);
expect(result.averageDurationMilliseconds).toBe(1200000);
expect(result.state.energy).toEqual({
  sampleSize: 2,
  averageBefore: 3,
  averageAfter: 5,
  averageDelta: 2,
});
```

- [x] Verify RED via `npm.cmd run test -- GetWalkAnalytics --maxWorkers=1 --reporter=verbose`.
      The missing exported query must cause the explicit feature-existence assertion to fail.
- [x] Implement one shared statistics calculation from the existing query, plus the new readonly
      reducer/orchestrator. Read captures only for selected completed Walks; propagate read errors.

```ts
const projection = calculateWalkStatistics(await walks.findAll(), period, dates.getCurrentDate());
const capturesByWalk = await Promise.all(
  projection.completed.map((walk) => captures.findByWalkId(walk.id)),
);
```

- [x] Verify GREEN for new query and existing GetWalkStatistics/History tests; confirm parity
      for both periods, pause-adjusted duration, future exclusion and valid zero values.

### Task 2: Composition and persisted readonly contract

**Files:** application exports, composition interface/root, new
`src/app/composition/WalkAnalyticsComposition.integration.test.ts`.

**Interfaces:** `LifeOsApplication.getWalkAnalytics: GetWalkAnalytics`; existing constructor
injects Walk/Capture repositories and currentDateProvider, with no adapter or schema changes.

- [x] Add an integration test which calls the composed query, changes its period, closes/reopens
      IndexedDB, and compares saved Walk version/outcome/Reentry and captures to the originals.

```ts
expect(application.getWalkAnalytics).toBeDefined();
const before = await application.walkRepository.findAll();
await application.getWalkAnalytics.execute('last30Days');
await application.getWalkAnalytics.execute('last7Days');
expect(await application.walkRepository.findAll()).toEqual(before);
```

- [x] Run RED for the missing composition member; wire query and run GREEN, including
      WalkHistoryComposition/RoutineWalkComposition/DecisionWalkComposition/WalkCaptureComposition.

### Task 3: Analytics presentation and navigation

**Files:** new presentation model/screen/tests; WalksPage, WalkHistoryScreen, ApplicationShell,
scoped global.css and relevant existing page/history tests.

**Interfaces:** `WalkAnalyticsScreen` receives `getWalkAnalytics`, `onBack`, `onStart`,
`onOpenHistory(intent?)`; the pure content view receives a WalkAnalytics result.
`WalkHistoryScreen.initialFilter?: WalkHistoryFilter` defaults to all.

- [x] Write sample-wording/formatting and rendered-markup tests before production components:

```ts
expect(walkAnalyticsObservation(2)).toBeNull();
expect(walkAnalyticsObservation(3)).toContain('Предварительное наблюдение');
expect(walkAnalyticsObservation(8)).toContain('Наблюдается устойчивая закономерность');
expect(emptyMarkup).toContain('Недостаточно данных для аналитики.');
expect(emptyMarkup).toContain('Начать прогулку');
```

- [x] Verify RED then implement explicit loading/error/empty/populated states, default 30/7
      switch, four KPIs, state sample rows, mode counts/duration/state (from 3 pairs), daily bars and
      outcome/thought facts. Use existing query-loading/focus patterns, not direct browser storage.
- [x] Wire presentation-only sub-screen navigation. Preserve active/completion/Reentry flows;
      add optional initial History intent and label its all-time scope. Restore heading/button focus.
- [x] Verify GREEN with presentation/page/History tests and typecheck before browser work.

### Task 4: Browser acceptance and isolated fixtures

**Files:** new `tests/e2e/walk12.analytics.spec.ts`; ignored QA config/screenshots only.

- [x] Add desktop/mobile tests using real Walk mapper records in isolated test browser contexts.
      With 9 paired walks, assert stable category; with 3–7 preliminary; with 1–2 no interpretation.
      Verify 30→7 KPI/day chart changes and mode-to-History navigation. Include empty/error/retry.
- [x] Run new browser tests RED against missing navigation before the UI wiring, or retain the
      initial RED from Task 3 for the screen and add each navigation assertion before its wiring.
- [x] Check immutable persisted records across queries, period changes and History navigation;
      capture no console/page errors. At 360/390/430 assert geometry, >=44px targets and scrollability.
- [x] Run GREEN and save desktop/7-day/low-data/mobile screenshots. Inspect the images against
      Concept B and refine only demonstrated gaps. Do not seed or change the user's browser data.

### Task 5: Regression and handoff

- [x] Run `npm.cmd run test -- Walk GetHistoryForDateRange --maxWorkers=1 --reporter=verbose`.
- [x] Run typecheck, lint, all one-shot Vitest (`--maxWorkers=1`), alpha, build and format:check.
- [x] Run full Playwright desktop/mobile with one owned local server and video disabled.
      Keep the existing config behavior; a temporary ignored config may omit automatic webServer
      lifecycle to avoid the diagnosed Windows teardown issue. Stop only the verified owned process.
- [x] Inspect screenshots/focus/console; have read-only architecture/test/UI/final reviewers
      inspect the applicable evidence while the main agent alone resolves concrete findings.
- [x] Re-read task diff, run working-tree/staged diff checks and git status; compare baseline
      hashes/index to prove unrelated W01–11 files are preserved. Record exact results below.
- [x] Prepare the user's 13-section handoff; deliver it in the final response and stop. No WALK-13 or Git writes.

## Evidence log

Baseline before edits: 69 tests / 5 files passed; build passed; dependencies available;
working-tree and staged diff checks passed; all 961 file hashes and index unchanged.
Execution results are recorded here as each checked task completes.

### Implementation and targeted evidence

- Query: 31 RED assertions before implementation, then 31 GREEN; combined statistics/History
  query regression: 50 passed in 3 files. The old statistics API/default/allTime/type buckets remain.
- Composition: 4 RED before wiring, then 4 GREEN; related Walk/History/Routine/Decision/Capture
  composition regression: 52 passed. Persisted records, version and pending Reentry remain equal.
- Presentation: 28 new RED assertions plus 12 existing passes, then 40 GREEN. A later neutral
  lead-in refinement separately produced 2 RED then GREEN; low samples never display a pattern.
- Browser navigation: 2 initial RED then GREEN. Extended browser checks found a real StrictMode
  focus replay: the remounted session heading stole focus after the parent restoration. Existing
  active-return assertions and 2 new idle-center regressions were RED; a cancellable animation
  frame in the new parent effect restores focus after child mount effects. Lifecycle panels stay
  unchanged. Manual browser also confirmed the restored button focus and empty warning/error log.
- Focused browser acceptance: 18 passed, 4 intentional project-only skips, 1.7 minutes.
  Includes period facts, paired samples, read failures/retry, immutable seven-store snapshots,
  canonical start with active-Walk precedence, History intent/back navigation, 360/390/430 widths,
  44px controls and footer focus above fixed mobile navigation. Video remains disabled.
- Visual comparison: original embedded Concept B and desktop/7-day/low-data/mobile screenshots
  inspected. An additional 1024px capture revealed the single-word count label shrinking; its
  one-line regression was RED, then GREEN (1 test, 5.7 seconds) after a scoped flex-shrink rule.
- Targeted Walk/History regression: 471 passed in 44 files, 42.97 seconds, exit 0. This covers
  start/pause/resume, completion/Reentry, Routine/Decision/Capture/History and persistence.
- Lint caught an infrastructure import in the new query test; replaced with a read-only port
  fixture rather than weakening the rule. Targeted ESLint and all 31 query cases passed.

### Full gate — 2026-08-26

| Check                | Result                                                            | Evidence / duration                                                         |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| TypeScript           | exit 0                                                            | `npm.cmd run typecheck`; 20.61 s                                            |
| ESLint               | exit 0                                                            | `npm.cmd run lint`; 29.79 s                                                 |
| Full one-shot Vitest | 2116 passed, 252 files; exit 0                                    | `--maxWorkers=1 --reporter=verbose --reporter=json`; 191.39 s including npm |
| Alpha                | 1 passed; exit 0                                                  | `npm.cmd run test:alpha -- --maxWorkers=1 --reporter=verbose`; 6.53 s       |
| Full browser smoke   | 70 passed, 14 intentional project skips, 0 failures/flaky; exit 0 | Desktop + mobile, 351.28 s including launcher                               |
| Production build     | exit 0                                                            | `npm.cmd run build`; 22.33 s                                                |
| Formatting           | exit 0 on recheck                                                 | `npm.cmd run format:check`; all matched files conform                       |
| Git whitespace       | working-tree and staged checks pass                               | `git diff --check`, `git diff --cached --check`                             |

Raw evidence is ignored, not a product database:
`node_modules/.cache/walk12-qa-evidence/vitest-final.json`, `playwright-final.json`,
`gate-full.log`, `final-format-evidence.json`, and baseline snapshot/comparison JSON files.
The raw gate log preserves the initial CSS formatting failure rather than hiding it. Prettier
then normalized line endings only: the complete before/after CSS text is identical with CR
removed (686583 vs 686592 characters before normalization). No functional code or CSS rule
changed after the passing full test/browser/build run. The full formatting check was rerun green.

Screenshots: `test-results/walk12-final-green`, including desktop 30-day, 7-day, low-data,
mobile 360/390/430, mobile chart/footer, and narrow desktop 1024. Main inspected final images;
read-only UI review compared the approved embedded Concept B and found no remaining P0–P2.
Application/composition and final code review also found no P0–P2 in the agreed scope.

### Preservation, cleanup and limitations

- Git root: `D:/LifeOS-App`; HEAD remains `0a598a25c16267caa8177636fb4a5ae7a29fc893`.
- Baseline: 961 files. The 952 outside the nine intended integration files retain identical
  SHA-256 hashes; no baseline file was removed. Twelve WALK-12 files were added (including docs
  and tests), for 973 total. All 864 index entries remain identical; status rows are 148 → 161.
- No Domain/infrastructure/schema/dependency/lockfile changes in WALK-12. No user browser data
  was seeded or changed; all fixture writes occurred only inside isolated Playwright contexts.
- No staging, commit, push or branch/worktree change. `C:\LifeOS-App` was not opened or changed.
- Verified owned Vite PID 10008: command points to this workspace and port 4174, creation time
  2026-08-26 21:34:24 +09:00. Stopped after QA; listener count on 4174 is zero.
- Browser coverage uses desktop Chrome at 1440/1024 and mobile viewports 360/390/430. Physical
  devices, Safari, real OS keyboard and physical safe-area insets were not tested. These are
  remaining compatibility checks, not failures in the requested Chrome viewport matrix.
- Existing smoke policy excludes only the baseline missing `/favicon.ico`; other console/page
  errors fail tests. Manual browser warnings/errors were empty. Node's NO_COLOR/FORCE_COLOR
  warning is a runner environment message, not an application error.
- Concept B was inspected as its original embedded PNG; no pixel-perfect DOCX/page-render claim.
- History retains all-time scope (explicitly labelled); intent transfers, period does not.
- No analytics database, WalkAnalyticsRecord, recommendation/AI/forecast/causality, GPS/maps/weather.
  WALK-13 is not started. Final handoff ends this task.
