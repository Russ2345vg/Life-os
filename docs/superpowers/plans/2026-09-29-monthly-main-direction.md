# Monthly Main Direction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-day main-direction control on Today with a synced, user-confirmed monthly focus card.

**Architecture:** A dedicated `MonthlyDirectionFocus` record keyed by `YYYY-MM` becomes the sole source used by the Today UI. An application service validates active directions, derives the previous-month or legacy-day suggestion, and writes through an IndexedDB repository registered with structured sync.

**Tech Stack:** TypeScript, React, IndexedDB, Vitest, Playwright, existing LifeOS CSS tokens.

**Spec:** `docs/design/features/2026-09-29-monthly-main-direction.md`

## Global Constraints

- Preserve all pre-existing dirty work, including overlapping edits in Planner Today, composition, CSS and sync fixtures.
- Add no dependency and do not change the established UI → Presentation → Application → Domain flow.
- The feature must not filter, reorder or highlight actions.
- `Day.mainDirectionId` remains readable for compatibility but the new UI must not write it.
- Use jade for the selected monthly focus and keep gold reserved for action priority.
- Run only targeted tests, one scoped Today E2E on desktop/mobile, and `npm run verify`; never run the full E2E suite.
- Do not commit overlapping dirty files; leave one reviewable working-tree patch.

## Review Focus

- An explicit `null` selection must suppress a previous-month suggestion — covered in Task 1 service tests.
- An archived direction must not be confirmable as a new month focus — covered in Task 1 service tests.
- Concurrent or stale writes must not silently overwrite a newer month record — covered in Task 2 repository tests.
- Sync must preserve the optional direction relationship and deterministic month identity — covered in Task 2 adapter tests.
- Today and Tomorrow views must show the same month record and keep it after reload — covered in Task 4 scoped E2E.

---

### Task 1: Domain and application contract

**Files:**

- Create: `src/domain/planner/MonthlyDirectionFocus.ts`
- Create: `src/application/ports/MonthlyDirectionFocusRepository.ts`
- Create: `src/application/planner/MonthlyDirectionFocusService.ts`
- Create: `src/application/planner/MonthlyDirectionFocusService.test.ts`
- Modify: `src/domain/index.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Produces: `monthlyDirectionFocusMonth(date: DayDate): string`.
- Produces: `MonthlyDirectionFocus { id, month, directionId, updatedAt, version, schemaVersion }`.
- Produces: repository methods `findByMonth`, `findLatestBefore`, and atomic `change`.
- Produces: service methods `get(date)` returning `{ month, current, suggestion }` and `set(date, directionId)`.

- [ ] **Step 1: Write failing service tests**

Cover a persisted current choice, previous-month suggestion, explicit null suppression, inactive
direction rejection, latest previous selection, and legacy `Day.mainDirectionId` fallback.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm run test:target -- src/application/planner/MonthlyDirectionFocusService.test.ts`\
Expected: FAIL because the monthly contract and service do not exist.

- [ ] **Step 3: Implement the minimal domain, port and service**

Validate `YYYY-MM`, use ID `monthly-direction-focus:<month>`, freeze validated records, create an
explicit record even for `directionId: null`, and validate non-null choices through
`DirectionRepository.findById`.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `npm run test:target -- src/application/planner/MonthlyDirectionFocusService.test.ts`\
Expected: all tests pass.

### Task 2: IndexedDB persistence and structured sync

**Files:**

- Create: `src/infrastructure/persistence/mappers/MonthlyDirectionFocusRecordMapper.ts`
- Create: `src/infrastructure/persistence/IndexedDbMonthlyDirectionFocusRepository.ts`
- Create: `src/infrastructure/persistence/MonthlyDirectionFocusPersistence.test.ts`
- Modify: `src/infrastructure/persistence/mappers/index.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`
- Modify: `src/application/sync/SyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`
- Modify: `src/infrastructure/sync/pilot/StructuredSyncFixtures.ts`

**Interfaces:**

- Consumes: Task 1 domain validator and repository port.
- Produces: IndexedDB store `monthlyDirectionFocuses` in schema version 30.
- Produces: sync entity `monthly_direction_focus` with optional `direction` dependency.

- [ ] **Step 1: Write failing persistence, schema and sync tests**

Assert round-trip, latest-before ordering, stale-version conflict, v29→v30 additive upgrade,
registry identity, mapper round-trip and optional direction reference.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test:target -- src/infrastructure/persistence/MonthlyDirectionFocusPersistence.test.ts src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`\
Expected: FAIL on the absent store, repository and sync registration.

- [ ] **Step 3: Implement repository, schema v30 and sync registration**

Use an IndexedDB readwrite transaction for compare-and-save. Register deterministic period
identity and an optional `directionId` relationship; add the real domain-built fixture.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.\
Expected: all selected tests pass.

### Task 3: Composition and Today focus card

**Files:**

- Create: `src/presentation/planner-v2/MonthlyDirectionFocusCard.tsx`
- Create: `src/presentation/planner-v2/MonthlyDirectionFocusCard.test.tsx`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/presentation/planner-v2/PlannerWorkspace.tsx`
- Modify: `src/presentation/planner-v2/PlannerToday.tsx`
- Modify: `src/presentation/planner-v2/PlannerToday.test.tsx`
- Modify: `src/presentation/planner-v2/planner-premium.css`

**Interfaces:**

- Consumes: Task 1 service state and Task 2 repository.
- Produces: `MonthlyDirectionFocusCard` props for month label, current selection, suggestion,
  active choices, busy state and `onChange(directionId)`.

- [ ] **Step 1: Write failing render tests**

Assert active direction hierarchy, empty copy, previous-month confirmation, unavailable saved
choice, select accessibility, and unchanged action ordering.

- [ ] **Step 2: Run render tests and verify RED**

Run: `npm run test:target -- src/presentation/planner-v2/MonthlyDirectionFocusCard.test.tsx src/presentation/planner-v2/PlannerToday.test.tsx`\
Expected: FAIL because the focus card contract is absent.

- [ ] **Step 3: Implement composition, loading and the responsive card**

Load the service with `currentDate` for both Today and Tomorrow subviews, resolve names from all
directions, pass only active choices, write through `run`, and subscribe to
`monthlyDirectionFocuses` sync changes. Remove Today UI writes to `DailyDirection`.

- [ ] **Step 4: Run render and composition-adjacent tests and verify GREEN**

Run: `npm run test:target -- src/presentation/planner-v2/MonthlyDirectionFocusCard.test.tsx src/presentation/planner-v2/PlannerToday.test.tsx src/app/composition/createLifeOsApplication.test.ts`\
Expected: selected tests pass; if the named composition test does not exist, use the nearest
existing create-application integration test recorded in the ledger.

### Task 4: Scoped browser behavior and final gate

**Files:**

- Modify: `tests/e2e/current.daily-workflow.spec.ts`

**Interfaces:**

- Consumes: Tasks 1–3 complete behavior.
- Produces: browser evidence for selection, persistence and shared monthly value.

- [ ] **Step 1: Update the existing direction E2E to the approved monthly behavior**

Select a direction in Today, verify the success notice and focus-card label, switch to Tomorrow,
reload, and assert the same value. Clear it and assert the empty state. Do not assert per-day
independence.

- [ ] **Step 2: Run scoped E2E on desktop and mobile**

Run: `npm run test:e2e -- tests/e2e/current.daily-workflow.spec.ts --grep "monthly main direction"`\
Expected: the selected scenario passes in both configured projects with no page errors.

- [ ] **Step 3: Run the project gate without full E2E**

Run: `npm run verify`\
Expected: typecheck, lint, unit/integration, infrastructure, alpha, build, format and Git hygiene
all pass.

- [ ] **Step 4: Perform manual desktop/mobile visual review**

Check `#/v2/today` at 1440×900 and 390×844 for active, empty and suggestion states; confirm focus,
44 px controls, no overflow and a clean browser console.

- [ ] **Step 5: Inspect the final patch**

Run: `git diff --check`, `git diff --stat`, `git diff --name-status`, `git status --short`.\
Expected: no whitespace errors; pre-existing dirty work remains intact and is reported separately.
