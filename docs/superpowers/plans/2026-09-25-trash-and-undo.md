# Trash and Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace irreversible deletion of goals, standalone actions and recurring series with a synchronized 30-day trash, immediate undo, restore and permanent purge.

**Architecture:** Keep each entity in its authoritative store and represent deletion as versioned domain state. Application commands own delete, restore, retention and dependency checks; IndexedDB repositories atomically persist entity mutations and sync outbox records. A read-only `TrashCatalog` combines deleted records for the UI without copying their payloads.

**Tech Stack:** TypeScript, React, IndexedDB, Vitest, Testing Library, Playwright, existing Pilot sync/outbox infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-25-trash-and-undo-design.md`

## Global Constraints

- Preserve the layer direction UI → Presentation → Application → Domain; infrastructure implements application ports.
- Keep existing dependency validation authoritative and do not cascade-delete user data.
- Treat completed, archived and deleted as independent states.
- All normal projections exclude deleted entities; raw dependency and sync readers may still see them.
- Use existing `Clock`, `CurrentDateProvider`, `IdGenerator`, mutation recorder and Pilot conflict rules.
- Preserve all unrelated dirty worktree changes. Do not rewrite or revert Quick Access, weekly review or filter work.
- Implement each behavior test-first and run only bounded commands from `docs/codex/TEST_MATRIX.md`.

## Review Focus

- A successful move, restore or purge and its sync outbox mutation commit atomically.
- Restore preserves identifiers, lifecycle state, links and completed history.
- A removed or purged recurrence never materializes; a restored series cannot collide with historical occurrence ids.
- Every active projection, selector and Quick Access excludes deleted records.
- The 30-day boundary uses the user's local calendar date and legacy removed rules receive a fresh grace period.
- Permanent purge tombstones dominate stale offline upserts.

---

## Task 1: Add soft-delete lifecycle to goals

**Files:**

- Modify: `src/domain/goal/Goal.ts`
- Modify: `src/domain/goal/Goal.test.ts`
- Modify: `src/infrastructure/persistence/records/GoalRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/GoalRecordMapper.ts`
- Add: `src/infrastructure/persistence/mappers/GoalRecordMapper.test.ts`

**Interfaces:**

- Consumes: existing `Goal.rehydrate(data: GoalRehydrationData): Goal` and `GoalRecordMapper`.
- Produces: `Goal.softDelete(at: Date): Goal`, `Goal.restoreFromTrash(at: Date): Goal`, `Goal.isDeleted(): boolean`, and nullable date getters.

```ts
const deleted = goal.softDelete(new Date('2026-09-25T10:00:00.000Z'));
expect(deleted.isDeleted()).toBe(true);
expect(deleted.status).toBe(goal.status);
expect(deleted.version).toBe(goal.version + 1);

const restored = deleted.restoreFromTrash(new Date('2026-09-26T10:00:00.000Z'));
expect(restored.isDeleted()).toBe(false);
expect(restored.lastDeletedAt).toEqual(deleted.deletedAt);
```

- [ ] Add failing domain tests proving `softDelete(at)` sets `deletedAt` and `lastDeletedAt`, preserves status/stage/links, increments version, and rejects repeated deletion with `goal.already_deleted`.
- [ ] Add failing tests proving `restoreFromTrash(at)` clears `deletedAt`, preserves `lastDeletedAt`, sets `restoredFromTrashAt`, increments version, and rejects an active goal with `goal.not_deleted`.
- [ ] Extend `GoalRehydrationData`, `Goal` getters and `toRehydrationData()` with nullable `deletedAt`, `lastDeletedAt`, `restoredFromTrashAt`; default absent legacy fields to `null`.
- [ ] Add the three optional nullable ISO fields to `GoalRecord` and round-trip them in `GoalRecordMapper` using the same date readers used by `DecisionRecordMapper`.
- [ ] Add mapper tests for deleted/restored round trips and a legacy record with all three fields absent.
- [ ] Run `npm run test:target -- src/domain/goal/Goal.test.ts src/infrastructure/persistence/mappers/GoalRecordMapper.test.ts`.
- [ ] Commit: `feat: add goal trash lifecycle`.

## Task 2: Add soft-delete lifecycle to standalone actions

**Files:**

- Modify: `src/domain/life-action/LifeAction.ts`
- Modify: `src/domain/life-action/LifeAction.test.ts`
- Modify: `src/domain/life-action/LifeActionRehydrate.test.ts`
- Modify: `src/infrastructure/persistence/records/LifeActionRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/LifeActionRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/LifeActionRecordMapper.test.ts`
- Modify: `src/test/helpers/LifeActionTestFactory.ts`

**Interfaces:**

- Consumes: mutable aggregate methods and `LifeActionRehydrationData`.
- Produces: `softDelete(at: Date): void`, `restoreFromTrash(at: Date): void`, `isDeleted(): boolean`, and nullable date getters on `LifeAction`.

```ts
action.softDelete(new Date('2026-09-25T10:00:00.000Z'));
expect(action.isDeleted()).toBe(true);
expect(action.status).toBe('ready');
expect(action.plannedDate?.toString()).toBe('2026-09-26');

action.restoreFromTrash(new Date('2026-09-26T10:00:00.000Z'));
expect(action.isDeleted()).toBe(false);
expect(action.restoredFromTrashAt?.toISOString()).toBe('2026-09-26T10:00:00.000Z');
```

- [ ] Add failing tests for delete, restore, repeated operations, timestamps, version increments and preservation of status, archive state, planned date, result and relationships.
- [ ] Extend `LifeActionRehydrationData`, private fields, getters and serialization with nullable `deletedAt`, `lastDeletedAt`, `restoredFromTrashAt`; legacy values default to `null`.
- [ ] Implement `softDelete(at)` and `restoreFromTrash(at)` with `life_action.already_deleted` and `life_action.not_deleted` domain errors.
- [ ] Extend `LifeActionRecord` and mapper with optional nullable ISO fields and update the shared test factory.
- [ ] Add mapper tests for deleted/restored round trips and absent legacy fields.
- [ ] Run `npm run test:target -- src/domain/life-action/LifeAction.test.ts src/domain/life-action/LifeActionRehydrate.test.ts src/infrastructure/persistence/mappers/LifeActionRecordMapper.test.ts`.
- [ ] Commit: `feat: add action trash lifecycle`.

## Task 3: Make recurrence deletion reversible and collision-safe

**Files:**

- Modify: `src/domain/planner/RecurrenceRule.ts`
- Add: `src/domain/planner/RecurrenceRule.test.ts`
- Modify: `src/domain/life-action/LifeAction.ts`
- Modify: `src/application/planner/RecurringActions.ts`
- Modify: `src/infrastructure/persistence/planning-tests/RecurringActions.test.ts`
- Modify: `src/infrastructure/persistence/PlanningRecordMappers.ts`

**Interfaces:**

- Consumes: `RecurringActions.remove(ruleId: string)` and `occurrenceSlots(...)`.
- Produces: `RecurringActions.restore(ruleId: string): Promise<void>` and generation-aware `ActionOccurrence`.

```ts
interface ActionOccurrence {
  readonly ruleId: string;
  readonly slot: string;
  readonly ruleRevision: number;
  readonly restorationGeneration?: number;
  readonly originalDate: string;
  readonly manualDate?: boolean;
}

interface RecurrenceRule {
  readonly removedAt?: string | null;
  readonly lastRemovedAt?: string | null;
  readonly restoredFromTrashAt?: string | null;
  readonly purgedAt?: string | null;
  readonly restorationGeneration?: number;
}
```

Generation zero keeps `occurrence:<rule>:<slot>`; later generations use
`occurrence:<rule>:generation:<n>:<slot>`.

- [ ] Add failing rule tests for `lastRemovedAt`, `restoredFromTrashAt`, `purgedAt`, non-negative integer `restorationGeneration`, and legacy defaults.
- [ ] Add failing occurrence tests proving generation `0` keeps existing ids and generation `1+` is included in ids and `ActionOccurrence` metadata.
- [ ] Extend `RecurrenceRule` validation and recurrence mapper fields without changing existing generation-zero identities.
- [ ] Change `RecurringActions.remove` to set the trash timestamp and archive/cancel unfinished occurrences while preserving completed history.
- [ ] Add `RecurringActions.restore(ruleId)` that rejects purged/active rules, clears `removedAt`, records restoration timestamps, increments generation/revision/version and sets `effectiveFrom` to `CurrentDateProvider.currentDate()`.
- [ ] Make occurrence materialization include the generation and ignore removed or purged rules.
- [ ] Add persistence tests for restore from today, prior skips, completed history and non-collision with cancelled historical occurrences.
- [ ] Run `npm run test:target -- src/domain/planner/RecurrenceRule.test.ts src/infrastructure/persistence/planning-tests/RecurringActions.test.ts`.
- [ ] Commit: `feat: restore recurring series from trash`.

## Task 4: Define trash application contracts and commands

**Files:**

- Add: `src/application/trash/TrashItem.ts`
- Add: `src/application/trash/TrashRepository.ts`
- Add: `src/application/trash/TrashDependencyPolicy.ts`
- Add: `src/application/trash/MoveGoalToTrash.ts`
- Add: `src/application/trash/MoveLifeActionToTrash.ts`
- Add: `src/application/trash/RestoreTrashItem.ts`
- Add: `src/application/trash/TrashCatalog.ts`
- Add: `src/application/trash/TrashCommands.test.ts`
- Add: `src/application/trash/TrashCatalog.test.ts`
- Modify: `src/application/ports/GoalRepository.ts`
- Modify: `src/application/ports/LifeActionRepository.ts`

**Interfaces:**

- Consumes: the goal/action lifecycle from Tasks 1–2 and `RecurringActions.restore` from Task 3.
- Produces the shared application contract below.

```ts
export type TrashItemType = 'goal' | 'action' | 'series';
export type TrashFilter = 'all' | 'goals' | 'actions' | 'series';
export interface TrashItem {
  readonly type: TrashItemType;
  readonly id: string;
  readonly title: string;
  readonly deletedAt: Date;
  readonly purgeAt: string;
}
export interface TrashRepository {
  findGoalIncludingDeleted(id: EntityId): Promise<Goal | null>;
  findActionIncludingDeleted(id: EntityId): Promise<LifeAction | null>;
  listDeletedGoals(): Promise<readonly Goal[]>;
  listDeletedActions(): Promise<readonly LifeAction[]>;
  listRemovedSeries(): Promise<readonly RecurrenceRule[]>;
}
export interface TrashDependencyPolicy {
  assertCanMove(type: TrashItemType, id: string): Promise<void>;
  assertCanRestore(type: TrashItemType, id: string): Promise<void>;
}
```

The contract test uses a fixed clock and asserts `await catalog.list('all')` returns `series`,
`action`, `goal` in descending `deletedAt` order with a purge date 30 local calendar days later.

- [ ] Define discriminated `TrashItem` variants for `goal`, `action` and `series` with `id`, `title`, `deletedAt` and `purgeAt`.
- [ ] Define repository reads that explicitly distinguish active reads from `findIncludingDeleted`/trash reads, so presentation cannot bypass visibility rules.
- [ ] Add failing command tests for dependency blocking, idempotent replay, missing entities, wrong type and relationship conflicts during restore.
- [ ] Implement move commands using `Clock` and the shared dependency policy; reject recurring occurrences as standalone trash items.
- [ ] Implement one `RestoreTrashItem.execute({ type, id })` dispatcher that reloads the authoritative entity and invokes its domain restore operation.
- [ ] Add failing catalog tests for type filters, deletion-descending order and local calendar purge dates.
- [ ] Implement `TrashCatalog.list('all' | 'goals' | 'actions' | 'series')` as a read-only combined projection.
- [ ] Run `npm run test:target -- src/application/trash/TrashCommands.test.ts src/application/trash/TrashCatalog.test.ts`.
- [ ] Commit: `feat: add trash application services`.

## Task 5: Persist trash mutations atomically with Pilot sync

**Files:**

- Modify: `src/infrastructure/persistence/IndexedDbGoalRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbLifeActionRepository.ts`
- Modify: `src/infrastructure/persistence/IndexedDbPlanningRepository.ts`
- Add: `src/infrastructure/persistence/IndexedDbTrashRepository.ts`
- Add: `src/infrastructure/persistence/IndexedDbTrashRepository.test.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`
- Modify: `src/infrastructure/sync/pilot/StructuredSyncApply.test.ts`

**Interfaces:**

- Consumes: `TrashRepository` and the existing `IndexedDbPilotMutationRecorder` transaction API.
- Produces: `IndexedDbTrashRepository implements TrashRepository`; active repositories never return deleted entities.

```ts
const active = await goals.findById(id('deleted-goal'));
const raw = await trash.findGoalIncludingDeleted(id('deleted-goal'));
expect(active).toBeNull();
expect(raw?.isDeleted()).toBe(true);
```

Failure injection aborts the transaction after the entity `put` but before the outbox `add`; the
test then asserts both the prior entity version and the prior outbox count remain unchanged.

- [ ] Add failing repository tests proving active `findById`/`findAll` exclude deleted records while explicit trash/raw reads include them.
- [ ] Add failure-injection tests proving entity and outbox writes either both commit or both abort for move and restore.
- [ ] Implement explicit raw/trash reads without weakening active repository visibility.
- [ ] Implement `IndexedDbTrashRepository` over existing stores and the existing planning store; do not add a copied trash store.
- [ ] Extend Pilot mappers/normalizers to carry all trash and recurrence generation fields.
- [ ] Add sync apply tests for delete then restore ordering and stale older upserts.
- [ ] Run `npm run test:target -- src/infrastructure/persistence/IndexedDbTrashRepository.test.ts src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts src/infrastructure/sync/pilot/StructuredSyncApply.test.ts`.
- [ ] Commit: `feat: persist synchronized trash state`.

## Task 6: Add permanent purge and retention maintenance

**Files:**

- Add: `src/application/trash/PurgeTrashItem.ts`
- Add: `src/application/trash/MaintainTrashRetention.ts`
- Add: `src/application/trash/TrashRetention.test.ts`
- Modify: `src/infrastructure/sync/pilot/IndexedDbPilotDeleteRepository.ts`
- Modify: `src/infrastructure/sync/pilot/IndexedDbPilotDeleteRepository.test.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`

**Interfaces:**

- Consumes: raw trash reads plus the existing physical-delete/tombstone repository.
- Produces: `PurgeTrashItem.execute(item: Pick<TrashItem, 'type' | 'id'>): Promise<void>` and `MaintainTrashRetention.execute(limit?: number): Promise<TrashMaintenanceResult>`.

```ts
export interface TrashMaintenanceResult {
  readonly examined: number;
  readonly purged: number;
  readonly failed: readonly { type: TrashItemType; id: string; code: string }[];
}

await maintain.execute(25);
expect(await catalog.list('all')).toEqual([]);
expect(syncTombstone.objectId).toBe('goal-expired');
```

At `deletedAt + 29` local calendar days the item remains; at the start of day 30 it is eligible.

- [ ] Add failing tests for the exact 30-calendar-day local boundary, a bounded batch, per-item failure isolation and retry on the next run.
- [ ] Add failing tests that a goal/action purge uses the existing atomic physical-delete+tombstone transaction and that a stale sync upsert cannot resurrect it.
- [ ] Add failing tests that a recurrence purge sets `purgedAt`, removes it from trash and preserves only the historical record needed by completed occurrences.
- [ ] Add an additive IndexedDB migration field/state for `trashRetentionEligibleAt` so legacy removed rules receive a new 30-day grace period on first compatible open.
- [ ] Implement `PurgeTrashItem` and `MaintainTrashRetention` with a fixed bounded batch size and aggregate diagnostics.
- [ ] Run `npm run test:target -- src/application/trash/TrashRetention.test.ts src/infrastructure/sync/pilot/IndexedDbPilotDeleteRepository.test.ts src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`.
- [ ] Commit: `feat: purge expired trash safely`.

## Task 7: Enforce deleted visibility in every projection

**Files:**

- Modify: `src/application/queries/GetGoals.ts`
- Modify: `src/application/planner/PlannerCatalog.ts`
- Modify: `src/application/planner/PlannerFocus.ts`
- Modify: `src/application/planner/PlannerInbox.ts`
- Modify: `src/application/planner/QuickAccessCatalog.ts`
- Modify: `src/application/planner/QuickAccessCatalog.test.ts`
- Modify: `src/presentation/planner-v2/plannerViewsModel.ts`
- Modify: `src/presentation/planner-v2/plannerViewsModel.test.ts`
- Modify: `src/presentation/planner-v2/plannerCatalogModel.test.ts`

**Interfaces:**

- Consumes: active repository/catalog reads established in Task 5.
- Produces: the invariant that deleted entities cannot reach `PlannerCatalog`, `GetGoals`, view models or Quick Access.

```ts
const result = await readQuickAccessCatalog(readersContainingDeletedFixtures);
expect(result.some((item) => item.id === 'deleted-goal')).toBe(false);
expect(result.some((item) => item.id === 'deleted-action')).toBe(false);
```

- [ ] Add regression fixtures containing deleted goals/actions and removed/purged series.
- [ ] Assert they never appear in lists, Today, focus, inbox, calendar, kanban, tree, selectors, contribution calculations or Quick Access.
- [ ] Centralize filtering at repository/catalog boundaries; retain defensive filtering only at cross-version sync or legacy boundaries where required.
- [ ] Verify completed-but-active records remain available only through their existing completed filters.
- [ ] Run `npm run test:target -- src/application/planner/QuickAccessCatalog.test.ts src/presentation/planner-v2/plannerViewsModel.test.ts src/presentation/planner-v2/plannerCatalogModel.test.ts`.
- [ ] Run `npm run test:fast` because the shared planner read contract changed.
- [ ] Commit: `fix: exclude trash from active projections`.

## Task 8: Compose services, route and startup maintenance

**Files:**

- Modify: `src/application/planner/PlanningServices.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`
- Modify: `src/app/lifecycle/PilotSyncLifecycle.ts`
- Modify: `src/app/lifecycle/PilotSyncLifecycle.test.ts`
- Modify: `src/presentation/planner-v2/PlannerNavigation.ts`
- Modify: `src/presentation/planner-v2/PlannerNavigation.test.ts`
- Modify: `src/presentation/navigation/ApplicationRoute.test.ts`

**Interfaces:**

- Consumes: Tasks 4–6 application services.
- Produces: `LifeOsApplication.trash: TrashServices` and `{ readonly view: 'trash' }` route support.

```ts
export interface TrashServices {
  readonly catalog: TrashCatalog;
  readonly moveGoal: MoveGoalToTrash;
  readonly moveAction: MoveLifeActionToTrash;
  readonly restore: RestoreTrashItem;
  readonly purge: PurgeTrashItem;
  readonly maintain: MaintainTrashRetention;
}

expect(parsePlannerRoute('#/v2/trash')).toEqual({ view: 'trash' });
expect(buildPlannerRoute({ view: 'trash' })).toBe('#/v2/trash');
```

- [ ] Add failing composition tests for `trash.catalog`, `trash.moveGoal`, `trash.moveAction`, `trash.restore`, `trash.purge` and `trash.maintain`.
- [ ] Add route round-trip tests for `{ view: 'trash' }` ↔ `#/v2/trash`.
- [ ] Add lifecycle tests proving bounded maintenance runs once during startup, reports failures without blocking application readiness and also remains callable when trash opens.
- [ ] Wire repositories and commands in `createLifeOsApplication` and expose a typed trash service on `LifeOsApplication`.
- [ ] Run `npm run test:target -- src/app/composition/createLifeOsApplication.test.ts src/app/lifecycle/PilotSyncLifecycle.test.ts src/presentation/planner-v2/PlannerNavigation.test.ts src/presentation/navigation/ApplicationRoute.test.ts`.
- [ ] Commit: `feat: compose trash route and maintenance`.

## Task 9: Build the trash page and immediate undo

**Files:**

- Add: `src/presentation/planner-v2/TrashPage.tsx`
- Add: `src/presentation/planner-v2/TrashPage.test.tsx`
- Modify: `src/presentation/planner-v2/PlannerWorkspace.tsx`
- Modify: `src/presentation/planner-v2/PlannerLibraryWorkspace.tsx`
- Modify: `src/presentation/planner-v2/PlannerLibrary.test.tsx`
- Modify: `src/presentation/planner-v2/planner-library.css`
- Modify: `src/presentation/planner-v2/planner-premium.css`
- Modify: `src/presentation/components/AppIcon.tsx`

**Interfaces:**

- Consumes: `TrashServices`, `PlannerRoute` and existing dialog/notice primitives.
- Produces: `TrashPage` and delete handlers returning a committed `TrashReceipt` for undo.

```ts
export interface TrashReceipt {
  readonly type: TrashItemType;
  readonly id: string;
}
export interface TrashPageProps {
  readonly services: TrashServices;
  readonly onNavigate: (route: PlannerRoute) => void;
}
```

The render test clicks `Восстановить цель <title>`, asserts only that row becomes disabled, then
asserts focus moves to the next row after the committed restore removes it.

- [ ] Add render tests for loading, empty, error/retry, four filters, deletion order, per-row busy state, expired refresh, accessible labels and focus movement.
- [ ] Implement the standard catalog page using current workspace shell, filter controls, confirmation dialog and notice patterns.
- [ ] Put permanent delete in the row menu on mobile; ensure interactive targets are at least 44 px and metadata stacks at narrow widths.
- [ ] Replace goal/action/whole-series destructive handlers with move-to-trash commands and the new reversible confirmation copy.
- [ ] Add an eight-second status notice whose `Отменить` action calls `RestoreTrashItem` with the committed `{ type, id }` receipt; only show success after commit.
- [ ] Add `Корзина` under `Ещё` and render `TrashPage` for the new route.
- [ ] Run `npm run test:target -- src/presentation/planner-v2/TrashPage.test.tsx src/presentation/planner-v2/PlannerLibrary.test.tsx`.
- [ ] Commit: `feat: add trash page and undo notice`.

## Task 10: Verify sync, recovery and database reopening

**Files:**

- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`
- Modify: `src/infrastructure/sync/IndexedDbSnapshotService.ts`
- Modify: `src/infrastructure/sync/IndexedDbSnapshotService.test.ts`
- Modify: `src/infrastructure/sync/recovery/IndexedDbRecoveryStore.ts`
- Modify: `src/infrastructure/sync/recovery/IndexedDbRecoveryStore.test.ts`
- Modify: `src/application/sync/pilot/PilotSyncProtocol.test.ts`

**Interfaces:**

- Consumes: versioned upserts for all trash fields and existing Pilot tombstones.
- Produces: registry/snapshot/recovery coverage; no new public runtime API.

```ts
await protocol.apply(restoredUpsert);
await protocol.apply(olderDeletedUpsert);
expect((await trash.findGoalIncludingDeleted(id('g-1')))?.isDeleted()).toBe(false);

await protocol.apply(purgeTombstone);
await protocol.apply(staleRestoreUpsert);
expect(await trash.findGoalIncludingDeleted(id('g-1'))).toBeNull();
```

- [ ] Add tests that snapshots, account recovery and local reset retain or remove trash fields according to the existing entity registry.
- [ ] Add protocol tests for move/restore convergence, purge tombstone dominance and offline stale upsert rejection.
- [ ] Reopen an upgraded database and verify active/trash reads plus legacy recurrence grace state.
- [ ] Run `npm run test:target -- src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/IndexedDbSnapshotService.test.ts src/infrastructure/sync/recovery/IndexedDbRecoveryStore.test.ts src/application/sync/pilot/PilotSyncProtocol.test.ts`.
- [ ] Commit: `test: cover trash sync and recovery`.

## Task 11: Scoped browser acceptance and final gates

**Files:**

- Add: `tests/e2e/current.trash.spec.ts`
- Update implementation files only for defects demonstrated by the checks below.

**Interfaces:**

- Consumes: the complete `TrashServices` UI flow.
- Produces: browser evidence and final gate evidence; no new product interface.

```ts
await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
await page.getByRole('button', { name: 'Переместить в корзину', exact: true }).click();
await expect(page.getByRole('status')).toContainText('Перемещено в корзину');
await page.getByRole('link', { name: 'Корзина', exact: true }).click();
await expect(page.getByRole('button', { name: /Восстановить цель/ })).toBeVisible();
```

- [ ] Add desktop and mobile scenarios for goal, standalone action and full-series deletion; disappearance from active list/calendar/tree/kanban; immediate undo; trash filters; restore; reload persistence; permanent purge; expiry and keyboard/focus behavior.
- [ ] Run `npm run test:e2e -- tests/e2e/current.trash.spec.ts` and confirm both configured desktop/mobile projects execute rather than skip.
- [ ] Run `npm run verify` once after the implementation stabilizes.
- [ ] Run full `npm run test:e2e` because this release changes a shared IndexedDB migration plus sync/startup behavior for multiple entity families; scoped UI scenarios cannot cover all existing startup, recovery and account-sync flows.
- [ ] Perform manual browser QA at 1440 px, 390 px and 320 px: page layout, row menus, dialog focus trap, Escape/return focus, status and alert announcements, reduced motion and browser console.
- [ ] Run `git diff --check`, review `git diff`, `git diff --stat`, `git diff --name-status` and `git status --short`; separate pre-existing dirty changes in the handoff.
- [ ] Request one read-only final review focused on architecture, retention boundary, recurrence identity and evidence from the gates.
- [ ] Commit: `feat: deliver synchronized trash and undo`.
