# WALK-14 Hardening and Acceptance Plan

> Use superpowers:executing-plans inline. Main agent alone writes; independent reviewer is read-only.

**Goal:** Accept existing WALK-01–13 through complete journeys, reliable persistence and responsive QA.

**Architecture:** Preserve Domain state, application commands, repository CAS and existing projections.
No new Walk capability. Production changes require a reproduced defect and RED → minimal fix → GREEN.

**Tech Stack:** Existing TypeScript/React/Vitest/Playwright/IndexedDB; no dependencies.

**Spec:** User WALK-14 request attached on 2026-08-26, sections 1–24; acceptance criteria below.

## Constraints and audit

- Only `D:\LifeOS-App`; preserve dirty WALK-01–13 baseline and Git index. No staging/commit/push.
- No C-copy, ACL changes, schema redesign, PWA, AI, new features or next module.
- Heavy gates run sequentially. No timeout/retry weakening to hide failures.
- Baseline already uses IndexedDB v18 (WALK-10 captures). Verify v17 data upgrade compatibility;
  do not downgrade or claim the baseline is still v17.
- Capture contract is 1–500 trimmed characters. Test 500 and rejection of 501–1000, not a new limit.
- User data stays untouched; new profiles and synthetic fixture data only. No storage repair mid-journey.
- Baseline hashes/copies and all screenshots/logs live under ignored `node_modules/.cache/walk14`.

## Module map

| Subsystem                 | Primary files                                                                                                                       | Critical scenario                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Model/engine              | `src/domain/walk/Walk.ts`, `src/application/commands/StartWalk.ts`, `PauseWalk.ts`, `ResumeWalk.ts`, `CompleteWalk.ts`              | Single active Walk, pause-adjusted elapsed, terminal states |
| Persistence               | `src/infrastructure/persistence/IndexedDbWalkRepository.ts`, `mappers/WalkRecordMapper.ts`, `indexed-db/LifeOsIndexedDb.ts`         | CAS, reload, v17 preservation                               |
| Center/preparation/active | `src/presentation/pages/WalksPage.tsx`, `src/presentation/walk/WalkSessionFlow.tsx`, `WalkTimer.ts`                                 | Explicit start, focus, all modes                            |
| Outcome/Reentry           | `RecordWalkOutcome.ts`, `CompleteWalkReentry.ts`, `WalkReentryPolicy.ts`, `WalkCompletionFlow.tsx`, `src/app/WalkReentryStartup.ts` | Persisted outcome and returnContext                         |
| Routine                   | `StartRoutineWalk.ts`, `IndexedDbRoutineWalkUnitOfWork.ts`, `RoutineWalkNavigation.ts`                                              | Atomic Walk/occurrence completion and next block            |
| Decision                  | `StartDecisionWalk.ts`, `DecisionWalkNavigation.ts`, `DecisionWalkSection.tsx`                                                      | Reflection return without Decision mutation                 |
| Capture/Inbox             | `src/domain/walk-capture/WalkCapture.ts`, `CreateWalkCapture.ts`, `WalkCaptureComposer.tsx`, `WalkCaptureInbox.tsx`                 | Durable text, edit/process/retry                            |
| History/details           | `GetWalkHistory.ts`, `GetWalkHistoryDetail.ts`, `WalkHistoryScreen.tsx`, `WalkHistoryDetails.tsx`                                   | Read-only history and missing links                         |
| Analytics/insights        | `GetWalkAnalytics.ts`, `WalkAnalytics.ts`, `WalkInsightEngine.ts`, `WalkAnalyticsScreen.tsx`                                        | Correct metrics and paired sample sizes                     |
| Recommendation            | `WalkRecommendationPolicy.ts`, `GetWalkRecommendation.ts`, `WalkRecommendationPanel.tsx`                                            | Confidence, evidence, user choice                           |
| Responsive/tests          | `src/presentation/styles/global.css`, `WalkInsights.css`, `tests/e2e`                                                               | Layout, focus, errors and safe-area                         |

## Task 1 — Baseline and contracts

- [x] Read module owners, transitions, persistence, presentation, responsive contracts and E2E map.
- [x] Show module map before code changes and capture baseline/index evidence.
- [x] Run targeted domain/application/presentation Walk tests, then integration/persistence tests.
- [x] Extend the existing migration suite only if v17 preservation coverage is missing.

## Task 2 — Acceptance journeys and evidence

Create `tests/e2e/walk14.acceptance.spec.ts`: a cross-screen acceptance harness, not production hooks.
Reuse existing selectors and fixture entities. Extend `walk12.analytics.spec.ts` for literal arithmetic
and `walk13.insights.spec.ts` only when their existing coverage is insufficient.

- [x] Cover ordinary free/recovery/reflection at desktop 1366×768,1440×900,1920×1080 and
      mobile 360×800,390×844,430×932. Each uses UI from Center through capture, pause/resume,
      completion/outcome, Reentry destination, Inbox, History/details and Analytics/Insights.
- [x] Temporary offline in an already loaded session: timer advances, capture and pause persist,
      restore network then reload. No cold-offline/PWA promise.
- [x] Run source-linked Routine/Decision journeys without storage changes during the flow;
      existing source fixtures are allowed before launch. Verify linkedEntity/returnContext and no duplicates.
- [x] Reuse real 10-second active reload test; cover pause reload/frozen timer, resume progression,
      completion non-reactivation and pending Reentry persistence.
- [x] Check long question/summary/title, 500-character capture, 20+ captures and 50+ history records.
      Use immutable fixture initialization; compare all stores across read-only screens.
- [x] At each viewport check horizontal bounds, bottom-nav occlusion, touch sizes, scroll, focus,
      labels and reduced-height keyboard surrogate, restoring full height afterward.
- [x] Capture Center, Preparation, Active, Capture, Completion, Reentry, Inbox, History, Detail,
      Analytics and Recommendation/Why. Inspect screenshots against LifeOS tokens and approved A/D hierarchy.

Core assertions (actual journey data, not mock calls):

```ts
expect((await readStores(page)).walks).toHaveLength(1);
expect((await readStores(page)).walks[0]).toMatchObject({ status: 'completed' });
expect(await readStores(page)).toEqual(beforeReadOnlyNavigation);
await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0);
```

## Task 3 — Confirmed defects only

- [x] Record each failure's path, viewport, expected/actual result and owner.
- [x] Add or extend the narrowest regression; run and record RED.
- [x] Apply only the owning-layer correction, run GREEN and adjacent regressions.
- [x] Do not redesign concurrent Create→Start: if loser remains planned but only one active exists,
      document the known nonblocking debt.

## Task 4 — Sequential gate and independent acceptance

- [x] Targeted unit → integration → Walk E2E → Routine/Decision regression.
- [x] Typecheck → lint → build → full relevant Playwright, each after previous exit.
- [x] Full Vitest and alpha sequentially; format check and both Git whitespace checks.
- [x] Independent read-only final review: data loss, duplicate active, stale context, readonly mutation,
      storage, mobile overflow, a11y, C-paths and test/debug leakage. Resolve Critical/Important findings.
- [x] Inspect task-only delta against saved baseline, preserve index, record final status.
- [x] Prepare the requested fourteen-section final report with evidence and real limitations; stop after delivery.

## Acceptance evidence ledger

### Confirmed defect and regression chain

**P2: Reflection Preparation squeezed labels on desktop 1920×1080.** The fixed 1.35/0.65
split left only about 78px per state control: the 111px tension label overlapped clarity.
`preparation-red.log` records the failing state-label regression. Rebalancing the parent columns
exposed a second constraint in the same layout: five fixed template columns clipped template names
(`acceptance-second.log`, `red-evidence/reflection-template-clipping.png`). Both grids now use
auto-fit with minimum usable widths. This is the complete production delta: two CSS declarations.

The final regression checks both state and template labels, then keyboard focus and hit testing on
Start. `acceptance-green.log`: 18 passed, 14 intentional viewport/project skips, including unchanged
WALK-04 height, focus and real 10-second reload contracts. No test timeout/retry or product contract
was relaxed. Intermediate failures caused by covered native radio inputs, early scroll positioning,
advancing the test clock before Resume completed, and expecting auto-open Reentry instead of its
existing Continue reminder were harness corrections, not product fixes.

### Completed gates (2026-08-26/27, Asia/Chita)

All log paths below are relative to ignored `node_modules/.cache/walk14`.

| Gate                                                   | Actual result                           | Evidence                   |
| ------------------------------------------------------ | --------------------------------------- | -------------------------- |
| Targeted Walk domain/application/presentation          | 29 files, 351 tests passed, 13.29s      | `targeted-baseline.log`    |
| Walk/Routine/Decision integration and persistence      | 13 files, 143 tests passed, 9.31s       | `integration-baseline.log` |
| New v17 preservation check in existing migration suite | 17 tests passed, 1.56s                  | `v17-compatibility.log`    |
| Capture 500/501/1000 boundary and migration recheck    | 2 files, 39 tests passed, 1.69s         | `boundaries-migration.log` |
| WALK-14 acceptance + existing WALK-04 regression       | 18 passed, 14 intentional skips, 3.2min | `acceptance-green.log`     |
| Routine/Decision + stale selected Walk fallback        | 23 passed, 3 intentional skips, 2.5min  | `source-regression.log`    |
| `npm run typecheck`                                    | exit 0                                  | `typecheck.log`            |
| `npm run lint`                                         | exit 0                                  | `lint.log`                 |
| `npm run build`                                        | exit 0, 518 modules                     | `build.log`                |

### Acceptance mapping

| Criterion                                       | Direct evidence                                                                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free / Recovery / Reflection continuous journey | `walk14.acceptance.spec.ts`: UI launch → capture → pause/resume → complete/outcome → persisted Reentry/reminder → Today → Inbox → History/detail → Analytics/Insights → Center                            |
| Routine continuous journey                      | Extended first WALK-08 smoke: initial synthetic Routine, UI only afterward, capture, pause/reload/resume, atomic completion, next occurrence, History/detail/Analytics/Recommendation; long Routine title |
| Decision continuous journey                     | Extended WALK-09 complete-return tests: source created through UI, capture, pause/resume, outcome, pending reload, return, History/detail/Analytics/Recommendation; original Decision unchanged           |
| Active reload                                   | Existing WALK-04 waits actual elapsed ≥10sec before reload; WALK-14 additionally tests fixed 12sec at all six sizes                                                                                       |
| Paused reload / resume / offline                | WALK-14: loaded page offline; timer15sec, capture, pause persists; 30sec pause adds no elapsed; online reload and resume5sec gives20sec total                                                             |
| Completion reload                               | New explicit UI test reloads before optional outcome and confirms completed History, null outcome and no active session; no records changed                                                               |
| Reentry / duplication                           | All UI journeys assert one completed record; source regressions and integration/CAS suites cover duplicate start and retained source/return context                                                       |
| v17 compatibility                               | Existing v17 Walk/outcome/linkedEntity/returnContext/reentry and neighboring records preserved after opening baseline v18 and reopening repository; empty Capture store added                             |
| Mobile and desktop                              | 360×800,390×844,430×932,1366×768,1440×900,1920×1080: journey plus 60-record/21-capture dataset, overflow/content bounds, reachable controls and screenshots                                               |
| Long content                                    | Question400, summary900, capture500, Decision title179, long Routine title; 501/1000 Capture rejected without changing the existing500 limit                                                              |
| Readonly / error / empty                        | Existing WALK-10–13 suites cover empty stores, missing links, failed reads, failed Capture saves and retry; new WALK-14 stale selected id returns safe back action without deleting storage               |
| Recommendation safety                           | Existing engine/policy and WALK-13 suite cover <3 none,3–7 preliminary,8+ stable, evidence/sample size, no causal promise, ordinary mode choice and explicit start                                        |
| Performance                                     | Six large-data browser cases finish in about5–8sec including navigation; History pagination and scroll work; no observed render loop, no FPS/benchmark claim                                              |
| Scope                                           | Baseline hash comparison:8 task files; only production edits are the two CSS grids. No schema/runtime-state/dependency/config changes                                                                     |

### Independent arithmetic

60 completed Walks over10 distinct dates,20 per mode:

- Recovery:15min wall time minus5min pause =10min active; Reflection30min; Free20min.
- Total:20×10 +20×30 +20×20 =1200min =20h. Average1200/60 =20min.
- Energy delta:(20×2 +20×1 +20×0)/60 =+1.
- Tension delta:(20×−3 +20×−1 +20×−1)/60 =−1.666…; UI−1.7.
- Clarity delta:(20×1 +20×3 +20×2)/60 =+2.
- Paired sample60 per metric; mode sample20 each; captures21; recovery evidence20/20, stable.

The UI asserts literal expected values, not the production calculation reused as an oracle.

### Visual and accessibility evidence

86 acceptance PNGs are preserved in `screenshots/`, with source-linked screenshots separately in
`source-screenshots/`; `screenshots.md` indexes all images. Required Center/Preparation/Active/Capture/
Completion/Reentry/History/Detail/Analytics/Recommendation desktop and mobile states are included.
Inspected rendered screenshots retain graphite/gold/green styling, wrapping, control sizes and focus.
The approved DOCX embedded Concept A/D references and existing components informed the comparison;
no claim of pixel-perfect Figma equivalence or complete DOCX page rendering.

Native buttons/labels/radios, stage/composer/confirmation focus, keyboard Start/Why and icon labels
are covered by existing markup and E2E tests. Confirmation has text and an explicit safe Stay action.
`contrast.md` records token spot checks: ordinary/muted text15.77/7.02:1, gold7.72:1, green5.74:1,
error5.69:1 on surface; dark primary-button text8.38:1 on gold. This is not a full WCAG audit.

### Boundaries and remaining nonblocking debt

- Concurrent Create→Start loser can remain planned; CAS still permits only one active Walk.
  Redesign is explicitly outside WALK-14.
- Optional Outcome draft is not persisted before Save, per approved WALK-04 design. Reload after
  completion safely retains a completed Walk without outcome; this stage does not add draft recovery.
- Offline covers an already loaded local session, not offline cold start, service worker/PWA or OS
  suspension. No user storage was touched; all browser fixtures are isolated.
- Mobile QA uses desktop Chrome resized to the required widths and420px height for a keyboard
  surrogate. Physical Android/iOS keyboard, nonzero safe-area and device scrolling remain manual QA.
- Long History summaries can produce tall mobile rows; scrolling/pagination remain functional.
  No information truncation or new compact-view feature was introduced.

### Full browser gate

`npm run test:e2e`: **103 passed,31 intentional project/viewport skips,9.6min,exit0**
(`e2e-full.log`). Both desktop and mobile projects completed with one worker and no retries.
All WALK-01–13 regressions, empty/error states, readonly records, source links and WALK-14 cases
passed. No OOM or runner failure in this final sequential gate. `bundle-audit.log` records no WALK-14
fixture/debug/old-tree marker in the production bundle.

`npm run test`: **255 files,2163 tests passed,96.29s,exit0** (`test-full.log`).
`npm run test:alpha`: **1 test passed,5.60s,exit0** (`alpha.log`). These ran only after Playwright
exited; alpha ran only after full Vitest exited. No dependencies, engine rules or timeout settings changed.

`npm run format:check`: **exit0**, all matched files use Prettier style (`format-final.log`).
The first format check found5 LF-only lines among CRLF in `global.css` after patching; normalized
text compared equal to formatter output, and Prettier restored only consistent line endings.

`git diff --check` and `git diff --cached --check`: **exit0**. Existing baseline LF/CRLF conversion
warnings are not whitespace errors. `task-delta.patch`/`task-files.json` confirm8 task files and exactly
two production CSS declaration changes. No other baseline source/config/dependency changed.
`git hash-object .git/index` still equals `index-before.txt`:
`c6e0992f55457a10a4d4614382e4327e7d297ff6`.
Branch: `codex/backup-full-goals-stage1-wip-20260823`; existing dirty/indexed WALK-01–13 preserved.
`status-final.txt` records full status; QA artifacts are ignored. No staging/commit/push, C-copy/ACL
operation, user-data edit or next module work performed.

### Independent final review and verdict

Independent read-only `final-reviewer` confirmed **Critical0 / Important0 / Minor0** after inspecting
the final eight-file baseline delta, architecture, tests, representative screenshots, arithmetic,
fresh gate logs and ledger. The reviewer independently reran both Git whitespace checks and the
final ledger's narrow Prettier check (all exit0) and verified the unchanged index hash.

**WALK-14 web acceptance: PASS.** Physical-device keyboard/nonzero-safe-area QA remains explicitly
outside the browser evidence; no full mobile-device/WCAG/PWA claim. Task-owned Playwright port4173
has no listener after teardown. Existing user-owned servers were not stopped. No new Walk features,
staging, commit, push, C-copy changes or next module work.
