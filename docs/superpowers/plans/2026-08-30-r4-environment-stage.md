# R4 Environment Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing Evening `PreparationPlan` into the user-facing Environment stage with separate sleep/tomorrow areas, an explicitly confirmed 3–6 item required core, persisted complete/skip outcomes, and legacy-safe history.

**Architecture:** Keep `EveningCycle.PREPARING`, `PreparationPlan`, `PreparationService`, the existing repositories/UoW, and `PreparationPanel` as the single state and mutation path. Add an item-area discriminator and plan-level core configuration, extend the existing generator with a deterministic environment catalog, and use optional record fields to read legacy plans without increasing IndexedDB version 19.

**Tech Stack:** TypeScript, React, Vitest, IndexedDB adapters, CSS using existing LifeOS tokens, in-app browser QA.

**Spec:** `docs/design/features/2026-08-30-r4-environment-stage.md`

## Global Constraints

- Implement R4 only; do not add Relaxation, Sleep Check, ratings, analytics, or R5 transitions.
- Do not create `SleepPreparationPlan`, `EnvironmentPlan`, a second repository, or another history source.
- Keep the persisted Evening state literal `PREPARING`; expose «Среда» only in presentation copy.
- Keep IndexedDB database version exactly `19`; stop for approval if a database or record-version bump becomes necessary.
- Preserve legacy Preparation records and completed history without regenerating or fabricating sleep items.
- Required core contains exactly 3–6 unique active item keys after explicit confirmation.
- `SKIPPED` is a persisted processed outcome and never blocks completion.
- No dependencies, stack changes, `any`, direct React-domain mutation, or direct presentation-infrastructure access.
- Reuse `PreparationPanel`, `PreparationSceneView`, existing Evening controls/icons, and LifeOS design tokens.
- Use `Evening_UI_Reference_for_Codex/04_preparation.png` as the approved visual hierarchy reference.
- Current worktree contains unrelated dirty Morning/R2/R3/configuration changes. Never stage, revert, format, or commit unrelated changes. A task checkpoint commit is allowed only when its exact task-owned files/hunks can be isolated safely.
- R4 gate: targeted tests → `npm run verify` → browser QA → STOP. Do not run full Playwright automatically.

## File Structure and Ownership

### Domain

- Modify `src/domain/preparation/Preparation.ts`: area type, item/core invariants, synchronization behavior.
- Modify `src/domain/preparation/Preparation.test.ts`: domain TDD for areas, core size, outcomes, and regeneration.
- Modify `src/domain/preparation/index.ts`: export the new area contract.

### Application

- Create `src/application/preparation/EnvironmentPreparationCatalog.ts`: deterministic R4 baseline only.
- Create `src/application/preparation/EnvironmentPreparationCatalog.test.ts`: catalog order, areas, recommendations, and dedupe keys.
- Modify `src/application/preparation/PreparationService.ts`: catalog integration, core command, snapshot recommendations, frozen completed history.
- Modify `src/application/preparation/PreparationService.test.ts`: application flow, modes/context, refresh, concurrency, and history freeze.
- Modify `src/application/preparation/index.ts`: export catalog types only if presentation/application consumers require them.

### Infrastructure

- Modify `src/infrastructure/persistence/records/PreparationPlanRecord.ts`: optional R4 fields.
- Modify `src/infrastructure/persistence/mappers/PreparationPlanRecordMapper.ts`: new round-trip and legacy defaults.
- Modify `src/infrastructure/persistence/PreparationPersistence.test.ts`: R4/legacy record and refresh tests.
- Do not modify `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts` or its database version.

### Presentation

- Create `src/presentation/pages/PreparationCoreSelection.ts`: typed local selection helpers, no domain mutation.
- Create `src/presentation/pages/PreparationCoreSelection.test.ts`: draft initialization/toggle/validation.
- Modify `src/presentation/pages/PreparationPanelPresentation.ts`: area summaries and core/readiness presentation.
- Modify `src/presentation/pages/PreparationPanel.test.ts`: pure presentation and render contracts.
- Modify `src/presentation/pages/PreparationPanel.tsx`: configuration and two-area checklist UI.
- Create `src/presentation/styles/evening-environment.css`: R4-scoped layout/state/responsive styling.
- Modify `src/presentation/pages/EveningPreparationSceneV2B.test.ts`: R4 visual structure and CSS contracts.
- Modify `src/presentation/pages/EveningCommandCenterPresentation.ts`: «Среда» navigation/read model copy.
- Modify `src/presentation/pages/EveningCommandCenter.tsx`: empty KPI label copy.
- Modify `src/presentation/pages/EveningReviewPanel.tsx`: service surface and emergency/history copy only.
- Modify focused existing tests for those presentation files; do not rewrite unrelated Evening scenes.

### Documentation and verification

- Modify `docs/design/features/2026-08-30-r4-environment-stage.md` only after implementation to record evidence/status.
- Do not edit `AGENTS.md`, `package.json`, lockfiles, or test scripts during R4.

---

### Task 1: Add Environment Areas and Required-Core Invariants to `PreparationPlan`

**Files:**

- Modify: `src/domain/preparation/Preparation.ts`
- Modify: `src/domain/preparation/Preparation.test.ts`
- Modify: `src/domain/preparation/index.ts`

**Interfaces:**

- Consumes: existing `PreparationRequirement`, `PreparationItem`, and `PreparationPlan.synchronize` contracts.
- Produces: `PREPARATION_AREA`, `PreparationArea`, `PreparationItem.area`, `PreparationPlan.requiredCoreKeys`, `PreparationPlan.coreConfigured`, `PreparationPlan.configureRequiredCore(itemKeys, occurredAt)`.

- [ ] **Step 1: Write failing tests for area preservation and legacy-default input**

Add a helper requirement with an explicit area and assert it survives create/synchronize/rehydrate:

```ts
const sleepRequirement: PreparationRequirement = {
  key: 'ENVIRONMENT:SLEEP:DIM_LIGHTS',
  area: PREPARATION_AREA.sleepEnvironment,
  category: PREPARATION_CATEGORY.physical,
  title: 'Приглушить освещение',
  sourceType: PREPARATION_SOURCE_TYPE.rule,
  sourceId: null,
  required: false,
};

expect(plan.activeItems[0]?.area).toBe(PREPARATION_AREA.sleepEnvironment);
```

Add a direct `PreparationItem.rehydrate` case whose `area` is
`PREPARATION_AREA.tomorrowStart`; mapper-level missing-field fallback belongs to Task 3, not Domain.

- [ ] **Step 2: Run the domain test and confirm RED**

Run:

```text
npm run test:target -- src/domain/preparation/Preparation.test.ts
```

Expected: FAIL because `PREPARATION_AREA` and `PreparationItem.area` do not exist.

- [ ] **Step 3: Implement the typed area contract**

Add to `Preparation.ts`:

```ts
export const PREPARATION_AREA = {
  sleepEnvironment: 'SLEEP_ENVIRONMENT',
  tomorrowStart: 'TOMORROW_START',
} as const;

export type PreparationArea = (typeof PREPARATION_AREA)[keyof typeof PREPARATION_AREA];

export function isPreparationArea(value: string): value is PreparationArea {
  return (Object.values(PREPARATION_AREA) as readonly string[]).includes(value);
}
```

Add `readonly area: PreparationArea` to `PreparationRequirement`, `PreparationItemData`, and
`PreparationItem`. Validate it in `assertItemData`. Export it through the existing preparation barrel.

- [ ] **Step 4: Run the focused domain test and confirm GREEN**

Run the Task 1 command again. Expected: PASS for existing and new area tests.

- [ ] **Step 5: Write failing tests for the 3–6 core contract**

Cover all of these assertions explicitly:

```ts
expect(() => plan.configureRequiredCore(keys.slice(0, 2), NOW)).toThrow(
  expect.objectContaining({ code: 'preparation.invalid_required_core_size' }),
);
expect(() => plan.configureRequiredCore([...keys, 'missing'], NOW)).toThrow(
  expect.objectContaining({ code: 'preparation.required_core_item_not_found' }),
);
expect(() => plan.configureRequiredCore([keys[0]!, keys[0]!, keys[1]!], NOW)).toThrow(
  expect.objectContaining({ code: 'preparation.duplicate_required_core_item' }),
);
expect(plan.configureRequiredCore(keys.slice(0, 3), NOW)).toBe(true);
expect(plan.configureRequiredCore(keys.slice(0, 3), LATER)).toBe(false);
expect(plan.requiredCoreKeys).toEqual(keys.slice(0, 3));
expect(plan.coreConfigured).toBe(true);
```

Also test six accepted, seven rejected, and an inactive key rejected.

- [ ] **Step 6: Run the new core tests and confirm RED**

Expected: FAIL because the plan has no stored core or command.

- [ ] **Step 7: Implement plan-level core state and item required mutation**

Extend rehydration data:

```ts
readonly requiredCoreKeys?: readonly string[] | null;
```

Store `#requiredCoreKeys: readonly string[] | null`, expose defensive getters, and add an immutable
item helper:

```ts
public withRequired(required: boolean): PreparationItem {
  return this.required === required ? this : this.copy({ required });
}
```

Implement:

```ts
public configureRequiredCore(itemKeys: readonly string[], occurredAt: Date): boolean {
  assertDate(occurredAt, 'preparation.invalid_update_time');
  if (itemKeys.length < 3 || itemKeys.length > 6) {
    throw new DomainError(
      'preparation.invalid_required_core_size',
      'Выберите от трёх до шести обязательных пунктов.',
    );
  }
  if (new Set(itemKeys).size !== itemKeys.length) {
    throw new DomainError(
      'preparation.duplicate_required_core_item',
      'Обязательные пункты не должны повторяться.',
    );
  }
  const activeByKey = new Map(this.activeItems.map((item) => [item.key, item]));
  if (itemKeys.some((key) => !activeByKey.has(key))) {
    throw new DomainError(
      'preparation.required_core_item_not_found',
      'Обязательный пункт не входит в активную подготовку.',
    );
  }
  const normalized = this.activeItems
    .filter((item) => itemKeys.includes(item.key))
    .map((item) => item.key);
  const unchanged =
    this.#requiredCoreKeys !== null &&
    normalized.length === this.#requiredCoreKeys.length &&
    normalized.every((key, index) => key === this.#requiredCoreKeys?.[index]);
  if (unchanged) return false;
  const selected = new Set(normalized);
  this.#items = Object.freeze(
    this.#items.map((item) => (item.active ? item.withRequired(selected.has(item.key)) : item)),
  );
  this.#requiredCoreKeys = Object.freeze(normalized);
  this.#status = PREPARATION_PLAN_STATUS.inProgress;
  this.#completedAt = null;
  this.touch(occurredAt);
  return true;
}
```

Make `complete()` throw `preparation.required_core_not_configured` when an in-progress plan has a
null core. Preserve the current early idempotent return for an already completed legacy plan.

- [ ] **Step 8: Preserve configured core during synchronization**

Remove `.slice(0, 5)`. When a configured core exists, keep an existing selected item active even if
it temporarily disappears from generated requirements. Apply `required` from the core after merging;
new requirements remain optional until selected. When the core is null, keep requirement `required`
flags as pre-configuration metadata without allowing completion.

The merge order must be:

```text
generated active requirements in deterministic order
→ selected-core existing items absent from generation, in their previous relative order
→ other inactive historical items, in their previous relative order
```

- [ ] **Step 9: Add tests for synchronization and outcome preservation**

Assert that reconfiguration and regeneration preserve item IDs, `COMPLETED`, `SKIPPED`, timestamps,
skip reason, and row order. Assert more than five active optional items survive synchronization.

- [ ] **Step 10: Run Task 1 tests**

Run:

```text
npm run test:target -- src/domain/preparation/Preparation.test.ts
```

Expected: all tests PASS.

- [ ] **Step 11: Create an isolated checkpoint if safe**

Inspect `git diff --` for the three Task 1 files. If they contain only Task 1 changes:

```text
git add src/domain/preparation/Preparation.ts src/domain/preparation/Preparation.test.ts src/domain/preparation/index.ts
git commit -m "feat: add environment preparation core"
```

If any file contains pre-existing unrelated hunks, leave the task unstaged and record that the
checkpoint was intentionally deferred.

---

### Task 2: Add the Deterministic Environment Catalog and Application Command

**Files:**

- Create: `src/application/preparation/EnvironmentPreparationCatalog.ts`
- Create: `src/application/preparation/EnvironmentPreparationCatalog.test.ts`
- Modify: `src/application/preparation/PreparationService.ts`
- Modify: `src/application/preparation/PreparationService.test.ts`
- Modify: `src/application/preparation/index.ts`

**Interfaces:**

- Consumes: Task 1 `PreparationRequirement.area` and `PreparationPlan.configureRequiredCore`.
- Produces: `environmentPreparationRequirements(firstAction)`, `recommendedEnvironmentCoreKeys(items)`, `PreparationSnapshot.recommendedCoreKeys`, `PreparationService.configureRequiredCore`.

- [ ] **Step 1: Write failing catalog tests**

Assert exactly six baseline sleep items and six baseline tomorrow items, stable unique keys, and two
recommended keys per area:

```ts
const requirements = environmentPreparationRequirements(firstAction);
expect(requirements.filter((item) => item.area === PREPARATION_AREA.sleepEnvironment)).toHaveLength(
  6,
);
expect(requirements.filter((item) => item.area === PREPARATION_AREA.tomorrowStart)).toHaveLength(6);
expect(new Set(requirements.map((item) => item.key)).size).toBe(requirements.length);
expect(recommendedEnvironmentCoreKeys(requirements)).toEqual([
  'ENVIRONMENT:SLEEP:REMOVE_ACTIVE_SCREENS',
  'ENVIRONMENT:SLEEP:PHONE_AWAY',
  'ENVIRONMENT:TOMORROW:ALARM',
  'ENVIRONMENT:TOMORROW:FIRST_ACTION',
]);
```

- [ ] **Step 2: Run the catalog test and confirm RED**

Run:

```text
npm run test:target -- src/application/preparation/EnvironmentPreparationCatalog.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the fixed baseline catalog**

Create pure factories using `PREPARATION_SOURCE_TYPE.firstAction`, stable keys, and existing
categories. Use these exact sleep titles:

```text
Проветрить комнату
Приглушить освещение
Убрать активные экраны
Подготовить кровать
Убрать лишний шум
Поставить телефон на зарядку и убрать от кровати
```

Use these exact tomorrow titles:

```text
Подготовить одежду
Подготовить воду
Проверить будильник
Подготовить необходимые вещи
Подготовить рабочее место
Подготовить всё необходимое для первого действия
```

The `FIRST_ACTION` candidate uses `firstAction?.id ?? null` as `sourceId` and a stable key independent
of the changing action ID so a TomorrowPlan edit does not silently delete a user-selected core item.

- [ ] **Step 4: Run catalog tests and confirm GREEN**

Expected: PASS.

- [ ] **Step 5: Write failing service tests for generation and explicit confirmation**

Add tests asserting:

- `getOrGenerate` returns both areas and `recommendedCoreKeys.length === 4`;
- `plan.coreConfigured === false` before the command;
- `continueToShutdown` rejects with `preparation.required_core_not_configured`;
- `configureRequiredCore(cycleDate, keys)` persists the exact keys;
- required flags match only those keys after confirmation;
- a refresh/recreated service returns the same configured core.

- [ ] **Step 6: Run service tests and confirm RED**

Run:

```text
npm run test:target -- src/application/preparation/PreparationService.test.ts
```

- [ ] **Step 7: Integrate the catalog without duplicating generation policy**

Prepend `environmentPreparationRequirements(context.firstAction)` inside the existing
`generateRequirements`. Add `area: PREPARATION_AREA.tomorrowStart` to project, rule, development,
research, outside, and Reflection-derived requirements. Dedupe the combined array by stable key
before sorting.

Add an R4 marker to the generation signature:

```ts
return `environment:r4|tomorrow:${context.plan.version}|rules:${ruleSignature}|corrections:${corrections}`;
```

- [ ] **Step 8: Add the application command and snapshot recommendations**

Extend `PreparationSnapshot`:

```ts
readonly recommendedCoreKeys: readonly string[];
```

Implement:

```ts
public async configureRequiredCore(
  cycleDate: DayDate,
  itemKeys: readonly string[],
): Promise<PreparationSnapshot> {
  return this.mutate(cycleDate, (plan, now) => plan.configureRequiredCore(itemKeys, now));
}
```

Build `recommendedCoreKeys` from active items only while `requiredCoreKeys === null`; after
configuration return the saved core so refresh and UI editing share one source.

- [ ] **Step 9: Freeze completed history before generation**

At the start of `getOrGenerate`, load the cycle and existing plan. If the cycle is `COMPLETED` and a
plan exists, load context only for first-action display and return the stored plan without calling
`generateRequirements`, `synchronize`, or repository save. Add a spy-based test proving rules and
TomorrowPlan version changes do not rewrite completed history.

- [ ] **Step 10: Preserve existing mode and after-midnight behavior**

Extend existing tests rather than replacing them:

- `NORMAL` uses all active items after confirmation;
- `QUICK` presentation will later filter to required, but the application persists the same plan;
- `EMERGENCY` continues through the existing explicit stage skip and does not call catalog generation;
- the existing after-midnight test continues to resolve by cycle `dateKey/dayId`.

- [ ] **Step 11: Run Task 2 tests**

Run:

```text
npm run test:target -- src/application/preparation/EnvironmentPreparationCatalog.test.ts src/application/preparation/PreparationService.test.ts
```

Expected: all tests PASS.

- [ ] **Step 12: Create an isolated checkpoint if safe**

Stage only the five Task 2 files and commit `feat: generate environment preparation plan` if their
diffs contain no unrelated changes. Otherwise defer the checkpoint without staging.

---

### Task 3: Extend Preparation Persistence Without a Database Migration

**Files:**

- Modify: `src/infrastructure/persistence/records/PreparationPlanRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/PreparationPlanRecordMapper.ts`
- Modify: `src/infrastructure/persistence/PreparationPersistence.test.ts`

**Interfaces:**

- Consumes: Task 1 area/core domain fields.
- Produces: optional legacy-safe `area` and `requiredCoreKeys` record fields.

- [ ] **Step 1: Write failing new-record round-trip test**

Create/configure a plan with both areas, one completed item, one skipped item with reason, and a
three-key core. Persist and reload it, then assert:

```ts
expect(restored.requiredCoreKeys).toEqual(plan.requiredCoreKeys);
expect(restored.items.map((item) => item.area)).toEqual(plan.items.map((item) => item.area));
expect(restored.items.map((item) => item.status)).toEqual(plan.items.map((item) => item.status));
expect(
  restored.items.find((item) => item.status === PREPARATION_ITEM_STATUS.skipped)?.skipReason,
).toBe('Сегодня сознательно сокращаю подготовку');
```

- [ ] **Step 2: Write failing legacy-record test**

Construct a raw schemaVersion 1 record without `requiredCoreKeys` and without item `area`. Assert it
loads with `plan.requiredCoreKeys === null`, preserves stored `required`, and maps each legacy item to
`PREPARATION_AREA.tomorrowStart`.

- [ ] **Step 3: Run persistence tests and confirm RED**

Run:

```text
npm run test:target -- src/infrastructure/persistence/PreparationPersistence.test.ts
```

- [ ] **Step 4: Add optional record fields**

Use optional fields so old plain records remain assignable/readable:

```ts
export interface PreparationItemRecord {
  readonly area?: string;
  // existing fields remain unchanged
}

export interface PreparationPlanRecord {
  readonly requiredCoreKeys?: readonly string[] | null;
  // schemaVersion remains 1
}
```

- [ ] **Step 5: Implement mapper output and strict optional input**

Always write the new fields for R4 entities. On read:

```ts
const area = Object.hasOwn(record, 'area')
  ? readString(record, 'area')
  : PREPARATION_AREA.tomorrowStart;
if (!isPreparationArea(area)) throw invalidRecord('Неизвестная область подготовки.');

const requiredCoreKeys = !Object.hasOwn(value, 'requiredCoreKeys')
  ? null
  : value.requiredCoreKeys === null
    ? null
    : readStringArray(value, 'requiredCoreKeys');
```

Pass these values to domain rehydration. Do not change `schemaVersion`, indexes, store creation, or
`LIFE_OS_DATABASE_VERSION`.

- [ ] **Step 6: Add refresh and history-preservation assertions**

Extend the existing repository/UoW tests to prove outcomes, core, areas, item order, and SHUTDOWN
survive a repository/database recreation. Assert the database version remains 19 using the existing
constant, without editing the IndexedDB schema test.

- [ ] **Step 7: Run Task 3 tests**

Run:

```text
npm run test:target -- src/infrastructure/persistence/PreparationPersistence.test.ts src/infrastructure/persistence/IndexedDbEveningHistoryReader.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Create an isolated checkpoint if safe**

Commit only the three Task 3 files with `feat: persist environment preparation` when isolated.

---

### Task 4: Build Typed Core-Selection and Area Presentation Models

**Files:**

- Create: `src/presentation/pages/PreparationCoreSelection.ts`
- Create: `src/presentation/pages/PreparationCoreSelection.test.ts`
- Modify: `src/presentation/pages/PreparationPanelPresentation.ts`
- Modify: `src/presentation/pages/PreparationPanel.test.ts`

**Interfaces:**

- Consumes: `PreparationSnapshot.recommendedCoreKeys`, `PreparationPlan.requiredCoreKeys`, `PreparationItem.area`.
- Produces: `PreparationCoreSelectionDraft`, `createPreparationCoreSelectionDraft`, `togglePreparationCoreKey`, `canConfirmPreparationCore`, area-based summary/readiness models.

- [ ] **Step 1: Write failing selection-helper tests**

Use a plain typed draft:

```ts
export interface PreparationCoreSelectionDraft {
  readonly selectedKeys: readonly string[];
}
```

Tests must prove:

- an unconfigured snapshot initializes from its four recommendations;
- a configured snapshot initializes from saved keys;
- toggling keeps plan item order rather than click order;
- adding a seventh key is refused or yields an invalid draft without mutating the source;
- `canConfirmPreparationCore` is true only for 3–6 unique active keys.

- [ ] **Step 2: Run helper tests and confirm RED**

Run:

```text
npm run test:target -- src/presentation/pages/PreparationCoreSelection.test.ts
```

- [ ] **Step 3: Implement pure immutable helpers**

Use these exact signatures:

```ts
export function createPreparationCoreSelectionDraft(
  items: readonly PreparationItem[],
  savedKeys: readonly string[] | null,
  recommendedKeys: readonly string[],
): PreparationCoreSelectionDraft;

export function togglePreparationCoreKey(
  draft: PreparationCoreSelectionDraft,
  itemKey: string,
  items: readonly PreparationItem[],
): PreparationCoreSelectionDraft;

export function canConfirmPreparationCore(
  draft: PreparationCoreSelectionDraft,
  items: readonly PreparationItem[],
): boolean;
```

No helper may modify a `PreparationPlan` or call a service.

- [ ] **Step 4: Replace category-primary presentation with area-primary presentation**

In `PreparationPanelPresentation.ts`, define summary IDs from `PreparationArea`:

```ts
readonly id: 'prepared' | PreparationArea | 'first-start';
```

Use labels `Среда сна` and `Среда завтра`. Preserve processed/requiredPending math and add
`coreConfigured` to readiness input so continuation is unavailable before confirmation.

- [ ] **Step 5: Add pure presentation tests**

Test empty, unconfigured, configured partial, required skipped, optional pending, fully processed,
completed-history, and legacy tomorrow-only summaries. The ready state is true when the core is
configured and no required item is pending; optional pending items do not block readiness.

- [ ] **Step 6: Run Task 4 tests**

Run:

```text
npm run test:target -- src/presentation/pages/PreparationCoreSelection.test.ts src/presentation/pages/PreparationPanel.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Create an isolated checkpoint if safe**

Commit the four isolated Task 4 files with `feat: model environment core selection`.

---

### Task 5: Implement the Environment Configuration and Checklist UI

**Files:**

- Modify: `src/presentation/pages/PreparationPanel.tsx`
- Modify: `src/presentation/pages/PreparationPanel.test.ts`
- Modify: `src/presentation/pages/EveningPreparationSceneV2B.test.ts`
- Create: `src/presentation/styles/evening-environment.css`

**Interfaces:**

- Consumes: Tasks 2 and 4 service/snapshot/draft interfaces.
- Produces: first-open core configuration, two-area checklist, explicit complete/skip controls, responsive Environment scene.

- [ ] **Step 1: Write failing render tests for first-open configuration**

Render `PreparationSceneView` with `requiredCoreKeys === null`. Assert:

- heading contains `Настройте обязательное ядро`;
- both `Среда для сна` and `Среда для завтра` exist;
- four controls expose selected semantics;
- text exposes `Выбрано 4 из 3–6`;
- confirm CTA is enabled at four, disabled at two or seven;
- no item outcome is changed by selection.

- [ ] **Step 2: Run presentation tests and confirm RED**

Run:

```text
npm run test:target -- src/presentation/pages/PreparationPanel.test.ts src/presentation/pages/EveningPreparationSceneV2B.test.ts
```

- [ ] **Step 3: Extend `PreparationPanel` service surface and state**

Add `configureRequiredCore` to the `Pick<PreparationService, ...>`. Add local state:

```ts
const [coreDraft, setCoreDraft] = useState<PreparationCoreSelectionDraft | null>(null);
const [isConfiguringCore, setIsConfiguringCore] = useState(false);
const [isSavingCore, setIsSavingCore] = useState(false);
```

Initialize the draft from saved/recommended keys after every successful load whose plan identity or
saved core changes. Do not derive item outcomes into local state.

- [ ] **Step 4: Implement the configuration application action**

Call only the service boundary:

```ts
const snapshot = await service.configureRequiredCore(cycleDate, coreDraft.selectedKeys);
setLoadState({ status: 'ready', snapshot });
setIsConfiguringCore(false);
```

On failure, preserve the draft and show `Не удалось сохранить обязательное ядро. Повторить` in an
inline alert. Focus the alert; on success focus the active checklist heading.

- [ ] **Step 5: Render area groups in deterministic order**

Replace `CATEGORY_ORDER` as the primary grouping with:

```ts
const AREA_ORDER = [PREPARATION_AREA.sleepEnvironment, PREPARATION_AREA.tomorrowStart] as const;
```

Use headings `Среда для сна` and `Среда для завтра`. Category remains optional metadata/icon choice,
not the group owner.

- [ ] **Step 6: Make both outcomes explicit and stable**

For every pending row render:

```tsx
<button type="button" onClick={() => void onProcess(item, false)}>
  Выполнено
</button>
<button type="button" onClick={() => void onProcess(item, true)}>
  Пропустить сегодня
</button>
```

For completed/skipped rows keep the same `<li key={item.id.toString()}>` and position, replace
actions with textual status, and keep `data-required` plus an explicit `Обязательное ядро` label.
Never sort by status.

- [ ] **Step 7: Add secondary core editing and completion behavior**

Show `Настроить ядро` only in active non-emergency Environment UI. Initialize editing from saved
keys. Continuation remains the sole primary CTA and is disabled while core is unconfigured,
required items are pending, core/item save is active, or continuation is active.

- [ ] **Step 8: Create R4-scoped CSS**

Import `../styles/evening-environment.css` from `PreparationPanel.tsx`. Use existing tokens only.
The file must provide:

- desktop two-column area grid;
- selected core row using gold current semantics plus non-color selected indicator;
- completed green and skipped neutral states;
- stable row layout with explicit actions;
- visible `:focus-visible` rings;
- disabled/saving state without layout movement;
- `@media (max-width: 900px)` single-column reflow;
- `@media (max-width: 640px)` full-width action stack and minimum 44px controls;
- `@media (prefers-reduced-motion: reduce)` removal of nonessential transitions.

Do not add R4 rules to the already dirty `global.css`.

- [ ] **Step 9: Add CSS structural tests**

Update visual tests to read `evening-environment.css` and assert the scoped selectors, area grid,
mobile breakpoints, 44px minimum, focus-visible, and reduced-motion rules. Do not assert arbitrary
pixel colors that duplicate tokens.

- [ ] **Step 10: Run Task 5 tests**

Run:

```text
npm run test:target -- src/presentation/pages/PreparationPanel.test.ts src/presentation/pages/EveningPreparationSceneV2B.test.ts
```

Expected: all tests PASS.

- [ ] **Step 11: Create an isolated checkpoint if safe**

Commit the four Task 5 files with `feat: build evening environment checklist` if isolated.

---

### Task 6: Update Evening Copy, Modes, and Saved History Contracts

**Files:**

- Modify: `src/presentation/pages/EveningCommandCenterPresentation.ts`
- Modify: `src/presentation/pages/EveningCommandCenter.tsx`
- Modify: `src/presentation/pages/EveningReviewPanel.tsx`
- Modify: `src/presentation/pages/EveningReviewPanel.test.ts`
- Modify: `src/presentation/pages/EveningCommandCenter.test.ts`
- Modify: `src/presentation/pages/EveningCompletedHistoryScenes.test.ts`
- Modify: `src/test/e8/EveningModesE8.test.ts`

**Interfaces:**

- Consumes: completed Tasks 1–5.
- Produces: user-facing «Среда» stage copy, legacy/new history evidence, unchanged mode transitions.

- [ ] **Step 1: Write failing copy/read-model tests**

Assert the journey and KPI label use `Среда`, while state selection still maps
`EVENING_CYCLE_STATE.preparing` to the existing `'preparation'` view ID. Assert emergency copy says
`Позднее завершение · Среда` and still invokes `skipPreparation`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```text
npm run test:target -- src/presentation/pages/EveningCommandCenter.test.ts src/presentation/pages/EveningReviewPanel.test.ts
```

- [ ] **Step 3: Change presentation copy only**

Change labels/headings from `Подготовка` to `Среда` where they name the stage. Keep internal view ID
`preparation`, service/property names, domain state, and repository names unchanged. Contextual copy
may still use the Russian word «подготовка» when describing an action rather than naming the stage.

- [ ] **Step 4: Add history tests for new and legacy plans**

For a new saved plan, assert exact stored sleep/tomorrow grouping and complete/skipped labels. For a
legacy plan with only `TOMORROW_START`, assert no empty/fabricated sleep group appears and opening
history performs no application mutation.

- [ ] **Step 5: Preserve mode contracts**

Extend E8 tests:

- QUICK filters the same persisted plan to confirmed `required` items only;
- NORMAL shows required and optional items;
- EMERGENCY records the existing Preparation-stage skip reason and creates no Environment plan;
- NORMAL → QUICK → NORMAL retains item outcomes and configured core.

- [ ] **Step 6: Run Task 6 tests**

Run:

```text
npm run test:target -- src/presentation/pages/EveningCommandCenter.test.ts src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts src/test/e8/EveningModesE8.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Create an isolated checkpoint if safe**

Several Task 6 files may already contain unrelated R3 changes. Inspect each diff. Commit
`feat: expose environment stage in evening flow` only if task hunks can be isolated without staging
unrelated work; otherwise leave unstaged and record the reason.

---

### Task 7: Run Cross-Layer Regression and Real Browser QA

**Files:**

- Modify: `docs/design/features/2026-08-30-r4-environment-stage.md`
- Inspect only: all R4 task files and current worktree status.

**Interfaces:**

- Consumes: complete R4 implementation.
- Produces: current-tree evidence and R4 stage-gate report.

- [ ] **Step 1: Run the complete R4 targeted regression**

Run:

```text
npm run test:target -- src/domain/preparation/Preparation.test.ts src/application/preparation/EnvironmentPreparationCatalog.test.ts src/application/preparation/PreparationService.test.ts src/infrastructure/persistence/PreparationPersistence.test.ts src/infrastructure/persistence/IndexedDbEveningHistoryReader.test.ts src/presentation/pages/PreparationCoreSelection.test.ts src/presentation/pages/PreparationPanel.test.ts src/presentation/pages/EveningPreparationSceneV2B.test.ts src/presentation/pages/EveningCommandCenter.test.ts src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts src/test/e8/EveningModesE8.test.ts
```

Expected: all selected files/tests PASS with exit code 0.

- [ ] **Step 2: Run shared fast tests because domain/application contracts changed**

Run:

```text
npm run test:fast
```

Expected: PASS.

- [ ] **Step 3: Run the one canonical repository gate**

Run:

```text
npm run verify
```

Read the complete output and record exit code, duration, test counts, lint warnings, build, format,
and `git diff --check`. Do not claim success from partial output.

- [ ] **Step 4: Start an owned local app for manual browser QA**

Use the controlled local workflow from the Browser skill and stop the owned server afterward. Do
not use bare `npm run dev` as an automated test claim.

- [ ] **Step 5: Verify the primary desktop flow against the approved reference**

At 1600×900 and 1280×720 verify:

- journey label «Среда» and current-stage semantics;
- first-open four recommendations and explicit 3–6 confirmation;
- sleep and tomorrow areas are visually distinct;
- complete and skip actions are both visible;
- rows do not move after processing;
- required skip permits continuation;
- optional pending does not block continuation;
- first-start block uses real Tomorrow data;
- refresh resumes the same core, outcomes, and current state;
- completed history is read-only and does not regenerate.

- [ ] **Step 6: Verify mobile and accessibility behavior**

At 390×844 and 360×800 verify vertical order, full-width main CTA, 44×44 targets, wrapped long text,
no horizontal overflow, no bottom-navigation overlap, predictable focus after confirm/error, and no
essential reduced-motion loss.

- [ ] **Step 7: Inspect browser runtime evidence**

Record console errors/warnings and page errors. A non-empty application error log blocks completion.
If keyboard activation cannot be dispatched by the in-app driver, record the limitation and rely only
on native semantics plus automated focus tests; do not claim manual keyboard verification.

- [ ] **Step 8: Apply Rule 38 and compare concrete gaps**

Review hierarchy, semantic color, materials, card density, one primary CTA, loading/error/success,
mobile reflow, focus, contrast, reduced motion, and monochrome structure. Fix only R4-scoped gaps,
then rerun the affected targeted tests and browser viewport.

- [ ] **Step 9: Decide whether full E2E is justified**

Default decision is **do not run it** for R4. Run `npm run test:e2e` only if the final diff actually
changes routing, navigation-state ownership, IndexedDB schema/version, startup/recovery, or a
cross-stage Evening transition beyond the existing `PREPARING → SHUTDOWN` contract. State the exact
reason before running. Optional additive record fields and scoped Environment browser interaction
alone are covered by targeted persistence tests, `verify`, and manual browser QA in this plan.

- [ ] **Step 10: Re-read final diff and worktree hygiene**

Run:

```text
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Confirm no dependency, lockfile, database-version, unrelated Morning/R2/R3, generated artifact, or
user-data change was introduced by R4. Distinguish pre-existing dirty files from R4-owned changes.

- [ ] **Step 11: Update the R4 specification evidence**

Set implementation to `COMPLETE` only after all required checks pass. Keep final visual approval
`PENDING`. Add exact commands, exit codes/counts, browser viewports/states, console result, E2E
decision, schema decision, and known limitations. Run `npm run format:check` if the doc changes after
the canonical gate; never rewrite unrelated files.

- [ ] **Step 12: Stop at the R4 stage gate**

Report acceptance-criterion evidence and end with:

```text
R4 COMPLETE — WAITING FOR USER APPROVAL.
```

Do not start R5, merge, push, or mark the visual `APPROVED`/`LOCKED` without a separate user action.
