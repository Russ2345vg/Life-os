# WALK-07 Persistent Reentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one explainable post-walk action inside the existing `Walk`, restore pending Reentry after reload without blocking LifeOS, and resolve or close it explicitly before navigation.

**Architecture:** `Walk` remains the only execution aggregate and receives a nullable Reentry value state. `RecordWalkOutcome` resolves and stores one action in the same optimistic update as the outcome; application queries and commands restore and resolve that state through the existing `WalkRepository`. App and Presentation expose a non-blocking reminder plus the existing Reentry screen without mutating Routine, Decision, Goal, Project, LifeAction, or Today.

**Tech Stack:** TypeScript 6 strict mode, React 19, Vitest, IndexedDB/fake-indexeddb, Playwright, Vite, existing LifeOS CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-walk-07-reentry-lifecycle-design.md`

## Global Constraints

- Work only in `C:\LifeOS-App`; confirm `git rev-parse --show-toplevel` and `git status --short` before edits.
- Preserve all cumulative WALK-01—05 changes and unrelated user changes; do not use destructive Git.
- `Walk` remains the only aggregate, `WalkRepository` remains the only persistence port, and IndexedDB keeps the current Walk record schema version.
- Dependencies continue `UI → Presentation → Application → Domain`; Domain must not import React, browser APIs, Application, Infrastructure, or Presentation.
- Do not use `any`, add dependencies, create a new store, create a new repository, or write subject state directly from React.
- Do not mutate Routine, Decision, Goal, Project, LifeAction, Today, or user data outside the selected Walk.
- Old Walk records without Reentry must load with `reentry = null` and must never become pending automatically.
- Pending Reentry must not override active-walk recovery, Routine deep links, Evening startup, or the current application section.
- Use graphite/gold/green LifeOS styling, no persistent purple accent, minimum 44 px touch targets, and no mobile horizontal overflow.
- Implement every behavior RED → GREEN and keep the existing Walk submission guard.
- The current worktree already contains overlapping cumulative changes, so task-level commits are unsafe. End each task with tests and a diff checkpoint; create an implementation commit only after a separate cumulative review and explicit user instruction.
- Never add `.codex-temp/` to Git.

---

### Task 1: Add the Reentry value model and Walk lifecycle

**Files:**

- Create: `src/domain/walk/WalkReentry.ts`
- Modify: `src/domain/walk/Walk.ts`
- Modify: `src/domain/walk/Walk.test.ts`
- Modify: `src/domain/walk/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Consumes: existing `WalkReturnOrigin`, `WalkLinkedEntity`, `Walk.status`, `Walk.impact`, and optimistic `version` semantics.
- Produces: `WALK_REENTRY_STATUS`, `WALK_REENTRY_ACTION_KIND`, `WalkReentryAction`, `WalkReentry`, `Walk.reentry`, `Walk.completeReentry(resolvedAt)`, and `Walk.closeReentry(resolvedAt)`.

- [ ] **Step 1: Write failing domain tests for the new constants and pending creation**

Add tests that import the future public symbols and expect outcome recording to create pending Reentry atomically:

```ts
const recorded = completed.recordOutcome({
  afterState: { energy: 7, tension: 2, clarity: 8 },
  impact: WALK_IMPACT.better,
  reflection: 'Стало понятнее, с чего начать.',
  reentryAction: {
    kind: WALK_REENTRY_ACTION_KIND.today,
    destination: WALK_RETURN_ORIGIN.today,
    entity: null,
    nextStep: null,
  },
  updatedAt: new Date('2026-08-25T10:30:00.000Z'),
});

expect(recorded.reentry).toEqual({
  status: WALK_REENTRY_STATUS.pending,
  action: {
    kind: WALK_REENTRY_ACTION_KIND.today,
    destination: WALK_RETURN_ORIGIN.today,
    entity: null,
    nextStep: null,
  },
  preparedAt: new Date('2026-08-25T10:30:00.000Z'),
  resolvedAt: null,
});
expect(recorded.version).toBe(completed.version + 1);
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```powershell
npm run test -- src/domain/walk/Walk.test.ts
```

Expected: FAIL because `WalkReentry`, `reentryAction`, and `Walk.reentry` do not exist.

- [ ] **Step 3: Implement focused Reentry value types and guards**

Create `WalkReentry.ts` with these public contracts:

```ts
import type { WalkLinkedEntity, WalkReturnOrigin } from './WalkContext';

export const WALK_REENTRY_STATUS = {
  pending: 'pending',
  completed: 'completed',
  closedWithoutContinuation: 'closedWithoutContinuation',
} as const;

export const WALK_REENTRY_ACTION_KIND = {
  recovery: 'recovery',
  reviewResult: 'reviewResult',
  resumeContext: 'resumeContext',
  today: 'today',
} as const;

export type WalkReentryStatus = (typeof WALK_REENTRY_STATUS)[keyof typeof WALK_REENTRY_STATUS];
export type WalkReentryActionKind =
  (typeof WALK_REENTRY_ACTION_KIND)[keyof typeof WALK_REENTRY_ACTION_KIND];

export interface WalkReentryAction {
  readonly kind: WalkReentryActionKind;
  readonly destination: WalkReturnOrigin;
  readonly entity: WalkLinkedEntity | null;
  readonly nextStep: string | null;
}

export interface WalkReentry {
  readonly status: WalkReentryStatus;
  readonly action: WalkReentryAction;
  readonly preparedAt: Date;
  readonly resolvedAt: Date | null;
}
```

Add runtime guards that reject unknown status/kind/origin, malformed linked entities, invalid `nextStep`, non-Date timestamps, `pending` with non-null `resolvedAt`, and terminal states with null `resolvedAt`. Copy nested entity ids, dates, and action data when assigning to `Walk`.

- [ ] **Step 4: Extend `Walk` without creating a second aggregate**

Add optional `reentry?: WalkReentry | null` to `WalkRehydrationData`, `reentryAction` to `WalkOutcomeData`, and `readonly reentry: WalkReentry | null` to `Walk`. New Walks start with `reentry: null`; legacy rehydration defaults missing data to null.

Make `recordOutcome` set pending Reentry in the same `new Walk(...)` call:

```ts
reentry: {
  status: WALK_REENTRY_STATUS.pending,
  action: data.reentryAction,
  preparedAt: data.updatedAt,
  resolvedAt: null,
},
```

Implement explicit terminal transitions:

```ts
public completeReentry(resolvedAt: Date): Walk;
public closeReentry(resolvedAt: Date): Walk;
```

Both methods must require `status === completed` and `reentry.status === pending`, validate `resolvedAt >= preparedAt`, preserve session/outcome fields, set `updatedAt/resolvedAt`, and increment `version`. Reject repeated or absent Reentry with `walk.reentry_not_pending`.

- [ ] **Step 5: Add lifecycle and invariant tests**

Cover:

```ts
expect(recorded.completeReentry(DONE_AT).reentry).toMatchObject({
  status: WALK_REENTRY_STATUS.completed,
  resolvedAt: DONE_AT,
});
expect(recorded.closeReentry(DONE_AT).reentry).toMatchObject({
  status: WALK_REENTRY_STATUS.closedWithoutContinuation,
  resolvedAt: DONE_AT,
});
expect(() => terminal.completeReentry(LATER)).toThrowError(
  expect.objectContaining({ code: 'walk.reentry_not_pending' }),
);
```

Also test legacy `reentry: undefined → null`, defensive copying, invalid timestamps, terminal/null mismatches, and unchanged `endedAt`, pauses, impact, result, and actual duration.

- [ ] **Step 6: Export and verify the domain contract**

Export every new constant, guard, and type from `src/domain/walk/index.ts` and `src/domain/index.ts` without duplicate names.

Run:

```powershell
npm run test -- src/domain/walk/Walk.test.ts
npm run typecheck
git diff --check
```

Expected: domain tests PASS, typecheck PASS, whitespace check PASS.

---

### Task 2: Resolve one explainable action and record it atomically with outcome

**Files:**

- Create: `src/application/walk/WalkReentryPolicy.ts`
- Create: `src/application/walk/WalkReentryPolicy.test.ts`
- Modify: `src/application/commands/RecordWalkOutcome.ts`
- Modify: `src/application/commands/RecordWalkOutcome.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: `Walk`, `WalkImpact`, `WalkReentryAction`, `WalkLinkedEntity`, `WalkReturnContext`, and Task 1's `reentryAction` input.
- Produces: `resolveWalkReentryAction(walk, outcome): WalkReentryAction`; `RecordWalkOutcome` persists outcome plus pending Reentry in one optimistic update.

- [ ] **Step 1: Write failing policy tests for all four priorities**

Use completed Walk fixtures and assert exact objects:

```ts
expect(
  resolveWalkReentryAction(walk, {
    impact: WALK_IMPACT.worse,
    reflection: 'Есть вывод, но стало хуже.',
  }),
).toEqual({
  kind: WALK_REENTRY_ACTION_KIND.recovery,
  destination: WALK_RETURN_ORIGIN.today,
  entity: null,
  nextStep: null,
});
```

Add cases for:

- non-empty result plus Decision/Goal/Project entity → `reviewResult` and matching destination;
- normal `returnContext` → `resumeContext`, preserving entity and trimmed `nextStep`;
- no usable context → `today`;
- lifeAction/routine link without `returnContext` → `today`;
- whitespace-only reflection → no `reviewResult`;
- `worse` always wins.

- [ ] **Step 2: Run policy tests and verify RED**

Run:

```powershell
npm run test -- src/application/walk/WalkReentryPolicy.test.ts
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the pure application policy**

Use this exact signature:

```ts
export interface WalkReentryOutcomeInput {
  readonly impact: WalkImpact;
  readonly reflection?: string;
}

export function resolveWalkReentryAction(
  walk: Walk,
  outcome: WalkReentryOutcomeInput,
): WalkReentryAction;
```

Implement explicit branches only. For `reviewResult`, choose the candidate entity as `walk.returnContext?.entity ?? walk.linkedEntity`; accept it only when its type is `decision`, `goal`, or `project`, then map that type to the matching `WalkReturnOrigin`. Never inspect text contents beyond `trim().length > 0`; never load another repository.

- [ ] **Step 4: Update the failing command test for atomic persistence**

Extend the existing `RecordWalkOutcome` expectation:

```ts
expect(repository.findById(walk.id)).resolves.toMatchObject({
  afterState: AFTER_STATE,
  impact: WALK_IMPACT.better,
  result: 'Стало спокойнее.',
  reentry: {
    status: WALK_REENTRY_STATUS.pending,
    preparedAt: UPDATED_AT,
    resolvedAt: null,
  },
});
expect(repository.updateCalls).toHaveLength(1);
```

Expected RED: the stored Walk lacks Reentry.

- [ ] **Step 5: Wire the policy into `RecordWalkOutcome`**

Resolve before calling the domain method:

```ts
const reentryAction = resolveWalkReentryAction(stored, {
  impact: input.impact,
  ...(input.reflection === undefined ? {} : { reflection: input.reflection }),
});
const recorded = stored.recordOutcome({
  afterState: input.afterState,
  impact: input.impact,
  ...(input.reflection === undefined ? {} : { reflection: input.reflection }),
  reentryAction,
  updatedAt: this.clock.now(),
});
```

Keep exactly one `updateIfVersionMatches`, existing not-found/domain/version errors, and no retry.

- [ ] **Step 6: Export and verify policy plus command**

Run:

```powershell
npm run test -- src/application/walk/WalkReentryPolicy.test.ts src/application/commands/RecordWalkOutcome.test.ts
npm run typecheck
git diff --check
```

Expected: policy and command tests PASS; no external repository imports appear in the policy or command.

---

### Task 3: Add pending query and explicit resolve/close commands

**Files:**

- Create: `src/application/queries/GetPendingWalkReentry.ts`
- Create: `src/application/queries/GetPendingWalkReentry.test.ts`
- Create: `src/application/commands/CompleteWalkReentry.ts`
- Create: `src/application/commands/CloseWalkReentry.ts`
- Create: `src/application/commands/WalkReentryCommands.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**

- Consumes: existing `WalkRepository.findAll/findById/updateIfVersionMatches`, `Clock`, and Task 1 lifecycle methods.
- Produces: `GetPendingWalkReentry.execute(): Promise<Walk | null>`, `CompleteWalkReentry.execute({ walkId })`, and `CloseWalkReentry.execute({ walkId })`.

- [ ] **Step 1: Write failing query selection tests**

Seed records whose `preparedAt` and status differ. Assert that only the latest Reentry-bearing Walk controls the result:

```ts
expect(await query.execute()).toBe(latestPending);

latestPending = latestPending.closeReentry(RESOLVED_AT);
expect(await query.execute()).toBeNull();
```

Include an older pending record after a newer completed/closed Reentry and confirm it does not resurface. Add a deterministic tie-breaker expectation using `updatedAt`, then `id.toString()`.

- [ ] **Step 2: Run query tests and verify RED**

Run:

```powershell
npm run test -- src/application/queries/GetPendingWalkReentry.test.ts
```

Expected: FAIL because `GetPendingWalkReentry` does not exist.

- [ ] **Step 3: Implement the query with the existing repository port**

Use `findAll()` and no new index:

```ts
public async execute(): Promise<Walk | null> {
  const latest = (await this.repository.findAll())
    .filter((walk) => walk.reentry !== null)
    .sort(compareNewestReentry)[0] ?? null;
  return latest?.reentry?.status === WALK_REENTRY_STATUS.pending ? latest : null;
}
```

Keep the comparator local and deterministic: descending `preparedAt`, then descending `updatedAt`, then descending `id.toString()` via `localeCompare`. Do not modify `WalkRepository`.

- [ ] **Step 4: Write failing command tests**

For both commands, assert success, timestamp/version preservation, missing Walk, non-pending Reentry, and optimistic conflict:

```ts
expect(await complete.execute({ walkId: pending.id })).toMatchObject({
  ok: true,
  value: { reentry: { status: WALK_REENTRY_STATUS.completed, resolvedAt: NOW } },
});
expect(await close.execute({ walkId: other.id })).toMatchObject({
  ok: true,
  value: {
    reentry: { status: WALK_REENTRY_STATUS.closedWithoutContinuation, resolvedAt: NOW },
  },
});
```

- [ ] **Step 5: Implement the two explicit commands**

Both commands use this input:

```ts
export interface WalkReentryCommandInput {
  readonly walkId: EntityId;
}
```

Load once, call the matching domain method with `clock.now()`, update once, return standard `Result<Walk, DomainError>`. Use exact error codes `walk.not_found`, `walk.reentry_not_pending`, and `walk.version_conflict`; catch only `DomainError`.

- [ ] **Step 6: Export and verify application lifecycle APIs**

Run:

```powershell
npm run test -- src/application/queries/GetPendingWalkReentry.test.ts src/application/commands/WalkReentryCommands.test.ts
npm run typecheck
git diff --check
```

Expected: all new query/command tests PASS.

---

### Task 4: Persist Reentry and preserve legacy Walk records

**Files:**

- Modify: `src/infrastructure/persistence/records/WalkRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbWalkRepository.test.ts`

**Interfaces:**

- Consumes: Task 1's domain value model and the existing Walk record schema version.
- Produces: optional nullable `WalkReentryRecord`, mapper round-trip, and IndexedDB reload restoration.

- [ ] **Step 1: Write failing mapper tests**

Add a completed Walk with pending Reentry and assert the exact serialized shape:

```ts
expect(WalkRecordMapper.toRecord(walk).reentry).toEqual({
  status: 'pending',
  action: {
    kind: 'resumeContext',
    destination: 'routine',
    entity: { type: 'routine', id: 'routine-evening' },
    nextStep: 'Душ и вода',
  },
  preparedAt: '2026-08-25T10:30:00.000Z',
  resolvedAt: null,
});
```

Add legacy input without `reentry` and expect `restored.reentry === null`. Add invalid status, action kind, origin, timestamps, entity, and status/resolvedAt combinations that must throw `persistence.invalid_record`.

- [ ] **Step 2: Run mapper tests and verify RED**

Run:

```powershell
npm run test -- src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts
```

Expected: FAIL because `WalkRecord` and mapper lack Reentry.

- [ ] **Step 3: Add record types without changing schema version**

Add:

```ts
readonly reentry?: WalkReentryRecord | null;
```

and focused record interfaces for status, action, ISO timestamps, optional linked entity, and next step. Keep `schemaVersion: 1` unchanged.

- [ ] **Step 4: Implement mapper serialization and defensive reads**

Add `toReentryRecord` and `readReentry` helpers. Reuse existing `readString`, `readNullableString`, `readIsoDate`, `readNullableIsoDate`, `readLinkedEntity`, and domain guards. Pass `reentry` into `Walk.rehydrate`; do not duplicate domain invariant logic in Presentation.

- [ ] **Step 5: Add failing IndexedDB reopen tests**

Exercise the real command/query chain:

```ts
await first.recordOutcome.execute({
  walkId: completed.id,
  afterState: { energy: 7, tension: 2, clarity: 8 },
  impact: WALK_IMPACT.better,
  reflection: 'Вернуться к плану.',
});
firstDatabase.close();

const restored = await reopened.getPendingReentry.execute();
expect(restored?.reentry).toMatchObject({
  status: WALK_REENTRY_STATUS.pending,
  resolvedAt: null,
});
```

Then complete and reopen again; expect query null and stored terminal Reentry preserved.

- [ ] **Step 6: Run persistence regression checks**

Run:

```powershell
npm run test -- src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts
npm run typecheck
git diff --check
```

Expected: pending/completed/closed and legacy cases PASS; no database migration or new store appears in the diff.

---

### Task 5: Compose WALK-07 and expose a non-blocking shell reminder

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/WalkComposition.integration.test.ts`
- Create: `src/presentation/walk/WalkReentryReminder.tsx`
- Create: `src/presentation/walk/WalkReentryReminder.test.ts`
- Create: `src/app/WalkReentryStartup.ts`
- Create: `src/app/WalkReentryStartup.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Review: `src/app/ApplicationStartup.test.ts`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- Consumes: Task 3 query/commands and existing Application Shell startup routing.
- Produces: `application.getPendingWalkReentry`, `application.completeWalkReentry`, `application.closeWalkReentry`, and a shell-level non-blocking reminder.

- [ ] **Step 1: Write failing composition integration coverage**

Extend the Walk integration test to compose all three services, persist an outcome, reopen IndexedDB, and resolve Reentry. Snapshot all neighboring repositories before and after:

```ts
expect(await reopened.getPendingWalkReentry.execute()).toMatchObject({
  id: completed.id,
  reentry: { status: WALK_REENTRY_STATUS.pending },
});
expect(await reopened.completeWalkReentry.execute({ walkId: completed.id })).toMatchObject({
  ok: true,
  value: { reentry: { status: WALK_REENTRY_STATUS.completed } },
});
expect(await actionRepository.findAll()).toEqual(actionsBefore);
expect(await routineExecutionRepository.findAll()).toEqual(routinesBefore);
```

Expected RED: application composition lacks the services.

- [ ] **Step 2: Wire the application services**

Add imports, service interface fields, public class fields, constructor assignments, instances, and returned values for:

```ts
readonly getPendingWalkReentry: GetPendingWalkReentry;
readonly completeWalkReentry: CompleteWalkReentry;
readonly closeWalkReentry: CloseWalkReentry;
```

Construct them with only `walkRepository` and, for commands, `clock`.

- [ ] **Step 3: Write the failing reminder component test**

Render the component and assert one status plus one CTA:

```ts
const markup = renderToStaticMarkup(
  <WalkReentryReminder onContinue={vi.fn()} error={null} onRetry={vi.fn()} />,
);
expect(markup).toContain('Завершить возвращение');
expect(markup).toContain('Продолжить');
expect(markup.match(/<button/g)).toHaveLength(1);
```

Add an error state with `role="alert"` and one retry button. Do not expose entity ids or render a modal/dialog.

- [ ] **Step 4: Implement the focused reminder and styles**

Create a compact region with a green confirmation marker, restrained text, gold CTA, and no fixed overlay. Add CSS under a `/* WALK-07 — persistent reentry */` marker, including narrow-layout stacking and 44 px controls.

- [ ] **Step 5: Add failing tests for independent reminder loading and visibility**

Create `WalkReentryStartup.test.ts` for two pure contracts:

```ts
expect(
  await loadPendingWalkReentry({
    execute: vi.fn().mockResolvedValue(pendingWalk),
  }),
).toEqual({ status: 'ready', walk: pendingWalk });

expect(
  await loadPendingWalkReentry({
    execute: vi.fn().mockRejectedValue(new Error('storage')),
  }),
).toEqual({ status: 'error' });
```

Test visibility independently from navigation:

```ts
expect(
  shouldShowWalkReentryReminder({
    pendingState: { status: 'ready', walk: pendingWalk },
    activeSection: APP_SECTION.today,
    activeWalkRestored: false,
  }),
).toBe(true);
expect(
  shouldShowWalkReentryReminder({
    pendingState: { status: 'ready', walk: pendingWalk },
    activeSection: APP_SECTION.walks,
    activeWalkRestored: false,
  }),
).toBe(false);
expect(
  shouldShowWalkReentryReminder({
    pendingState: { status: 'ready', walk: pendingWalk },
    activeSection: APP_SECTION.today,
    activeWalkRestored: true,
  }),
).toBe(false);
```

Keep all existing `ApplicationStartup.test.ts` assertions unchanged as the regression proof for active Walk, Routine route, Evening, and storage-error behavior.

- [ ] **Step 6: Implement the startup helper and independent shell state**

Create these focused exports in `WalkReentryStartup.ts`:

```ts
export type PendingWalkReentryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly walk: Walk | null }
  | { readonly status: 'error' };

export async function loadPendingWalkReentry(
  query: Pick<GetPendingWalkReentry, 'execute'>,
): Promise<Exclude<PendingWalkReentryState, { status: 'loading' }>>;

export function shouldShowWalkReentryReminder(input: {
  readonly pendingState: PendingWalkReentryState;
  readonly activeSection: AppSection;
  readonly activeWalkRestored: boolean;
}): boolean;
```

`loadPendingWalkReentry` catches only the query rejection and returns `{ status: 'error' }`; it has no navigation callback. `shouldShowWalkReentryReminder` is true only for a non-null ready Walk outside the Walks section when no active Walk was restored.

Use the exported state in `ApplicationShell`. Load `getPendingWalkReentry` independently from `loadApplicationStartup`. Never call `setActiveSection` from that load. Render `WalkReentryReminder` inside `ApplicationShellView` content only when `shouldShowWalkReentryReminder` returns true. Its CTA sets `APP_SECTION.walks`; its retry reruns only the pending query.

Expose a callback passed to `WalksPage` that reloads this query after outcome, complete, or close, without passing the Walk itself as duplicate subject state.

- [ ] **Step 7: Verify composition and shell regressions**

Run:

```powershell
npm run test -- src/app/composition/WalkComposition.integration.test.ts src/app/ApplicationStartup.test.ts src/app/WalkReentryStartup.test.ts src/presentation/walk/WalkReentryReminder.test.ts src/presentation/layouts/ApplicationShellView.test.ts
npm run typecheck
git diff --check
```

Expected: integration and startup tests PASS; existing active Walk/Routine/Evening priority remains unchanged.

---

### Task 6: Restore and resolve Reentry in Walks UI

**Files:**

- Modify: `src/presentation/walk/WalkCompletionFlow.tsx`
- Modify: `src/presentation/walk/WalkCompletionFlow.test.ts`
- Create: `src/presentation/walk/WalkReentryFlow.ts`
- Create: `src/presentation/walk/WalkReentryFlow.test.ts`
- Modify: `src/presentation/walk/WalkSessionPresentation.ts`
- Modify: `src/presentation/pages/WalksPage.tsx`
- Modify: `src/presentation/pages/WalksPage.test.ts`
- Modify: `src/presentation/styles/global.css`
- Modify: `src/app/ApplicationShell.tsx`

**Interfaces:**

- Consumes: Task 3 query/commands, composed services from Task 5, and existing `getWalkReturnPresentation` navigation mapping.
- Produces: `selectWalkSessionEntry`, `completeWalkReentryFlow`, `closeWalkReentryFlow`, restored Reentry screen, persistence-before-navigation actions, and shell reminder refresh callback.

- [ ] **Step 1: Write failing presentation tests for each action kind**

Extend `WalkCompletionFlow.test.ts` to render a Walk whose Reentry action is each kind. Assert stable copy and only one primary action:

```ts
expect(markup).toContain('Сначала восстановиться');
expect(markup).toContain('Перейти на «Сегодня»');
expect(markup).toContain('Закрыть без продолжения');
expect(markup).not.toContain('decision-42');
```

Add `reviewResult`, `resumeContext` with `nextStep`, and Today fallback. Ensure impact/result are compact and optional, labels come from Presentation, and raw ids never render.

- [ ] **Step 2: Update `WalkReentryPanel` to be persistence-aware**

Use these props:

```ts
interface WalkReentryPanelProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onPrimary: () => void;
  readonly onCloseWithoutContinuation: () => void;
}
```

Disable both actions while saving, render `role="alert"` for errors, keep initial heading focus, and map `WalkReentryAction.kind/destination` through Presentation functions. Do not infer action from current application state.

- [ ] **Step 3: Write failing orchestration tests without requiring a browser DOM**

Create `WalkReentryFlow.test.ts` because Vitest uses the Node environment. Provide mocked services and assert:

- no active Walk + pending query result → Reentry screen;
- pending query null → Walk Center;
- pending query error → local retry state, not a blank page;
- successful primary command is awaited before `onOpenSection`;
- failed command does not navigate;
- close success returns to Walk Center.

Define these exact future exports:

```ts
export interface CompleteWalkReentryFlowInput {
  readonly walk: Walk;
  readonly command: Pick<CompleteWalkReentry, 'execute'>;
  readonly onReentryChanged: () => Promise<void>;
  readonly onOpenSection: (section: AppSection) => void;
}

export interface CloseWalkReentryFlowInput {
  readonly walk: Walk;
  readonly command: Pick<CloseWalkReentry, 'execute'>;
  readonly onReentryChanged: () => Promise<void>;
  readonly onReturnToCenter: () => void;
}

export function selectWalkSessionEntry(input: {
  readonly activeWalk: Walk | null;
  readonly pendingReentry: Walk | null;
  readonly pendingLoadFailed: boolean;
}):
  | { readonly phase: 'active'; readonly walk: Walk }
  | { readonly phase: 'reentry'; readonly walk: Walk }
  | { readonly phase: 'reentryError'; readonly walk: null }
  | { readonly phase: 'center'; readonly walk: null };

export async function completeWalkReentryFlow(
  input: CompleteWalkReentryFlowInput,
): Promise<Result<Walk, DomainError>>;
export async function closeWalkReentryFlow(
  input: CloseWalkReentryFlowInput,
): Promise<Result<Walk, DomainError>>;
```

Use deferred promises for the navigation ordering assertion:

```ts
expect(onOpenSection).not.toHaveBeenCalled();
resolveComplete({ ok: true, value: resolvedWalk });
await flushPromises();
expect(onOpenSection).toHaveBeenCalledWith(APP_SECTION.today);
```

`selectWalkSessionEntry` must prefer active Walk, then pending Reentry, then `reentryError` when `pendingLoadFailed`, then center. `completeWalkReentryFlow` awaits the command, returns immediately on failure, awaits `onReentryChanged`, and only then calls `onOpenSection`. `closeWalkReentryFlow` follows the same order but calls `onReturnToCenter` instead of navigation.

- [ ] **Step 4: Implement the pure flow helpers and load pending Reentry in the page**

Implement `WalkReentryFlow.ts` with the signatures from Step 3. It may import `getWalkReturnPresentation`, but it must not import React or Infrastructure. Use the action already stored in `walk.reentry`; if it is unexpectedly missing after command success, return `failure(new DomainError('walk.reentry_not_pending', 'Возвращение уже завершено или не подготовлено.'))` and do not navigate.

Add `getPendingWalkReentry`, `completeWalkReentry`, `closeWalkReentry`, and `onReentryChanged` props. On page load:

1. load active Walk;
2. if active exists, render it and do not replace it;
3. otherwise load pending Reentry;
4. pending result sets `completedWalk` and `sessionPhase = 'reentry'`;
5. null result sets `center`;
6. failure exposes a local retry button.

After `RecordWalkOutcome` succeeds, await `onReentryChanged()` before presenting the immediate Reentry screen so the shell reminder state matches persistence if the user navigates away.

Keep `completedWalk` only as the current rendered snapshot returned by application operations; persistence remains authoritative.

- [ ] **Step 5: Call the tested flow helpers from React handlers**

Implement handlers with `WalkSubmissionGuard` and delegate ordering to the helper:

```ts
const resolved = await completeWalkReentryFlow({
  walk,
  command: props.completeWalkReentry,
  onReentryChanged: props.onReentryChanged,
  onOpenSection: props.onOpenSection,
});
if (!resolved.ok) {
  setError(resolved.error.message);
  return;
}
setCompletedWalk(null);
```

Close uses `closeWalkReentry`, refreshes reminder state, clears local Reentry, and returns to center. Keep safe section-only navigation; do not dereference linked entity ids.

- [ ] **Step 6: Refine responsive styles without redesigning the accepted screen**

Reuse current `walk-reentry-*` selectors. Add only the summary/reason/loading/error states required by WALK-07. Verify stacked mobile actions, bottom padding above mobile navigation, visible focus, reduced motion, and no fixed-position action bar.

- [ ] **Step 7: Run the presentation and composition regression set**

Run:

```powershell
npm run test -- src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/walk/WalkReentryFlow.test.ts src/presentation/pages/WalksPage.test.ts src/app/composition/WalkComposition.integration.test.ts src/app/ApplicationStartup.test.ts
npm run typecheck
npm run lint
git diff --check
```

Expected: UI and composition tests PASS; navigation occurs only after successful persistence.

---

### Task 7: Prove reload reliability, responsive behavior, and cumulative safety

**Files:**

- Modify: `tests/e2e/lifeos.smoke.spec.ts`
- Review only: all WALK-01—07 files in the cumulative diff

**Interfaces:**

- Consumes: the full domain/application/persistence/composition/presentation flow from Tasks 1–6.
- Produces: browser evidence, regression evidence, and a commit-ready cumulative diff report.

- [ ] **Step 1: Write the failing WALK-07 E2E scenarios**

Add tagged tests that use existing Walk helpers and stable accessible selectors:

```ts
test('WALK-07 restores pending reentry and resolves before navigation', async ({ page }) => {
  await completeWalkWithOutcome(page);
  await expect(page.getByRole('heading', { name: 'Что дальше?' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Завершить возвращение')).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?' })).toBeVisible();
  await page.getByRole('button', { name: /Сегодня|Вернуться/ }).click();
  await expect(page.getByRole('heading', { name: /Сегодня|Прогулки/ })).toBeVisible();
});
```

Add a separate `closedWithoutContinuation` case and run both desktop and mobile projects. Capture screenshots for immediate Reentry, non-blocking reminder, restored Reentry, and resolved destination.

- [ ] **Step 2: Run the new E2E as an integration verification**

Run:

```powershell
npm run test:e2e -- --grep "WALK-07"
```

Expected: both new scenarios PASS. Domain, application, and presentation production behavior was introduced only after failing tests in Tasks 1–6; this E2E confirms the assembled browser flow rather than introducing a second implementation cycle.

- [ ] **Step 3: Make only minimal integration/selector fixes**

Fix the exact failing behavior in the owning source/test file. Do not add sleeps, increase timeouts, bypass persistence, or broaden scope. Re-run the single failing E2E after each fix.

- [ ] **Step 4: Run the focused WALK verification set**

Run:

```powershell
npm run test -- src/domain/walk/Walk.test.ts src/application/walk/WalkReentryPolicy.test.ts src/application/commands/RecordWalkOutcome.test.ts src/application/commands/WalkReentryCommands.test.ts src/application/queries/GetPendingWalkReentry.test.ts src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts src/app/ApplicationStartup.test.ts src/app/WalkReentryStartup.test.ts src/presentation/walk/WalkReentryReminder.test.ts src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/walk/WalkReentryFlow.test.ts src/presentation/pages/WalksPage.test.ts
```

Expected: every listed file PASS with no retry.

- [ ] **Step 5: Run applicable quality gates**

Run sequentially:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:alpha
npm run build
npm run format:check
git diff --check
git diff --stat
git status --short
```

If the full test command becomes disproportionately slow or hangs, follow `docs/codex/TEST_MATRIX.md`: identify the last completed file, run the suspect file separately, preserve the successful focused evidence, and report the limitation rather than increasing timeouts indefinitely.

- [ ] **Step 6: Perform browser QA at required viewports**

Verify with the real app at 1366×768, 390×844, and 360×800:

1. complete a Walk and save outcome;
2. inspect the immediate Reentry screen;
3. leave the screen and reload;
4. confirm the current section is not forcibly changed;
5. use the reminder to restore Reentry;
6. resolve the primary action;
7. repeat with close without continuation;
8. check keyboard focus, console/page errors, horizontal overflow, touch targets, and bottom-navigation overlap.

- [ ] **Step 7: Review the cumulative diff before any implementation commit**

Confirm explicitly:

- no second Walk/Reentry aggregate, repository, store, or engine;
- outcome and pending Reentry share one optimistic update;
- old Walk records remain compatible;
- no external aggregate writes were added;
- startup priorities remain unchanged;
- WALK-08/UI integrations were not started;
- `.codex-temp/` is untracked and excluded.

Do not create a code commit or push. Report verification, review findings, exact `git status --short`, and ask for explicit checkpoint-commit instructions.
