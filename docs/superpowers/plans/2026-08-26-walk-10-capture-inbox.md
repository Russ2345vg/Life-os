# WALK-10 Capture Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Root is the sole writer under AGENTS.md; subagents audit read-only. Steps use checkboxes.

**Goal:** Save thoughts during running/paused Walk without interrupting it, then edit/process them in a persistent Walk Inbox.

**Architecture:** Independent WalkCapture owns text/status and references Walk by id. Application commands read Walk and write only Capture; a dedicated repository and schema store persist it. Existing WalksPage owns navigation; small components render capture UI.

**Tech Stack:** Existing TypeScript/React, IndexedDB, Vitest/fake-indexeddb and Playwright. No dependency changes.

**Spec:** `D:/LifeOS-App/docs/superpowers/specs/2026-08-26-walk-10-capture-inbox-design.md` (approved).

## Global Constraints

- Work only in `D:\LifeOS-App`; preserve 920 baseline files and Git index/HEAD.
- No commit/push, new worktree, old C: copies, WALK-11 or engine/routing rewrite.
- Content is trimmed, 1–500 characters; type is text; status is pending/processed.
- Capture never changes Walk, Decision, Routine, Outcome or Actions; no cascade deletion.
- Use existing Clock, IdGenerator, elapsedDurationMilliseconds and WalkSubmissionGuard.
- Schema 17 → 18 only adds walkCaptures and its indexes; migration preserves old records.
- Physical mobile keyboard QA is distinct from Playwright emulation and must be reported honestly.
- Inline execution is selected by AGENTS.md's sole-writer rule; review checkpoints do not require another approval within this approved scope.

## Task 1: Domain contract

**Files:** Create `src/domain/walk-capture/WalkCapture.ts` and `WalkCapture.test.ts`; export through `src/domain/index.ts`.

**Interfaces:** `WalkCapture.create({id,walkId,content,capturedAt,walkElapsedMs})`,
`WalkCapture.rehydrate({id,walkId,type,content,capturedAt,walkElapsedMs,status,createdAt,updatedAt,version})`,
`updateContent(content:string,updatedAt:Date):WalkCapture`, `process(updatedAt:Date):WalkCapture`.
All entity fields are readonly. Creation sets pending/version1/createdAt=updatedAt=capturedAt.

- [x] RED: write real behavior tests for trim, empty/length bounds, metadata/offset, immutable originals, edit/process/version, processed edit, invalid rehydration dates/status/type/offset/version.

```ts
expect(domain).toHaveProperty('WalkCapture');
const capture = domain.WalkCapture.create({
  id: EntityId.create('c1'),
  walkId: EntityId.create('w1'),
  content: '  мысль  ',
  capturedAt: new Date('2026-08-26T08:00:05Z'),
  walkElapsedMs: 5000,
});
expect(capture).toMatchObject({
  content: 'мысль',
  status: 'pending',
  version: 1,
  walkElapsedMs: 5000,
});
expect(capture.process(new Date('2026-08-26T08:01:00Z')).status).toBe('processed');
expect(capture.status).toBe('pending');
```

- [x] Run `npm.cmd run test -- src/domain/walk-capture/WalkCapture.test.ts`; verify missing-contract assertions fail.
- [x] GREEN: implement immutable entity; `const content = input.trim(); if (!content || content.length > 500) throw new DomainError('walk_capture.invalid_content', 'Введите мысль от 1 до 500 символов.');`. Validate finite valid Date values, nonnegative integer elapsed, positive integer version, exact text/pending/processed enums and timestamp ordering on rehydration.
- [x] Rerun domain tests; no changes to Walk's domain model.

## Task 2: Repository and additive migration

**Files:** Create `src/application/ports/WalkCaptureRepository.ts`,
`src/infrastructure/persistence/{InMemoryWalkCaptureRepository,IndexedDbWalkCaptureRepository}.ts`,
`records/WalkCaptureRecord.ts`, `mappers/WalkCaptureRecordMapper.ts`, repository/mapper tests.
Modify schema and `LifeOsIndexedDb.test.ts`, application/infrastructure exports.

**Interfaces:** Repository `insert(capture):Promise<void>`, `findById(id):Promise<WalkCapture|null>`,
`findPending():Promise<readonly WalkCapture[]>`, `findByWalkId(id):Promise<readonly WalkCapture[]>`,
`updateIfVersionMatches(capture,expectedVersion):Promise<boolean>`.
Record uses schemaVersion1, string ids and ISO date strings. Mapper accepts unknown and validates via existing RecordMapperSupport plus domain rehydrate.

- [x] RED: assert new repository is exposed, roundtrip survives close/reopen, pending excludes processed, walk filtering, insert duplicate rejection, stale and simultaneous CAS cannot overwrite, malformed records rejected. Add a v17 fixture preserving existing Walk/Decision/other-store records, then assert a real upgrade keeps those records and creates empty walkCaptures.

```ts
await repository.insert(capture);
expect(await repository.updateIfVersionMatches(capture.process(later), 1)).toBe(true);
expect(await repository.updateIfVersionMatches(capture.updateContent('stale', later), 1)).toBe(
  false,
);
expect(await repository.findPending()).toEqual([]);
expect((await repository.findByWalkId(capture.walkId))[0]?.status).toBe('processed');
```

- [x] Run `npm.cmd run test -- WalkCaptureRepository WalkCaptureRecordMapper LifeOsIndexedDb`; verify expected RED before implementations.
- [x] GREEN: create store with keyPath id and nonunique byWalkId/byStatus indexes. Use `add` for insert; observe transaction completion; CAS reads version and writes in one readwrite transaction. InMemory implements identical contract. Fix only legacy fixture store lists to exclude the future store, never production migration guards that hide incorrect schema.
- [x] Run focused repository/schema tests; verify existing records and cross-connection upgrade behavior.

## Task 3: Application composition and read context

**Files:** Create `CreateWalkCapture.ts`, `UpdateWalkCapture.ts`, `ProcessWalkCapture.ts` in application commands;
`GetPendingWalkCaptures.ts`, `GetWalkCaptures.ts`, `GetWalkCaptureById.ts` in queries, shared capture read projection if needed;
`src/app/composition/WalkCaptureComposition.integration.test.ts`. Modify LifeOsApplication, createLifeOsApplication and exports.

**Interfaces:** Create execute({walkId:EntityId,content:string}):Promise<Result<WalkCapture,DomainError>>;
update execute({captureId:EntityId,content:string,expectedVersion:number}); process execute({captureId:EntityId,expectedVersion:number}), same Result return.
List queries return `{capture:WalkCapture,walk:Walk|null,contextLabel:string|null}[]`; by-id returns one or null. Context resolves Decision title/Routine block title read-only with a safe fallback. Sort capturedAt descending, then id ascending.

- [x] RED: create from running/paused, exact elapsed excluding pauses, original complete records unchanged, empty/closed/missing Walk rejected; multiple capture/reopen/ordering; processing and stale edits; completion/Reentry/abandon/delete retain captures; Decision and Routine integration records unchanged by capture.

```ts
expect(app.createWalkCapture).toBeDefined();
const before = WalkRecordMapper.toRecord((await app.getActiveWalk.execute())!);
const result = await app.createWalkCapture.execute({ walkId, content: '  Идея  ' });
expect(result).toMatchObject({
  ok: true,
  value: { content: 'Идея', status: 'pending', walkElapsedMs: 5000 },
});
expect(WalkRecordMapper.toRecord((await app.getActiveWalk.execute())!)).toEqual(before);
```

- [x] Run `npm.cmd run test -- WalkCaptureComposition`; observe RED.
- [x] GREEN: Create reads Walk, requires running/paused, computes offset using Clock once and existing domain elapsed, inserts only Capture. Update/process read capture and compare caller expectedVersion before repository CAS; already processed processing is idempotent. Read projections never persist copied context. Wire only application APIs/repository.
- [x] Run `npm.cmd run test -- WalkCapture DecisionWalkComposition RoutineWalkComposition WalkComposition` and typecheck.

## Task 4: Composer, Inbox and existing-page integration

**Files:** Create `src/presentation/walk/WalkCaptureComposer.tsx`, `WalkCaptureInbox.tsx`, `WalkCaptureDetails.tsx`, presentation test(s);
modify WalkSessionFlow.tsx, WalksPage.tsx, ApplicationShell.tsx for wiring, and global.css scoped capture styles.
Create `tests/e2e/walk10.capture.spec.ts`.

**Implemented interfaces:** Composer receives `isSaving` and `onSave(content):Promise<WalkCaptureSaveResult>`;
it owns only its transient draft, cancellation, focus and local feedback. Inbox/Detail receive application
query/command interfaces and ids, with navigation callbacks. They use a cancellable read-projection hook
for loading/error/retry and keep local selection/edit state. WalksPage owns the capture-view destination
and create-command submission guard. This bounded adjustment avoids moving component-only state into
the already large page; repository/query remains the sole persisted source and all writes use commands.

- [x] RED: browser starts real reflection Walk, waits for elapsed >=5 seconds, opens composer and asserts textarea focus, saves twice, verifies running timer and reload count, completes/reenters, opens Inbox newest-first, edits and processes without deleting. Add cancel/blank/double-submit/paused cases. Missing-Walk/context fallback is verified at application level; it is not claimed as a separate browser scenario.

```ts
await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
await expect(page.getByRole('textbox', { name: 'Мысль', exact: true })).toBeFocused();
await page.getByRole('textbox', { name: 'Мысль', exact: true }).fill('Проверить гипотезу');
await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
await expect(page.getByText('Мысль сохранена', { exact: true })).toBeVisible();
await expect(page.getByRole('heading', { name: 'Размышление', exact: true })).toBeVisible();
```

- [x] GREEN: keep active panel mounted; inline textarea maxLength500, cancel/Escape restores trigger focus, save uses existing guard without pausing timer, errors retain draft. Add persistent count, Center pending-count entry, compact list/detail and completed-card per-Walk count including processed. Do not change global navigation or existing completion/reentry contracts.
- [x] Run focused E2E against a separately owned local QA server using ignored cache config if Windows Playwright server teardown repeats. Use isolated synthetic data only; no user database edits. No timeout bumps or arbitrary retries.
- [x] Verify desktop/mobile 360/390/430px, reduced visible viewport, textarea and Save reachable, no black/empty screen, bottom nav, keyboard focus and console. Capture five required screenshots; actual OS keyboard remains separate manual QA if unavailable.

## Task 5: Regression, read-only review and final report

- [x] Run new unit/application/persistence tests first, then relevant Decision/Walk/Routine/startup/navigation tests and old WALK-09 + ordinary Walk/Routine smoke. Record exact commands/results, including real skips and failures.
- [x] Run fresh typecheck, lint, build, format check and git diff --check; apply TEST_MATRIX quality gate proportionate to new persistence/UI paths. Do not confuse silent Vitest output with watch mode; use one-shot runner and report progress while running.
- [x] Independent read-only architecture/test/UI review; fix actual defects with failing regression tests first.
- [x] Compare final file hashes and Git index/HEAD with stored initial snapshot. Review own changes separately from accumulated baseline. Stop owned QA server and reset temporary browser viewport.
- [x] Prepare user's 12-section WALK-10 handoff report with five screenshots, TDD/regression evidence, exact limitations and no commit/push/WALK-11. Stop.

## Initial verification

2026-08-26 before implementation: `npm.cmd run test -- src/app/composition/DecisionWalkComposition.integration.test.ts src/app/composition/RoutineWalkComposition.integration.test.ts src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts` — 3 files / 29 tests PASS, 3.98s. Dependencies already available; nothing installed.

## Implementation and verification record — 2026-08-26

### Delivered behavior

- Standalone text-only WalkCapture; pending/processed, 1–500 trimmed characters, immutable
  timestamps, existing Clock/IdGenerator and Walk elapsed calculation. No Notes parallel system.
- Create reads active/paused Walk and writes only Capture. An explicitly tested finish/read race
  preserves the thought without overwriting the newer Walk. Edit/process use optimistic versions;
  already-processed processing is idempotent and processed text remains editable.
- IndexedDB 17 → 18 adds only walkCaptures/byWalkId/byStatus. Record schemaVersion is 1.
  There is no delete/cascade API. CAS is one readwrite transaction and success awaits commit.
- Existing Walks Center, active panel and history host inline capture, pending Inbox and per-Walk
  thoughts. Read-projection hooks own no authoritative domain state. Missing context has a safe
  fallback; storage read errors remain visible and retryable.
- Stale edit errors retain the draft and expose explicit discard/reload; no silent rebase.
  Save/cancel/Escape, focus, duplicate submit, read/write failures and mobile reduced viewport are
  exercised in the browser, including an unchanged Walk record comparison.

### TDD and defect evidence

1. Domain assertions failed before the export/model existed, then passed. A later external-Date
   mutation regression failed before private timestamp storage/copy-returning getters, then passed.
2. Mapper/repository/schema tests failed before adapter/store implementation; legacy test fixtures
   were corrected to exclude the new store before migration, not by weakening production guards.
3. Application composition assertions failed before Capture command/query wiring, then passed.
   Coverage includes running/paused offsets, exact Walk/Decision/Routine record non-mutation,
   reopen, ordering, Reentry, abandoned/missing Walk, stale versions and processed → edit.
4. Browser composer assertions failed before the UI existed, then passed. The first timer helper
   was corrected to parse hh:mm:ss rather than counting only minutes; the actual missing-control
   RED was then observed before UI implementation.
5. Browser write-failure regression exposed an uncaught synchronous IndexedDB put exception.
   Catching that exception inside the request callback and aborting the transaction fixed it;
   strict page/console error assertions remained enabled and retry persisted the retained draft.
6. Stale editor recovery first failed on the missing explicit discard/reload control, then passed
   after adding it. The entered draft is never silently overwritten.
7. A repeated E2E run exposed a test synchronization race: immediately after the Reentry click,
   the snapshot could still contain pending Reentry (version 4) while the later record legitimately
   contained closedWithoutContinuation (version 5). The existing flow awaits command persistence
   before rendering Center. The test now waits for that visible Center and asserts closed Reentry
   before taking its baseline. Full-record equality remains intact; no product change or timeout
   increase was made. Two complete WALK-10 repetitions then passed.

### Commands and actual outcomes

| Command / check                                                              | Outcome                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Initial Decision/Routine/schema baseline                                     | 3 files, 29 tests PASS                                                                                                    |
| `npm.cmd run test -- WalkCapture WalksPage DecisionWalkPresentation`         | 6 files, 84 tests PASS                                                                                                    |
| `npm.cmd run test -- WalkCaptureComposition` after processed-edit assertions | 1 file, 18 tests PASS, 4.34s                                                                                              |
| `npm.cmd run test` at 17:20                                                  | 244 files, 1991 tests PASS, 122.62s                                                                                       |
| Repeated default `npm.cmd run test` at 17:35                                 | 243 files / 1990 tests PASS; only Alpha timed out at 5016ms; total 126.49s                                                |
| Final `npm.cmd run test -- --maxWorkers=1` at 17:38                          | 244 files, 1991 tests PASS, including Alpha, 231.69s                                                                      |
| `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`             | PASS before final test-only additions; build transformed 499 modules                                                      |
| `npm.cmd run test:e2e:list`                                                  | 48 cases discovered in 3 files                                                                                            |
| Full Playwright set with owned QA server                                     | 41 PASS, 7 intentional skips, 4.6m                                                                                        |
| Current WALK-10 spec, `--repeat-each=2`                                      | 18 PASS, 6 intentional desktop skips, 1.9m; retries remain 0                                                              |
| `npm.cmd run test:alpha`                                                     | Initial parallel-load run timed out at the unchanged 5000ms limit; two isolated reruns PASS (test bodies 2.50s and 2.47s) |

The full E2E run preceded the final processed-edit assertions and synchronization correction;
the subsequent doubled WALK-10 run verifies those additions. Existing smoke/Decision specs and
product code were unchanged between runs. Alpha resource contention is plausible, not a proven
product defect; its timeout and implementation were not changed. The same Alpha test also passed
inside the first full Vitest suite. Local CLI help confirms `--maxWorkers`; a final single-worker
full run is used to separate runner scheduling load from application behavior. No checked-in
Vitest setting, test limit or Alpha test source is changed. The final single-worker full suite
passed all 1991 tests. This provides a repeatable bounded-runner gate while retaining the explicit
limitation that the unconstrained default run showed intermittent Alpha timing sensitivity here.

Playwright used the checked-in suite/projects, installed Chrome, one worker and zero retries.
An ignored `node_modules/.cache/walk10.playwright.config.mjs` disables only automatic webServer
ownership and points to the separately owned Vite at 127.0.0.1:4174; checked-in configuration was
not edited. This avoids the previously observed Windows automatic-server teardown problem.
No dependency installation or downloaded browser was required.

### Acceptance coverage

| User scenarios                                                                  | Evidence                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–6, 8–10: active/paused, link, trim/empty, timestamps/elapsed, no pause/finish | Domain + application contracts; exact Walk record equality; running timer browser assertion                                                                                                        |
| 7: reload                                                                       | Repository close/reopen, composition reopen, desktop/mobile page reload                                                                                                                            |
| 11–15: pending/processed persistence, multiple thoughts, newest first           | Repository/application queries + Inbox/history E2E                                                                                                                                                 |
| 16: completion with pending thoughts                                            | Composition completion/Reentry and primary browser flow                                                                                                                                            |
| 17–18: Decision/Routine unchanged by Capture                                    | Composition exact before/after records; existing neighboring smoke suites                                                                                                                          |
| 19: Walk without Capture                                                        | Existing ordinary Walk/Routine/Decision smoke scenarios                                                                                                                                            |
| 20: duplicate submit                                                            | Synchronous guard plus browser duplicate-dispatch regression                                                                                                                                       |
| Additional safety                                                               | Live v17 connection upgrade retaining all 19 old stores; cross-connection CAS; Date immutability; abandoned/missing Walk; context failure; processed edit; read/write retry; stale editor recovery |

### Browser and independent review

- Manual in-app desktop QA created one explicitly named WALK-10 QA reflection Walk, waited
  over five seconds, saved two thoughts, reloaded, finished, saved outcome, closed Reentry,
  edited/processed one thought and confirmed both in history. No test Walk remains active.
- Automated desktop 1440×900 and mobile 390×844 cover the full capture flow; mobile 360/390/430
  additionally reduce the viewport to 420px height with focused text entry and reachable Save.
  Console/page error assertions pass. No black/empty screen or input/action overlap was observed.
- Read-only architecture and test reviewers found no remaining critical/important issue after
  Date immutability, transaction abort and processed-edit coverage corrections.
- Read-only visual review of desktop composer/confirmation/Inbox/detail and all three mobile
  screenshots found no blocking issue. Optional nonblocking polish: wide desktop detail actions
  sit far right, following existing form conventions. No Figma pixel-match claim is made.
- Physical Android/iOS keyboard behavior is NOT verified by these checks. Remaining manual QA:
  on a real device open the keyboard, enter/save/cancel, rotate if supported, ensure no blank screen
  or bottom-nav overlap, and confirm the active timer and saved thought after dismissal/reload.
  This limitation was accepted separately; emulation is not represented as physical keyboard PASS.

Stable screenshots are under `D:/LifeOS-App/test-results/walk10-final/`: desktop primary-flow
`01-active-composer.png`, `02-saved-confirmation.png`, `03-inbox.png`, `04-capture-details.png`,
and the three mobile `05-mobile-{360,390,430}-reduced-viewport.png` cases. Later doubled checks
use `walk10-final-capture/` so the reviewed screenshots remain intact.

### Workspace preservation

- Git root: `D:/LifeOS-App`; branch: `codex/backup-full-goals-stage1-wip-20260823`.
- HEAD remains `0a598a25c16267caa8177636fb4a5ae7a29fc893`; all 864 index entries match the
  pre-WALK-10 snapshot. No staging, commit, push or branch change was performed.
- All 920 baseline files remain present: 909 byte-identical, 11 intentionally extended for
  Capture wiring/schema/UI. Added 27 files (20 product, 5 tests, 2 documents); no removals or
  paths outside the declared WALK-10 set. The 11 changed files include one existing schema test,
  so total WALK-10 ownership is 30 product files, 6 test files and 2 documents.
- The worktree was already dirty: `git status --short` had 105 lines initially and has 133 now.
  Those rows include accumulated WALK-01–09 work; they are not all WALK-10 changes.
- `git diff --check` and `git diff --cached --check` both pass. Existing accumulated diff was
  reviewed without staging or reverting it. Alpha source, Vitest config, package.json and
  package-lock.json are byte-identical to the baseline.
- Local runner config and screenshot folders are Git-ignored. No `.codex-temp` content was added.
- Owned QA Vite on port 4174 was stopped. Ctrl+C did not terminate it, so the verified owned PID
  6416 (matching original start time and command) was stopped explicitly. The pre-existing dev
  server on 5173 was left untouched; no broad Node/process termination was used.
- Old C: workspace/Obsidian copies were not opened, changed or deleted. WALK-11 was not started.

### Product file inventory

Final checker rerun after all product/test edits: `npm.cmd run typecheck`, `npm.cmd run lint`
and `npm.cmd run build` PASS (499 modules; Vite build 1.35s). `npm.cmd run format:check` PASS;
an earlier warning concerned only this newly updated report and was resolved with Prettier.
Both worktree and index `git diff --check` pass. No product/test edits followed the final
successful test runs; the last report-only edit is formatted and checked separately.

| File                                                                | Responsibility                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/domain/walk-capture/WalkCapture.ts`                            | Text/status invariants, immutable timestamps, versions            |
| `src/application/ports/WalkCaptureRepository.ts`                    | Capture persistence port                                          |
| `src/application/commands/CreateWalkCapture.ts`                     | Create from active/paused Walk without mutating it                |
| `src/application/commands/UpdateWalkCapture.ts`                     | Versioned text editing                                            |
| `src/application/commands/ProcessWalkCapture.ts`                    | Idempotent processing without deletion                            |
| `src/application/commands/walkCaptureCommandSupport.ts`             | Shared Capture error results                                      |
| `src/application/queries/GetPendingWalkCaptures.ts`                 | Pending Inbox projection                                          |
| `src/application/queries/GetWalkCaptures.ts`                        | Per-Walk history projection                                       |
| `src/application/queries/GetWalkCaptureById.ts`                     | Single Capture detail projection                                  |
| `src/application/walk-capture/WalkCaptureReadModel.ts`              | Read-only Walk/Decision/Routine context and stable sorting        |
| `src/infrastructure/persistence/InMemoryWalkCaptureRepository.ts`   | InMemory adapter with CAS                                         |
| `src/infrastructure/persistence/IndexedDbWalkCaptureRepository.ts`  | Transactional IndexedDB adapter                                   |
| `src/infrastructure/persistence/records/WalkCaptureRecord.ts`       | Versioned storage record                                          |
| `src/infrastructure/persistence/mappers/WalkCaptureRecordMapper.ts` | Strict record mapping                                             |
| `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`      | Additive schema 18 / store indexes                                |
| `src/app/composition/LifeOsApplication.ts`                          | Exposed Capture services                                          |
| `src/app/composition/createLifeOsApplication.ts`                    | Existing DB/Clock/IdGenerator wiring                              |
| `src/app/ApplicationShell.tsx`                                      | Pass six Capture application interfaces only                      |
| `src/presentation/walk/WalkCaptureComposer.tsx`                     | Inline draft, focus, cancel/save feedback                         |
| `src/presentation/walk/WalkCaptureInbox.tsx`                        | Pending and per-Walk lists                                        |
| `src/presentation/walk/WalkCaptureDetails.tsx`                      | Editing, processing, explicit conflict recovery                   |
| `src/presentation/walk/WalkCaptureMetadata.tsx`                     | Captured time, elapsed and safe context                           |
| `src/presentation/walk/WalkCaptureSummary.tsx`                      | Center/history counts and entries                                 |
| `src/presentation/walk/useWalkCaptureQuery.ts`                      | Cancellable read projection state/retry                           |
| `src/presentation/pages/WalksPage.tsx`                              | Local capture-view state and create command integration           |
| `src/presentation/walk/WalkSessionFlow.tsx`                         | Narrow Capture slots in existing active/Center/history UI         |
| `src/presentation/styles/global.css`                                | Scoped graphite/gold/green Capture styles and mobile reachability |
| `src/domain/index.ts`                                               | Domain exports                                                    |
| `src/application/index.ts`                                          | Application exports                                               |
| `src/infrastructure/index.ts`                                       | Infrastructure exports                                            |
