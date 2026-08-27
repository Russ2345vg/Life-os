# WALK-11 History implementation plan

## Goal

Доставить read-only список и карточку завершённой прогулки с фактом, состоянием и результатом.

## Architecture

WalksPage → WalkHistoryScreen / WalkHistoryDetails → GetWalkHistory / GetWalkHistoryDetail
→ существующие Walk / Capture / Decision / Routine ports. Stateless context reader разделяется
с Capture read model. App composition связывает зависимости. Domain / persistence неизменны.

## Tech stack

Существующие TypeScript, React, Vite, Vitest, fake-indexeddb и Playwright. Без установки пакетов.

## Spec

`docs/superpowers/specs/2026-08-26-walk-11-history-design.md`.

## Global constraints

- Только D:\LifeOS-App; WALK-01–10 сохраняются. No commit / stage / push / new worktree.
- Главный агент единственный пишет код. Независимые агенты проверяют read-only.
- No any, no direct infrastructure in Presentation, no state mutations from History.
- Only completed; endedAt DESC + id ASC; intent null not inferred; 20 rows per page.
- Existing actualDurationMilliseconds, impact / result and WalkCaptures are authoritative.
- Separate historical navigation, never lifecycle / Reentry. No WALK-12 analytics.
- The DOCX was supplied after implementation; compare its original concept B before handoff.
  The reference does not authorize analytics, extra modes or changes outside WALK-11.

## Task 1 — application read contract (RED → GREEN)

Files:

- Add `src/application/queries/GetWalkHistory.ts` and `.test.ts`.
- Add `src/application/queries/GetWalkHistoryDetail.ts`.
- Add `src/application/walk/WalkSourceContextReader.ts`.
- Add `src/app/composition/WalkHistoryComposition.integration.test.ts`.
- Modify `src/application/walk-capture/WalkCaptureReadModel.ts` (delegate lookup only).
- Modify `src/application/index.ts`, `src/app/composition/LifeOsApplication.ts`,
  `src/app/composition/createLifeOsApplication.ts` (query wiring only).

- [x] RED: real Walk fixtures test completed-only, endedAt order/ties, intent filters,
      legacy null, all dates, 0 / 1 / 100 records, and repository failures.
- [x] RED: real composed IndexedDB app tests detail reads facts, pause-aware duration,
      nullable outcomes/states, pending + processed captures, Decision alive/deleted/missing,
      Routine alive/missing, and persistence equality before/after reads and reopen.
- [x] Add `GetWalkHistory.execute(intent?: WalkIntent): Promise<readonly Walk[]>` using
      `Pick<WalkRepository, 'findAll'>`; filter then stable sort a copy.
- [x] Add `WalkSourceContextReader.read(walk: Walk | null)` returning source, label and
      availability available / missing / unavailable for Decision / Routine, otherwise null.
      Preserve Capture DTO and existing constructor call sites while delegating lookup.
- [x] Add `GetWalkHistoryDetail.execute(id: EntityId)` returning null for absent/noncompleted,
      otherwise `{ walk, captures, sourceContext }`; read through GetWalkCaptures and shared reader.
      Propagate core Walk / capture failure; swallow only optional linked-context failure.
- [x] Wire and run `npm.cmd run test -- GetWalkHistory WalkHistoryComposition WalkCaptureComposition`.

Example behavioral assertions (expected values independent of production helpers):

```ts
expect((await query.execute()).map((walk) => walk.id.toString())).toEqual(['new', 'old']);
expect(detail.walk.actualDurationMilliseconds).toBe(20 * 60 * 1000);
expect(detail.captures.map((capture) => capture.status)).toEqual(['pending', 'processed']);
expect(await persistedRecords()).toEqual(beforeViewing);
```

## Task 2 — read-only presentation (RED → GREEN)

Files:

- Add `src/presentation/walk/WalkHistoryPresentation.ts` and `.test.ts`.
- Add `src/presentation/walk/WalkHistoryScreen.tsx`, `WalkHistoryDetails.tsx` and UI tests.
- Modify `src/presentation/pages/WalksPage.tsx`, `src/app/ApplicationShell.tsx`,
  `src/presentation/styles/global.css` (scoped history classes).
- Add `tests/e2e/walk11.history.spec.ts`.

- [x] RED: formatting tests for each intent / legacy, real paused duration, state facts,
      nullable state, empty result; page 0 / 1 / 21 / 100, invalid page clamp.
- [x] RED: static render tests for read-only list/detail, all captures/statuses, safe links,
      missing context, empty state. Browser test fails on missing History entry before UI wiring.
- [x] Implement pure presentation helpers without importing Infrastructure; reuse existing
      intent/type labels and time helpers. Pagination slices at 20, filter handled by query.
- [x] Implement screen loading / error / retry / empty / list and local selected id.
      Filter/page reset on filter change; back restores list and focus. Query changes cannot show
      a stale selected walk; refresh on focus cancels stale results.
- [x] Implement semantic read-only details with context, state dl, result, captured thoughts.
      Routine navigation uses original source occurrence, not next Reentry step.
- [x] Add a local History subview whose state is separate from sessionPhase. Show its entry
      at the stable Center/active-walk surface, without interrupting completion or Reentry.
      The empty CTA returns to the canonical begin flow; an existing active walk keeps priority.
      Add explicit onOpenHistoryDecision / onOpenHistoryRoutine routing callbacks in App.
- [x] Style compact desktop rows and single-column mobile cards with wrapping and 44px controls.
- [x] Run `npm.cmd run test -- WalkHistory WalksPage WalkCapture` then `npm.cmd run typecheck`.

## Task 3 — browser / regression verification

- [x] Isolated E2E fixtures: completed reflection/recovery/free/legacy, one active, captures,
      Decision and Routine. Do not mutate user's browser database.
- [x] Test list/filter/detail/back, missing/deleted targets, no writes after navigation,
      empty CTA and ordinary start/pause/resume/finish/Reentry, bounded 100-row DOM.
- [x] Desktop1440 and mobile360/390/430: overflow, wrapping, tap targets, footer clearance,
      keyboard focus and browser errors. In-app browser review of actual rendered app.
- [x] Save six screenshots: desktop history, filtered history, detail, outcome/captures,
      mobile history, mobile detail. Show them in final answer; no video.
- [x] Run WALK-08 / WALK-09 / WALK-10 regressions and Playwright smoke desktop/mobile.
- [x] Independent read-only review of application contracts and final implementation.

## Task 4 — final gate and handoff

- [x] `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.
- [x] Full one-shot `npm.cmd run test -- --maxWorkers=1` with periodic progress;
      no repeated default heavy runs or timeout increases. Alpha is included in the full suite.
- [x] `npm.cmd run format:check`, `git -c core.safecrlf=false diff --check`.
- [x] Inspect diff, compare baseline hashes outside declared patch, verify unchanged index/HEAD,
      run `git status --short`. Stop only task-owned QA server.
- [x] Final report in requested 13 sections; include DOCX comparison and real QA limits. STOP.

## Execution notes

Main-agent inline execution follows the approved plan. The subagent-implementer workflow is
not used because repository instructions require the main agent to own all edits. Worktree
creation/commits from generic skills are overridden by the user's explicit workspace/Git rules.
Preflight: Task1 DTO feeds Task2 read-only props; Task2 routes feed Task3 navigation assertions;
no lifecycle commands required. Shared files are edited sequentially by one writer.

### Progress / review evidence

- Task 1: RED 28 tests (missing query exports/composition) → GREEN 46 tests with existing
  Capture composition. Added a real pre-existing Routine execution and a historical title
  with missing source following independent application review; 17 composition cases pass.
- Task 2: RED 33 presentation cases → GREEN; browser RED missing History entry → GREEN
  desktop/mobile empty-to-intent flow. Existing duration formatter moved without changing
  its semantics to `walkPresentation.ts`; shared fixture is test-only.
- Targeted regression: `npm.cmd run test -- Walk GetHistoryForDateRange`: 40 files / 408 tests,
  exit 0, 27.46s (19:41:49). Typecheck and scoped ESLint pass.
- UI review found mobile heading scrolled behind sticky header: fresh RED at 390px
  (heading y=27.39, header bottom=80.39). Fix follows existing Walk stage pattern:
  focus with preventScroll, scroll the enclosing stage with its mobile scroll margin.
- Test-harness corrections: maintain synthetic read failure until explicit recovery
  (React StrictMode repeats effects); wait for measured geometry/scroll completion instead
  of assuming a key event instantly finishes scrolling. No timeout increases.
- Production focus correction: history heading has explicit gold focus even after mouse
  navigation; keyboard-only `:focus-visible` does not cover every programmatic transition.
- Initial application and source review: no open findings; before the smoke readiness fix,
  independent comparison confirmed 8 changed + 14 new files and 939 baseline files unchanged.
  Final post-fix counts are recorded below; zero deleted/out-of-scope files in either comparison.
- UI re-review closes the mobile-focus finding. Fresh 360/390/430 matrix repeated twice:
  6 passed / 33.3s. In-app 390px focus top 175.2px clears header bottom 81.6px; console empty.
- Full Vitest: 248 files / 2053 tests passed, exit 0, 229.64s (19:49:11).
  Separate `npm.cmd run test:alpha`: 1 test passed, exit 0, 6.53s (19:53:25).
- Full typecheck, ESLint, production build and Prettier check pass. Latest test-only screenshot
  helper also passes scoped ESLint/Prettier: full-page captures reset scroll to the origin so
  fixed shell controls are not painted midway through the image; viewport clearance is
  asserted separately before that reset. No product change or assertion removal.
- First all-E2E run: 51 passed / 10 intentionally skipped / 1 failed, 5.7 minutes.
  All 11 runnable WALK-11 cases passed. Failure is before Walk interaction in the legacy
  `seedRoutineWalk` helper: the first LifeOS text is the hidden desktop brand on mobile.
  Independent runtime review confirms `#application-content` is mounted after provider/DB
  readiness; the generic main role would also match the earlier loading screen.
- One-line test-only correction in `tests/e2e/lifeos.smoke.spec.ts`: wait for
  `#application-content`, preserving the existing scenario/assertions/timeouts. This is the
  ninth baseline file changed (product scope stays at 14 files). Targeted regression:
  2 passed / 32.0s. Restoring only this guard reproduces the exact baseline SHA256.
  Screenshot helper captures mobile viewport/top and bottom
  separately to avoid full-page fixed-navigation artifacts; no hidden UI or product CSS changes.
- Final all-E2E: 52 passed / 10 project-specific skips / zero failures, exit 0, 5.4 minutes.
  This includes all 11 runnable WALK-11 cases and WALK-08/09/10 + ordinary Walk smoke.
  Final captures: `test-results/walk11-final-green`, six requested views visually inspected,
  including separate mobile top and bottom viewport shots (no video).
- Final full format check passes. HEAD remains `0a598a25c16267caa8177636fb4a5ae7a29fc893`;
  all 864 index entries match baseline, status has 148 rows. Final scope: 9 baseline files
  modified + 14 new files, 938 untouched, zero deleted or out-of-scope files.
- Manual in-app QA used existing data read-only, desktop and 390px; automated layout covers
  360/390/430px. Browser console has no warnings/errors. Viewport override reset.
  The approved DOCX was then supplied by the user; the comparison is recorded below.
- Task-owned Vite PID 9424 (workspace command line and 19:28:54 start verified) terminated
  after QA; port 4174 no longer listens. No unrelated server/process was stopped.

### Supplied DOCX / reference closure

- Read the user's DOCX from Downloads without modifying/copying it into product source.
  Sections 13, 17.1 and WALK-11 confirm existing facts/state/result/captures/links. Appendix A
  explicitly treats concepts as hierarchy/density/language references and preserves the shell;
  additional functions visible in concepts are not implementation instructions for this stage.
- Compared original embedded concept B (`rId12`, `word/media/image2.png`) with the current
  desktop/mobile browser screenshots. The compact journal, token palette, hierarchy, links
  and responsive cards fit the relevant direction. No product adjustment is indicated.
- The reference has no exact historical detail screen; no pixel-perfect claim. LibreOffice
  is not installed, so page rendering could not run; the embedded PNG was inspected directly.
- Product/test files remain identical to the successful quality-gate tree; this follow-up
  updates only the two WALK-11 handoff Markdown files and ignored verification artifacts.
- Independent UI reference review confirms no WALK-11-scope fidelity gaps; verdict: ready
  for the scoped interpretation, not pixel-identical to the full operational dashboard.
