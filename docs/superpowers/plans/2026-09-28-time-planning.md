# Time planning implementation plan

**Goal:** Turn existing LifeAction dates into a usable week/day schedule with estimates, optional time blocks, capacity, recoverable work sessions and day/week plan-versus-actual insight.

**Architecture:** LifeAction remains the single plan record. New commands pass through application ports and the journal unit of work; ActionSession remains the single actual-work record. Presentation reads application queries. IndexedDB, recovery and pilot sync carry the optional fields and the separate capacity setting.

**Tech stack:** TypeScript, React, IndexedDB, Vitest, Playwright, existing LifeOS CSS and application composition. No new dependencies.

**Design contract:** [time-planning-design.md](../specs/2026-09-28-time-planning-design.md). The calendar visual reference is approved; a separate reference and user visual review precede the unique timer/report UI.

## Stage 1 — schedule and capacity

### Task 1: Domain plan fields and invariants

**Files:** `src/domain/life-action/LifeAction.ts`, `src/domain/life-action/LifeAction.test.ts`, `src/infrastructure/persistence/records/LifeActionRecord.ts`, `src/infrastructure/persistence/mappers/LifeActionRecordMapper.ts`, mapper tests.

1. Add failing tests for estimate, valid/invalid block, date move, date clear, completed-action guard, legacy record and round-trip.
2. Add optional fields and one domain transition for estimate/block. Keep plannedDate canonical and require the half-open block pair.
3. Map optional fields as null for old records; preserve record schema v1. Run targeted domain and mapper tests.

### Task 2: Atomic schedule mutation, conflicts and undo

**Files:** `src/application/commands/SetLifeActionPlan.ts`, a new `SetLifeActionTime.ts` command and tests, `src/infrastructure/persistence/IndexedDbJournalUnitOfWork.ts`, `src/infrastructure/persistence/LifeActionDateUndo.test.ts`, application port/composition files.

1. Red tests: adjacent windows save, overlapping windows reject without mutation, two-tab race rejects one, date move keeps time, date clear removes time, undo restores prior block or reports conflict.
2. Implement command through the existing UoW, with expected version and per-day validation inside the same readwrite transaction. Validate only changed actions against final transaction state so imported unrelated conflicts do not block edits.
3. Extend date undo receipt only as needed to restore the block; run targeted tests and `test:fast`.

### Task 3: Sync and recovery compatibility

**Files:** `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`, `src/infrastructure/sync/recovery/IndexedDbRecoveryStore.ts`, their tests and related sync fixtures.

1. Red tests: old remote record without optional fields preserves current local plan; explicit null clears; null date clears block; exact restore of a legacy snapshot clears later optional fields; remote overlaps remain stored and queryable.
2. Adapt merge/restore behavior at the record boundary without rejecting remote conflicts or rewriting unrelated user data.
3. Run targeted persistence/sync tests and `test:fast`.

### Task 4: Capacity setting and calendar query

**Files:** new domain/application capacity contract and IndexedDB adapter, `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`, sync/recovery registries and tests, planner query/model tests.

1. Red tests for unset capacity, valid weekday minutes, upgraded v27 database, snapshot/restore, sync, daily load with estimated untimed items, overlap warnings and unknown estimates.
2. Add a single versioned planning-settings record with weekday net minutes and no fake default. Aggregate directly from LifeActions.
3. Run targeted adapter/query tests and `test:fast`.

### Task 5: Calendar and Today UI

**Files:** `src/presentation/planner-v2/PlannerCalendar.tsx`, relevant Today/action controls, planner CSS, UI tests, `tests/e2e/current.time-planning.spec.ts`.

1. Red UI tests for switching month/week/day, schedule assignment and clearing, conflict feedback, untimed list, capacity setup and save, Today reflection, keyboard path.
2. Implement the approved week/day reference with existing shell, Sheet and controls. Desktop shows week and context; mobile shows selected day, no horizontal page scroll. Loading/empty/error/success are explicit.
3. Run targeted render tests, `npm run verify`, scoped desktop/mobile E2E and manual browser review against the current app and approved reference.

## Stage 2 — actual work sessions

### Task 6: Application timer contract

**Files:** `src/domain/action-session/ActionSession.ts`, session record/mapper, new application commands/query/port, IndexedDB adapter, app composition and tests.

1. Red tests: draft action can start, running/paused survives reload, pause/resume/stop is version-safe, one unfinished session across tabs, ending work does not complete action, old session records remain readable, goal snapshot stays historical.
2. Wire existing ActionSession UoW/storage into v2. Add optional goalIdAtStart for new sessions and compatible mapping/sync. Display imported multi-device unfinished conflicts instead of choosing one silently.
3. Run targeted tests and `test:fast`.

### Task 7: Timer UI

**Files:** a new timer visual reference and specification in `docs/design/`, relevant planner-v2 components/CSS/tests, scoped E2E.

1. Produce a concrete desktop/mobile timer reference from the current app shell; obtain the visual approval required for this unique scenario while independent backend work proceeds.
2. Red UI/E2E tests for start/pause/resume/finish, reload recovery, stale action and imported conflicting sessions.
3. Implement only after approval, then run targeted tests, `npm run verify`, scoped E2E and browser desktop/mobile/focus/console review.

## Stage 3 — plan and actual

### Task 8: Historical report query

**Files:** new application query and tests; supporting planner model.

1. Red tests for local-midnight split, pause subtraction, running as-of-now, completed count, estimate versus scheduled block, unknown estimates, and goalIdAtStart versus later goal relink.
2. Compute from current LifeActions and ActionSessions, with no persisted metrics cache. Preserve unattributed legacy work as explicit total.
3. Run targeted query tests and `test:fast`.

### Task 9: Day/week report UI and final integration

**Files:** report visual reference, planner-v2 UI/CSS/tests, scoped and cross-flow E2E.

1. Obtain visual approval for the unique report composition; add red tests for day/week switching, filtering, empty and conflict states.
2. Implement report and cross-links from calendar/Today/timer. Confirm planned and actual minutes remain separate through reschedule, sync and reload.
3. Run targeted tests, `npm run verify`, scoped desktop/mobile E2E and manual visual/accessibility review.

### Task 10: Final compatibility gate and handoff

1. Run upgrade, snapshot/restore and sync integration cases with legacy and current records.
2. Explain the shared multi-flow persistence/sync risk, then run full `npm run test:e2e` once because targeted flows cannot cover all impacted interactions.
3. Review changed files and outputs, `git diff --check`, `git diff`, `git status --short`. Keep all changes uncommitted and do not push.

**Execution note:** Follow red/green per task. Do not run a broad gate repeatedly while later tasks still change its contract. Preserve the dirty baseline and report unrelated failures separately.

## Current delivery boundary — 28 September 2026

Tasks 1–6 and 8 are implemented. Calendar UI reuses the approved shell; the time sheet is
shared by the calendar and action details. Today displays the same plan and capacity.
The user approved the isolated
[timer/report reference](../../design/references/2026-09-28-work-time/preview.html)
on 28 September 2026 with «да». Tasks 7 and 9 are implemented in the same worktree.
The work-time owner survives route changes, reloads on visible lifecycle events and
bounded polling, and keeps sessions read through the application port. Timer commands
never complete an action. Day/week reporting distinguishes no plan from unknown estimate.
Review P2 findings on plan labels and toast expiry were reproduced RED and fixed.
Final verification is recorded in [the work-time report](../../design/features/2026-09-28-work-time-verification.md).
The existing dirty baseline is preserved; no commit or push is authorized.

Integration tests live in `src/infrastructure/persistence/`: `SetLifeActionTime.integration.test.ts`,
`TimeCapacityService.integration.test.ts`, `WorkSessions.integration.test.ts` and
`TimeWindowRestore.integration.test.ts`. Local commands, reopen and trash restore share
`ActionTimeWindows` inside their write transaction; existing imported overlaps remain editable.
Automatic recurrence reconciliation retains existing occurrence windows, including a conflict
after resume or pause expiry, so loading stays available and the calendar offers visible repair.
The exception applies only to existing occurrences with the same clock window; manual changes,
reopen and trash restoration still reject newly occupied overlaps atomically.

Scoped browser tests cover desktop/mobile assignment, adjacency and rejection, reload,
capacity, clearing time while retaining the estimate, Today and details, keyboard focus,
short-block geometry and a stale form draft. Compatibility tests cover database v27,
snapshot versions 23–27, exact legacy restore and encrypted sync field preservation.
Prepared-action completion and reopening are covered through persistence and desktop/mobile
reload: preparation and time are retained in ready state; an ordinary action returns to draft.
The verification results and remaining baseline failures are recorded in
[the delivery report](../../design/features/2026-09-28-time-planning-verification.md).
