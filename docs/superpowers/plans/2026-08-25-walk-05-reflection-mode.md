# WALK-05 Reflection Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted, optional template guidance to reflection walks while keeping `Walk` as the only session aggregate and leaving WALK-04 completion/reentry unchanged.

**Architecture:** Store the selected reflection template and current stage on the existing `Walk`; domain methods own stage progression, application commands perform optimistic updates through the existing `WalkRepository`, and Presentation renders static template/stage copy. Old records default both fields to `null`, and no second aggregate, store, or session engine is introduced.

**Tech Stack:** TypeScript 6 strict mode, React 19, Vitest 4, fake-indexeddb, IndexedDB, Playwright with system Google Chrome, existing LifeOS CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-25-walk-05-reflection-mode-design.md`

## Global Constraints

- `Walk` remains the only execution aggregate and the existing `WalkRepository` remains the only persistence port.
- Keep dependency flow `UI → Presentation → Application → Domain`; Infrastructure implements application ports.
- Do not add dependencies or use `any`.
- Do not add stage answers, WalkCapture, Inbox, Notes, voice, photo, GPS, recommendations, analytics, linked-entity selection, or automatic Decision/Goal/Routine updates.
- Keep WALK-04 Complete → Quick completion → Reentry behavior and data unchanged.
- Default a newly created reflection walk to `freeThought`; old reflection records without template remain valid with `null`.
- Stage progression is manual, persists across reload, never changes elapsed timestamps, and never completes the walk.
- Desktop acceptance viewport is 1366×768; mobile viewports are 390×844 and 360×800; touch targets are at least 44 px.
- Preserve all existing staged and unstaged WALK-01—04 changes. Because the same files already contain uncommitted baseline work, do not create intermediate production commits that would mix stages; use explicit test/diff checkpoints and leave final commit policy to the user.
- Do not add `.codex-temp/` to Git and do not push.

---

## File Structure

### New files

- `src/domain/walk/WalkReflectionTemplate.ts` — stable template/stage identifiers, ordered stage catalog, and validation helpers.
- `src/application/commands/AdvanceWalkReflectionStage.ts` — optimistic application command for the next stage.
- `src/application/commands/DisableWalkReflectionGuidance.ts` — optimistic application command for disabling guidance.
- `src/application/commands/WalkReflectionCommands.test.ts` — application behavior, errors, idempotence, and conflicts.
- `src/presentation/walk/WalkReflectionPresentation.ts` — Russian labels/prompts derived from domain identifiers.
- `src/presentation/walk/WalkReflectionFlow.tsx` — preparation selector and active guidance panel.
- `src/presentation/walk/WalkReflectionFlow.test.ts` — isolated SSR contracts for the new presentation components.

### Modified files

- `src/domain/walk/Walk.ts`, `Walk.test.ts`, `index.ts`, `src/domain/index.ts` — aggregate fields, invariants, start initialization, progression, and exports.
- `src/application/commands/CreateWalk.ts`, `WalkCommands.test.ts`, `application/index.ts` — carry template at creation and export commands.
- `src/app/composition/LifeOsApplication.ts`, `createLifeOsApplication.ts`, `WalkComposition.integration.test.ts` — composition and reopen verification.
- `src/infrastructure/persistence/records/WalkRecord.ts`, `mappers/WalkRecordMapper.ts`, mapper/repository tests — optional fields and backward-compatible restore.
- `src/presentation/walk/WalkSessionFlow.tsx`, `WalkSessionPresentation.ts`, `src/presentation/pages/WalksPage.tsx`, `WalksPage.test.ts`, `src/app/ApplicationShell.tsx` — preparation/active orchestration.
- `src/presentation/styles/global.css` — scoped reflection template/guidance styles and responsive rules.
- `tests/e2e/lifeos.smoke.spec.ts` — real Chrome WALK-05 flow.

---

### Task 1: Domain template catalog and Walk progression

**Files:**

- Create: `src/domain/walk/WalkReflectionTemplate.ts`
- Modify: `src/domain/walk/Walk.ts:22-70,85-190,398-480`
- Modify: `src/domain/walk/index.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/walk/Walk.test.ts`

**Interfaces:**

- Produces: `WALK_REFLECTION_TEMPLATE`, `WalkReflectionTemplate`, `WALK_REFLECTION_STAGE`, `WalkReflectionStage`, `isWalkReflectionTemplate`, `isWalkReflectionStage`, `getWalkReflectionStages(template)`.
- Produces on `Walk`: `reflectionTemplate`, `reflectionStage`, `advanceReflectionStage(updatedAt)`, `disableReflectionGuidance(updatedAt)`.
- Consumed later by: CreateWalk, application commands, mapper, and Presentation.

- [ ] **Step 1: Add failing catalog and aggregate tests**

Add tests proving ordered stages, guided initialization, manual progression, final-stage shutdown, explicit disable, non-reflection rejection, timestamp preservation, and legacy `null` restore. Use assertions shaped like:

```ts
expect(getWalkReflectionStages(WALK_REFLECTION_TEMPLATE.decision)).toEqual([
  WALK_REFLECTION_STAGE.facts,
  WALK_REFLECTION_STAGE.assumptions,
  WALK_REFLECTION_STAGE.options,
  WALK_REFLECTION_STAGE.choiceCost,
  WALK_REFLECTION_STAGE.smallestTest,
]);

const started = reflectionWalk(WALK_REFLECTION_TEMPLATE.decision).start({
  mode: WALK_MODE.timer,
  startedAt: STARTED_AT,
  timerTargetMinutes: 30,
  reflectionQuestion: 'Стоит ли запускать проект?',
});
expect(started.reflectionStage).toBe(WALK_REFLECTION_STAGE.facts);

const advanced = started.advanceReflectionStage(new Date('2026-08-08T08:05:00.000Z'));
expect(advanced.reflectionStage).toBe(WALK_REFLECTION_STAGE.assumptions);
expect(advanced.startedAt).toEqual(started.startedAt);
expect(advanced.version).toBe(started.version + 1);
```

Also rehydrate a running legacy reflection Walk without the two properties and expect both to be `null`.

- [ ] **Step 2: Run RED domain tests**

Run:

```bash
npx vitest run src/domain/walk/Walk.test.ts
```

Expected: FAIL because reflection template exports, fields, and progression methods do not exist.

- [ ] **Step 3: Implement the template/stage value contract**

Create the catalog with stable string values and frozen ordered arrays:

```ts
export const WALK_REFLECTION_TEMPLATE = {
  decision: 'decision',
  problem: 'problem',
  goal: 'goal',
  strategy: 'strategy',
  freeThought: 'freeThought',
} as const;

export const WALK_REFLECTION_STAGE = {
  facts: 'facts',
  assumptions: 'assumptions',
  options: 'options',
  choiceCost: 'choiceCost',
  smallestTest: 'smallestTest',
  situation: 'situation',
  rootCause: 'rootCause',
  constraints: 'constraints',
  changeOptions: 'changeOptions',
  nextExperiment: 'nextExperiment',
  currentPosition: 'currentPosition',
  desiredResult: 'desiredResult',
  mainObstacle: 'mainObstacle',
  nearestLever: 'nearestLever',
  nextStep: 'nextStep',
  context: 'context',
  constraint: 'constraint',
  priority: 'priority',
  sacrifice: 'sacrifice',
  mainResult: 'mainResult',
} as const;
```

`getWalkReflectionStages` returns a defensive readonly copy. `freeThought` returns `[]`.

- [ ] **Step 4: Extend Walk without changing its lifecycle engine**

Add optional nullable fields to creation/rehydration data, readonly properties, `toRehydrationData`, and invariants. New reflection Walks may carry a template; legacy reflection Walks may remain `null`. Reject a template on non-reflection intent and reject a stage that is not part of the selected template.

Initialize the first stage only in `start`:

```ts
const reflectionStages =
  this.intent === WALK_INTENT.reflection && this.reflectionTemplate !== null
    ? getWalkReflectionStages(this.reflectionTemplate)
    : [];

return new Walk({
  ...this.toRehydrationData(),
  status: WALK_STATUS.running,
  reflectionStage: reflectionStages[0] ?? null,
  // existing start fields stay unchanged
});
```

`advanceReflectionStage` accepts running or paused reflection Walks with a current stage, advances to the next identifier or `null`, updates only `updatedAt/version`, and throws stable domain errors for non-active, non-reflection, or disabled guidance. `disableReflectionGuidance` returns `this` when already disabled and otherwise sets the stage to `null`.

- [ ] **Step 5: Run GREEN domain tests and checkpoint**

Run:

```bash
npx vitest run src/domain/walk/Walk.test.ts src/application/commands/FinishWalk.test.ts
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Review `git diff` for domain-only scope; do not commit while overlapping WALK-01—04 changes remain uncommitted.

---

### Task 2: Creation contract, stage commands, and composition

**Files:**

- Create: `src/application/commands/AdvanceWalkReflectionStage.ts`
- Create: `src/application/commands/DisableWalkReflectionGuidance.ts`
- Create: `src/application/commands/WalkReflectionCommands.test.ts`
- Modify: `src/application/commands/CreateWalk.ts:12-60`
- Modify: `src/application/commands/WalkCommands.test.ts`
- Modify: `src/application/index.ts:350-365`
- Modify: `src/app/composition/LifeOsApplication.ts:149-260,390-410,540-560`
- Modify: `src/app/composition/createLifeOsApplication.ts:605-620,780-800`

**Interfaces:**

- Consumes: Task 1 reflection types and `Walk` methods.
- Produces: `AdvanceWalkReflectionStage.execute({ walkId })` and `DisableWalkReflectionGuidance.execute({ walkId })`, both returning `Promise<Result<Walk, DomainError>>`.
- Produces: `CreateWalkInput.reflectionTemplate?: WalkReflectionTemplate`.
- Consumed later by: WalksPage props and ApplicationShell wiring.

- [ ] **Step 1: Write failing CreateWalk and command tests**

Test these observable cases:

```ts
const created = await createWalk.execute({
  date: DATE,
  intent: WALK_INTENT.reflection,
  reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
});
expect(created).toMatchObject({
  ok: true,
  value: { reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision },
});

const defaulted = await createWalk.execute({ date: DATE, intent: WALK_INTENT.reflection });
expect(defaulted).toMatchObject({
  ok: true,
  value: { reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought },
});
```

For both commands cover success, `walk.not_found`, invalid state/domain errors, already-disabled idempotence, and a repository returning `false` from `updateIfVersionMatches` producing `walk.version_conflict`.

- [ ] **Step 2: Run RED application tests**

Run:

```bash
npx vitest run src/application/commands/WalkCommands.test.ts src/application/commands/WalkReflectionCommands.test.ts
```

Expected: FAIL because input/template support and commands are missing.

- [ ] **Step 3: Implement minimal application behavior**

In `CreateWalk`, default only reflection intent to `freeThought`; pass an explicitly supplied template for any intent to Domain so invalid combinations fail instead of being silently discarded.

Implement each command using the existing PauseWalk/RecordWalkOutcome pattern:

```ts
const stored = await this.repository.findById(input.walkId);
if (stored === null) return walkNotFound();
const updated = stored.advanceReflectionStage(this.clock.now());
if (updated === stored) return success(stored);
if (await this.repository.updateIfVersionMatches(updated, stored.version)) return success(updated);
return versionConflict();
```

The disable command calls `disableReflectionGuidance`; neither command retries or touches another repository.

- [ ] **Step 4: Export and compose both commands**

Add both services to `LifeOsApplicationServices`, public `LifeOsApplication` properties, constructor assignments, and `createLifeOsApplication` creation/return object:

```ts
const advanceWalkReflectionStage = new AdvanceWalkReflectionStage(walkRepository, clock);
const disableWalkReflectionGuidance = new DisableWalkReflectionGuidance(walkRepository, clock);
```

- [ ] **Step 5: Run GREEN application/composition checks**

Run:

```bash
npx vitest run src/application/commands/WalkCommands.test.ts src/application/commands/WalkReflectionCommands.test.ts src/app/composition/WalkComposition.integration.test.ts
npm run typecheck
git diff --check
```

Expected: all pass. Review that no Decision, Goal, Routine, LifeAction, Journal, or Capture repository was added.

---

### Task 3: Backward-compatible persistence and reload restore

**Files:**

- Modify: `src/infrastructure/persistence/records/WalkRecord.ts:1-25`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.ts:1-140`
- Test: `src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts`
- Test: `src/infrastructure/persistence/IndexedDbWalkRepository.test.ts`
- Test: `src/app/composition/WalkComposition.integration.test.ts`

**Interfaces:**

- Consumes: Task 1 type guards and Walk rehydration fields.
- Produces: optional `WalkRecord.reflectionTemplate` and `WalkRecord.reflectionStage` fields with schema version unchanged at `1`.
- Provides later UI/browser work with reliable reload state.

- [ ] **Step 1: Write failing mapper, repository, and reopen tests**

Add mapper round-trip for a running decision-template Walk on the second stage. Delete both new keys from a legacy record and expect `null`. Add separate invalid-template, invalid-stage, and mismatched template/stage records that throw the standard invalid-record error.

In IndexedDB and composition tests:

```ts
const advanced = await first.advanceWalkReflectionStage.execute({ walkId });
expect(advanced).toMatchObject({
  ok: true,
  value: { reflectionStage: WALK_REFLECTION_STAGE.assumptions },
});
first.close();

const restored = await reopened.getActiveWalk.execute();
expect(restored).toMatchObject({
  reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
  reflectionStage: WALK_REFLECTION_STAGE.assumptions,
});
```

Also assert action sessions and routine occurrence executions remain unchanged.

- [ ] **Step 2: Run RED persistence tests**

Run:

```bash
npx vitest run src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts
```

Expected: FAIL because the mapper drops both fields.

- [ ] **Step 3: Implement record and mapper support**

Add:

```ts
readonly reflectionTemplate?: string | null;
readonly reflectionStage?: string | null;
```

Write both fields in `toRecord`. In `fromRecord`, use `Object.hasOwn` plus `readNullableString`; absent fields become `null`. Validate with Task 1 type guards before calling `Walk.rehydrate`. Do not bump schema or create a migration/store.

- [ ] **Step 4: Run GREEN persistence and reload checks**

Run:

```bash
npx vitest run src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts
npm run typecheck
git diff --check
```

Expected: all pass, including legacy records and reopen restore.

---

### Task 4: Reflection presentation model and isolated UI components

**Files:**

- Create: `src/presentation/walk/WalkReflectionPresentation.ts`
- Create: `src/presentation/walk/WalkReflectionFlow.tsx`
- Create: `src/presentation/walk/WalkReflectionFlow.test.ts`
- Modify: `src/presentation/walk/WalkSessionFlow.tsx:18-30,144-275,283-450`
- Modify: `src/presentation/walk/WalkSessionPresentation.ts`
- Modify: `src/presentation/styles/global.css` in the scoped Walk section
- Test: `src/presentation/pages/WalksPage.test.ts`

**Interfaces:**

- Consumes: reflection catalog/types and Walk fields from Task 1.
- Produces: `WALK_REFLECTION_TEMPLATE_OPTIONS`, `getWalkReflectionStagePresentation`, `WalkReflectionTemplateSelector`, and `WalkReflectionGuidancePanel`.
- Extends: `WalkPreparationDraft.reflectionTemplate: WalkReflectionTemplate | null`.
- Extends WalkActivePanel callbacks: `onAdvanceReflection`, `onDisableReflectionGuidance`.

- [ ] **Step 1: Write failing presentation tests before components**

Use `renderToStaticMarkup` to prove:

- reflection preparation has exactly five `name="walk-reflection-template"` radios and defaults to free thought;
- decision preview contains the five ordered stage labels;
- free/recovery preparation contains no template selector;
- guided active Walk shows its template, exactly one prompt, `Этап 1 из 5`, `Следующий этап`, and `Без сопровождения`;
- the last stage changes the main label to `Завершить сопровождение`;
- free, recovery, legacy reflection, and freeThought show no guidance controls;
- no textarea or answer input appears inside active guidance.

Example contract:

```ts
expect(markup.match(/name="walk-reflection-template"/g)).toHaveLength(5);
expect(markup).toContain('Принятие решения');
expect(markup).toContain('Факты');
expect(markup).toContain('Минимальный проверочный шаг');
expect(activeMarkup).not.toMatch(/textarea|Записать ответ|Сохранить мысль/);
```

- [ ] **Step 2: Run RED presentation tests**

Run:

```bash
npx vitest run src/presentation/walk/WalkReflectionFlow.test.ts src/presentation/pages/WalksPage.test.ts
```

Expected: FAIL because presentation mapping/components and draft template do not exist.

- [ ] **Step 3: Implement presentation mapping and components**

Keep Russian copy in `WalkReflectionPresentation.ts`. Every stage identifier has one label and one concise prompt. `WalkReflectionTemplateSelector` is a native radio fieldset with an ordered preview only for guided templates.

`WalkReflectionGuidancePanel` receives the authoritative Walk and derives index/total from the domain catalog:

```ts
interface WalkReflectionGuidancePanelProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onAdvance: () => void;
  readonly onDisable: () => void;
}
```

Render nothing when template/stage is `null`. Use an `aria-live="polite"` region for the current prompt and native buttons with disabled state.

- [ ] **Step 4: Integrate components into preparation and active panel**

In preparation, initialize `reflectionTemplate` to `freeThought`, include it in the draft only for reflection, and render the selector next to the existing optional main question.

In active panel, keep the current main question/focus block and render the guidance panel beneath it only when the Walk has a current stage. Do not move pause, finish, or timer logic.

- [ ] **Step 5: Add scoped responsive CSS and run GREEN UI tests**

Add graphite cards, gold selected-template state, restrained green active guidance state, native focus outlines, 44 px controls, one-column mobile rules, and reduced-motion compatibility. Do not introduce permanent purple.

Run:

```bash
npx vitest run src/presentation/walk/WalkReflectionFlow.test.ts src/presentation/pages/WalksPage.test.ts src/presentation/walk/WalkTimer.test.ts src/presentation/walk/WalkCompletionFlow.test.ts
npm run typecheck
git diff --check
```

Expected: all pass; WALK-04 components remain unchanged.

---

### Task 5: WalksPage orchestration and error handling

**Files:**

- Modify: `src/presentation/pages/WalksPage.tsx:60-130,222-280,318-455,480-565`
- Modify: `src/presentation/pages/WalksPage.test.ts`
- Modify: `src/app/ApplicationShell.tsx:520-545`
- Test: `src/presentation/layouts/ApplicationShellView.test.ts`

**Interfaces:**

- Consumes: Task 2 commands and Task 4 callbacks/draft.
- Produces: reliable `activeWalkState` updates after advance/disable and shell wiring for both commands.
- Leaves: completion/reentry phases and navigation callbacks unchanged.

- [ ] **Step 1: Add failing orchestration contract tests**

Extend the WalksPage source/render contracts to require command props and verify the preparation draft carries `reflectionTemplate`. Add component tests ensuring `WalkActivePanel` callbacks are present without adding a second start/complete action.

Where source-level checks are unavoidable in existing tests, assert exact public names rather than implementation fragments:

```ts
expect(source).toContain('advanceWalkReflectionStage');
expect(source).toContain('disableWalkReflectionGuidance');
expect(source).toContain('reflectionTemplate: draft.reflectionTemplate');
```

- [ ] **Step 2: Run RED orchestration tests**

Run:

```bash
npx vitest run src/presentation/pages/WalksPage.test.ts src/presentation/layouts/ApplicationShellView.test.ts
```

Expected: FAIL because WalksPage and ApplicationShell do not expose the commands.

- [ ] **Step 3: Implement guarded handlers**

Add command props and two handlers using the existing `WalkSubmissionGuard`:

```ts
const advanced = await props.advanceWalkReflectionStage.execute({ walkId: walk.id });
if (!advanced.ok) {
  setError(advanced.error.message);
  return;
}
setActiveWalkState({ status: 'ready', value: advanced.value });
```

Disable follows the same pattern. Both set `isSaving`, clear old messages/errors, release the guard in `finally`, and preserve the current active Walk on failure.

Pass the selected template to `createWalk` only through the application input. Wire both services from `application` in ApplicationShell.

- [ ] **Step 4: Run GREEN orchestration and adjacent regression tests**

Run:

```bash
npx vitest run src/presentation/pages/WalksPage.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/app/ApplicationStartup.test.ts src/presentation/walk/WalkCompletionFlow.test.ts
npm run typecheck
git diff --check
```

Expected: all pass; ApplicationStartup still restores active/paused Walks and completion/reentry presentation stays green.

---

### Task 6: Real Chrome flow, cumulative review, and quality gate

**Files:**

- Modify: `tests/e2e/lifeos.smoke.spec.ts`
- Generate only: `.codex-temp/walk05-after/*.png`
- Review: cumulative WALK-01—05 diff; no production file is added solely for QA artifacts.

**Interfaces:**

- Consumes: fully composed WALK-05 UI.
- Produces: browser evidence and final verification report; no domain/application API.

- [ ] **Step 1: Add the failing WALK-05 E2E scenario**

Add one test executed in desktop-chrome and mobile-chrome that:

1. opens Walks and chooses Reflection;
2. selects `Принятие решения` and enters `Стоит ли запускать проект?`;
3. starts and sees only stage 1 `Факты`;
4. advances to `Предположения`;
5. reloads and confirms the same stage/template/question;
6. pauses, reloads, resumes, and confirms the stage is unchanged;
7. disables guidance and confirms the main question remains while stage controls disappear;
8. completes through the existing quick completion/reentry flow;
9. checks no horizontal overflow, runtime errors, or mobile navigation overlap.

Capture screenshots for reflection preparation, active guided stage, restored stage, and disabled guidance at desktop 1366 and mobile 360.

- [ ] **Step 2: Run RED E2E against real Chrome**

Run the existing config first:

```bash
npx playwright test tests/e2e/lifeos.smoke.spec.ts --project=desktop-chrome --grep "WALK-05" --reporter=line
```

Expected before orchestration is complete: FAIL at the missing template selector or guided stage. If the config-owned Vite process reproduces the known Windows shutdown hang after results, terminate only that test session and use the already established external-Vite temporary config for the clean final run.

- [ ] **Step 3: Refine UI from screenshots without changing scope**

Inspect every generated screenshot at original resolution. Fix only evidenced WALK-05 issues: clipping, density, focus visibility, touch targets, overflow, or bottom-nav overlap. Do not add images, recommendations, analytics, captures, or extra actions.

- [ ] **Step 4: Run targeted WALK-05 and adjacent Walk tests**

Run:

```bash
npx vitest run src/domain/walk/Walk.test.ts src/application/commands/WalkCommands.test.ts src/application/commands/WalkReflectionCommands.test.ts src/application/commands/FinishWalk.test.ts src/application/commands/RecordWalkOutcome.test.ts src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts src/app/ApplicationStartup.test.ts src/presentation/walk/WalkReflectionFlow.test.ts src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/walk/WalkTimer.test.ts src/presentation/pages/WalksPage.test.ts
```

Expected: all selected files pass.

- [ ] **Step 5: Run final browser matrix**

Run WALK-05 in real Chrome for both configured projects. Use the external-Vite config if needed to avoid the known config-owned server lifecycle hang:

```bash
npx playwright test tests/e2e/lifeos.smoke.spec.ts --config=.codex-temp/playwright.walk05.config.ts --grep "WALK-05"
```

Expected: 2 passed, desktop 1366×768 and mobile 360×800, with additional responsive bounds checked at 390×844.

- [ ] **Step 6: Run the LifeOS quality gate**

Run:

```bash
npm run test:alpha
npm run verify
git diff --check
git diff --stat
git status --short
```

Expected: alpha 1/1; typecheck, ESLint, full Vitest, build, Prettier, and diff check all exit 0. CRLF conversion warnings are informational only.

- [ ] **Step 7: Perform final cumulative code review**

Confirm with source and tests:

- exactly one `Walk` aggregate and no `WalkReflectionSession`/second repository;
- stage is derived from persisted template/stage identifiers, not React state;
- reload, pause/resume, complete, elapsed duration, and duplicate-active guard remain correct;
- old records without reflection fields still load;
- Free/Recovery and WALK-04 completion/reentry behavior did not change;
- no Decision/Goal/Routine writes, WalkCapture, stage answers, analytics, or WALK-06 code;
- `.codex-temp/` remains untracked and push was not performed.

Report any Critical or Important issue before requesting a commit. Do not create a production checkpoint commit unless the user explicitly requests it after reviewing the verification report.
