# R3 Adaptive Reflection Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one-question-per-screen adaptive Evening Reflection with two to four normal answers, an absolute maximum of five saved questions, stable history, and no automatic TomorrowPlan mutation.

**Architecture:** Extend the existing `ReflectionEngine` with a pure conditional-follow-up policy, then let `ReflectionApplicationService` record the answer and insert that follow-up into the same `EveningCycle` mutation before deciding completion. Keep the ordered questions/results already persisted by `EveningCycle` as the only refresh and history source; the UI adds a typed answer draft to the existing `EveningReflectionScene` instead of creating another flow.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, existing repository ports and IndexedDB mappers, existing LifeOS CSS tokens and Evening components.

**Spec:** `docs/design/features/2026-08-30-r3-adaptive-reflection-flow.md`

## Global Constraints

- Implement R3 only; do not add Environment, Relaxation, Sleep Check, or later-stage behavior.
- Preserve dependency direction: UI → Presentation → Application → Domain; Infrastructure implements application ports.
- Do not use `any`, add dependencies, change the stack, or create a second Reflection engine/store/history renderer.
- Keep `EveningCycle` as the authoritative Reflection aggregate and saved questions/results as the refresh/history source.
- Keep `QUICK` at one critical question and `EMERGENCY` as a Reflection skip.
- Never mutate `TomorrowPlan` from a Reflection answer; plan changes still require the existing explicit confirmation boundary.
- Preserve legacy `SHORT_TEXT`, `OPTIONAL_TEXT`, fixed-question cycles, and all R2 typed answer records.
- Keep initial generation at no more than four questions; only a conditional insertion may bring the saved total to five.
- Do not bump the IndexedDB schema version for R3.
- Preserve unrelated dirty-worktree changes. Do not stage or commit the shared worktree unless the user explicitly authorizes it.
- Follow the R2–R8 gate: targeted tests → `npm run verify` → STOP. Do not automatically run the full E2E suite.

## File Structure

### Domain policy

- Modify `src/domain/reflection/Reflection.ts`: add the `DISTRACTIONS` failure-reason value while preserving every legacy value.
- Modify `src/domain/reflection/ReflectionEngine.ts`: define quick option catalogs, create adaptive baseline questions, and expose the single pure `generateFollowUp` policy.
- Modify `src/domain/reflection/ReflectionEngine.test.ts`: protect successful, unfinished, repeated carry-forward, no-op, count, and follow-up rules.

### Aggregate and application transaction

- Modify `src/domain/evening-cycle/EveningCycle.ts`: insert one deterministic follow-up after an answered parent while enforcing order, uniqueness, state, idempotency, and the five-question ceiling.
- Modify `src/domain/evening-cycle/EveningCycle.test.ts`: protect insertion invariants.
- Modify `src/application/reflection/ReflectionApplicationService.ts`: request a follow-up from the same engine, record answer + insert follow-up in one optimistic mutation, and complete only after the resulting saved queue is exhausted.
- Modify `src/application/reflection/ReflectionApplicationService.test.ts`: protect the full adaptive transaction, retry, modes, refresh, history, and non-mutation behavior.

### Persistence and history

- Modify `src/infrastructure/persistence/ReflectionPersistence.test.ts`: prove inserted questions and boolean/string/string-array results round-trip without a schema change.
- Modify `src/presentation/pages/EveningCompletedHistoryScenes.test.ts`: prove history renders exactly the persisted asked sequence.
- Do not modify `LifeOsIndexedDb.ts`, `EveningCycleRecord.ts`, or `EveningCycleRecordMapper.ts`; current ordered arrays and R2 answer reader already express R3 data.

### Presentation and visual behavior

- Create `src/presentation/pages/ReflectionAnswerDraft.ts`: hold the typed local UI draft and convert it to an R2 `ReflectionAnswer` without domain mutation.
- Create `src/presentation/pages/ReflectionAnswerDraft.test.ts`: protect typed conversion and invalid-empty behavior.
- Modify `src/presentation/pages/EveningReviewPanel.tsx`: own/reset the typed draft and submit only the derived typed answer.
- Modify `src/presentation/pages/EveningReviewPanel.test.ts`: protect controller/read-model wiring and prevent premature TomorrowPlan UI changes.
- Modify `src/presentation/pages/EveningReflectionScene.tsx`: render large YES/NO controls and `SHORT_CAPTURE` inside the approved existing scene.
- Modify `src/presentation/pages/EveningReflectionSceneVisual.test.ts`: protect one-question composition, semantics, CTA order, and mobile-ready structure.
- Modify `src/presentation/styles/global.css`: refine existing Reflection selectors only; do not introduce a parallel card/choice system.

---

### Task 1: Adaptive Reflection policy

**Files:**

- Modify: `src/domain/reflection/Reflection.ts`
- Modify: `src/domain/reflection/ReflectionEngine.ts`
- Test: `src/domain/reflection/ReflectionEngine.test.ts`

**Interfaces:**

- Consumes: existing `ReflectionContext`, `ReflectionQuestion`, `ReflectionAnswer`, R2 question types, and legacy failure-reason values.
- Produces:

```ts
export interface ReflectionFollowUpInput {
  readonly context: ReflectionContext;
  readonly question: ReflectionQuestion;
  readonly answer: ReflectionAnswer;
  readonly currentQuestionCount: number;
}

export class ReflectionEngine {
  public generate(context: ReflectionContext): readonly ReflectionQuestion[];
  public generateFollowUp(input: ReflectionFollowUpInput): ReflectionQuestion | null;
}
```

- Deterministic follow-up id: `${input.question.id}:FOLLOW_UP`.

- [ ] **Step 1: Write failing policy tests for the four required flows**

Add focused cases to `ReflectionEngine.test.ts`:

```ts
it('uses quick answers for a successful main Decision and offers one preserve-practice follow-up', () => {
  const main = item('main', true);
  const engine = new ReflectionEngine();
  const reflectionContext = context({ mainDecision: main, completedDecisions: [main] });
  const [question] = engine.generate(reflectionContext);

  expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.singleChoice);
  const followUp = engine.generateFollowUp({
    context: reflectionContext,
    question: question!,
    answer: question!.options[0]!.value,
    currentQuestionCount: 1,
  });
  expect(followUp?.type).toBe(REFLECTION_QUESTION_TYPE.yesNo);
  expect(followUp?.id).toBe(`${question!.id}:FOLLOW_UP`);
});

it('offers a bounded concrete-change capture after an unfinished main Decision reason', () => {
  const main = item('main', true);
  const engine = new ReflectionEngine();
  const reflectionContext = context({ mainDecision: main, incompleteDecisions: [main] });
  const [question] = engine.generate(reflectionContext);

  expect(question?.options.map(({ value }) => value)).toContain('DISTRACTIONS');
  expect(
    engine.generateFollowUp({
      context: reflectionContext,
      question: question!,
      answer: 'DISTRACTIONS',
      currentQuestionCount: 1,
    })?.type,
  ).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
});

it('turns repeated carry-forward reasons into one concrete follow-up', () => {
  const engine = new ReflectionEngine();
  const reflectionContext = context({ carriedForwardItems: [item('carry', false, 3)] });
  const [question] = engine.generate(reflectionContext);
  const followUp = engine.generateFollowUp({
    context: reflectionContext,
    question: question!,
    answer: ['TOO_LARGE', 'TIME_INSUFFICIENT'],
    currentQuestionCount: 1,
  });

  expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.multiChoice);
  expect(followUp?.type).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
});

it('finishes a no-op day on Нет and captures one useful note on Да', () => {
  const engine = new ReflectionEngine();
  const reflectionContext = context();
  const [question] = engine.generate(reflectionContext);

  expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.yesNo);
  expect(
    engine.generateFollowUp({
      context: reflectionContext,
      question: question!,
      answer: false,
      currentQuestionCount: 1,
    }),
  ).toBeNull();
  expect(
    engine.generateFollowUp({
      context: reflectionContext,
      question: question!,
      answer: true,
      currentQuestionCount: 1,
    })?.type,
  ).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
});
```

- [ ] **Step 2: Add failing ceiling, redundancy, and legacy-value tests**

```ts
it('does not create a follow-up at the five-question ceiling', () => {
  const engine = new ReflectionEngine();
  const reflectionContext = context();
  const [question] = engine.generate(reflectionContext);
  expect(
    engine.generateFollowUp({
      context: reflectionContext,
      question: question!,
      answer: true,
      currentQuestionCount: 5,
    }),
  ).toBeNull();
});

it('preserves PRIORITY_LOST and adds DISTRACTIONS as stored reason values', () => {
  expect(REFLECTION_FAILURE_REASON.priorityLost).toBe('PRIORITY_LOST');
  expect(REFLECTION_FAILURE_REASON.distractions).toBe('DISTRACTIONS');
});
```

- [ ] **Step 3: Run the policy test and confirm RED**

Run:

```powershell
npm run test:target -- src/domain/reflection/ReflectionEngine.test.ts
```

Expected: FAIL because `distractions` and `generateFollowUp` do not exist and current successful/no-op questions use legacy text types.

- [ ] **Step 4: Add the additive reason and quick option catalogs**

In `Reflection.ts`, extend without renaming stored values:

```ts
export const REFLECTION_FAILURE_REASON = {
  nextStepUnclear: 'NEXT_STEP_UNCLEAR',
  timeInsufficient: 'TIME_INSUFFICIENT',
  scopeTooLarge: 'TOO_LARGE',
  priorityLost: 'PRIORITY_LOST',
  energyLow: 'ENERGY_LOW',
  distractions: 'DISTRACTIONS',
  externalCause: 'EXTERNAL_CAUSE',
  purposeLost: 'PURPOSE_LOST',
  other: 'OTHER',
} as const;
```

In `ReflectionEngine.ts`, keep `PRIORITY_LOST` but label it `Изменился приоритет`; add
`DISTRACTIONS` labelled `Отвлечения`. Add a frozen success-factor catalog with stable values:

```ts
const SUCCESS_FACTOR_OPTIONS: readonly ReflectionQuestionOption[] = Object.freeze([
  { value: 'CLEAR_NEXT_STEP', label: 'Был ясен следующий шаг' },
  { value: 'PROTECTED_TIME', label: 'Удалось защитить время' },
  { value: 'MANAGEABLE_SCOPE', label: 'Объём был реалистичным' },
  { value: 'ENOUGH_ENERGY', label: 'Хватило энергии' },
  { value: 'SUPPORTIVE_ENVIRONMENT', label: 'Помогла среда' },
  { value: 'OTHER', label: 'Другое' },
]);
```

- [ ] **Step 5: Implement the minimal baseline and follow-up policy**

Change the successful main Decision to `SINGLE_CHOICE`, the no-op question to `YES_NO`, and keep
genuinely open adjustments as `SHORT_CAPTURE`. Add the exported input and method:

```ts
export interface ReflectionFollowUpInput {
  readonly context: ReflectionContext;
  readonly question: ReflectionQuestion;
  readonly answer: ReflectionAnswer;
  readonly currentQuestionCount: number;
}

public generateFollowUp(input: ReflectionFollowUpInput): ReflectionQuestion | null {
  if (input.currentQuestionCount >= 5) return null;
  const data = followUpData(input);
  if (data === null) return null;
  return ReflectionQuestion.create({
    id: `${input.question.id}:FOLLOW_UP`,
    kind: data.kind,
    signal: data.signal,
    type: data.type,
    prompt: data.prompt,
    context: data.context,
    required: true,
    sourceEntityIds: input.question.sourceEntityIds,
  });
}
```

`followUpData` has only these R3 branches:

- `MAIN_DECISION_SUCCESS` + a single-choice string → `YES_NO`, “Сохранить этот подход для следующего похожего Решения?”;
- `MAIN_DECISION_FAILURE_REASON` + a reason string → `SHORT_CAPTURE`, with a concrete-change prompt; `OTHER` asks for the missing cause;
- `REPEATED_FRICTION` + a non-empty string array → `SHORT_CAPTURE`, one next adjustment;
- `GENERAL_LEARNING` + `true` → `SHORT_CAPTURE`; `false` → `null`;
- every other kind/answer shape → `null`.

Keep `generate()` deterministic, its initial output at one to four questions, and convert other
known-fact questions to existing quick types only where an explicit fixed catalog is available.

- [ ] **Step 6: Run policy tests and review the diff**

Run:

```powershell
npm run test:target -- src/domain/reflection/ReflectionEngine.test.ts
git diff --check -- src/domain/reflection/Reflection.ts src/domain/reflection/ReflectionEngine.ts src/domain/reflection/ReflectionEngine.test.ts
```

Expected: PASS and no whitespace errors. Confirm the diff contains no new Signal type for
`DISTRACTIONS` and no renamed legacy stored value.

### Task 2: EveningCycle conditional insertion invariant

**Files:**

- Modify: `src/domain/evening-cycle/EveningCycle.ts`
- Test: `src/domain/evening-cycle/EveningCycle.test.ts`

**Interfaces:**

- Consumes: an answered parent already present in `reflectionQuestions` and a deterministic
  `ReflectionQuestion` from Task 1.
- Produces:

```ts
public insertReflectionFollowUp(
  parentQuestionId: string,
  question: ReflectionQuestion,
  occurredAt: Date,
): boolean;
```

- [ ] **Step 1: Write failing aggregate tests**

Add tests that initialize `[first, second]`, answer `first`, insert `followUp`, and assert order:

```ts
expect(cycle.insertReflectionFollowUp(first.id, followUp, STARTED_AT)).toBe(true);
expect(cycle.reflectionQuestions.map(({ id }) => id)).toEqual([first.id, followUp.id, second.id]);
expect(cycle.nextReflectionQuestion()?.id).toBe(followUp.id);
```

Add separate assertions for:

- unanswered parent → `reflection.follow_up_parent_unanswered`;
- unknown parent → `reflection.question_not_found`;
- duplicate identical id → returns `false` and does not bump version;
- duplicate id with different question → `reflection.duplicate_question`;
- fifth total question is accepted, sixth → `reflection.question_limit_exceeded`;
- non-`REFLECTING` state → existing invalid-transition error.

- [ ] **Step 2: Run the aggregate test and confirm RED**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/EveningCycle.test.ts
```

Expected: FAIL because `insertReflectionFollowUp` does not exist.

- [ ] **Step 3: Implement ordered idempotent insertion**

Add the method beside `recordReflectionResult`:

```ts
public insertReflectionFollowUp(
  parentQuestionId: string,
  question: ReflectionQuestion,
  occurredAt: Date,
): boolean {
  if (this.#state !== EVENING_CYCLE_STATE.reflecting) {
    throw invalidTransition(this.#state, EVENING_CYCLE_STATE.reflecting);
  }
  assertDate(occurredAt, 'Время добавления уточняющего вопроса');
  const parentIndex = this.#reflectionQuestions.findIndex(({ id }) => id === parentQuestionId);
  if (parentIndex < 0) {
    throw new DomainError('reflection.question_not_found', 'Родительский вопрос не найден.');
  }
  if (!this.#reflectionResults.some(({ questionId }) => questionId === parentQuestionId)) {
    throw new DomainError(
      'reflection.follow_up_parent_unanswered',
      'Уточняющий вопрос требует сохранённого ответа.',
    );
  }
  const existing = this.#reflectionQuestions.find(({ id }) => id === question.id);
  if (existing !== undefined) {
    if (sameQuestions([existing], [question])) return false;
    throw new DomainError('reflection.duplicate_question', 'Идентификатор вопроса уже используется.');
  }
  if (this.#reflectionQuestions.length >= 5) {
    throw new DomainError(
      'reflection.question_limit_exceeded',
      'Осмысление не может содержать больше пяти вопросов.',
    );
  }
  this.#reflectionQuestions = Object.freeze([
    ...this.#reflectionQuestions.slice(0, parentIndex + 1),
    question,
    ...this.#reflectionQuestions.slice(parentIndex + 1),
  ]);
  this.#updatedAt = copyDate(occurredAt);
  this.#version += 1;
  return true;
}
```

Do not loosen `initializeReflection` beyond its existing one-to-four bound; the fifth slot is only
for this conditional insertion.

- [ ] **Step 4: Run aggregate and reflection domain tests**

Run:

```powershell
npm run test:target -- src/domain/evening-cycle/EveningCycle.test.ts src/domain/reflection/Reflection.test.ts
git diff --check -- src/domain/evening-cycle/EveningCycle.ts src/domain/evening-cycle/EveningCycle.test.ts
```

Expected: PASS; legacy sequential answering and R2 answer validation remain green.

### Task 3: Atomic adaptive application flow

**Files:**

- Modify: `src/application/reflection/ReflectionApplicationService.ts`
- Test: `src/application/reflection/ReflectionApplicationService.test.ts`

**Interfaces:**

- Consumes: `ReflectionEngine.generateFollowUp` and
  `EveningCycle.insertReflectionFollowUp` from Tasks 1–2.
- Produces: unchanged public `answer(input: AnswerReflectionQuestionInput): Promise<ReflectionSession>`; callers need no new application service.

- [ ] **Step 1: Replace the one-answer completion expectation with a failing adaptive flow test**

For an unfinished main Decision:

```ts
const initial = await service.getSession(cycle.id);
const afterReason = await service.answer({
  cycleId: cycle.id,
  questionId: initial.currentQuestion!.id,
  answer: 'TOO_LARGE',
});

expect(afterReason.cycle.state).toBe(EVENING_CYCLE_STATE.reflecting);
expect(afterReason.currentQuestion?.id).toBe(`${initial.currentQuestion!.id}:FOLLOW_UP`);
expect(afterReason.currentQuestion?.type).toBe(REFLECTION_QUESTION_TYPE.shortCapture);

const completed = await service.answer({
  cycleId: cycle.id,
  questionId: afterReason.currentQuestion!.id,
  answer: 'Разделить объём до начала работы',
});
expect(completed.cycle.state).toBe(EVENING_CYCLE_STATE.planningTomorrow);
```

Keep the existing Signal assertion on the first answer.

- [ ] **Step 2: Add failing tests for transaction safety and modes**

Add cases proving:

- repeated `answer` for the parent does not call context again or duplicate result/follow-up;
- a reconstructed service resumes the persisted follow-up before the next baseline question;
- persistence CAS retry yields one result and one follow-up;
- `QUICK` completes after its single critical answer without inserting a follow-up;
- `EMERGENCY` remains question-free;
- completed history `getSession` still makes zero context/engine generation requests;
- no-op `false` completes immediately, no-op `true` persists one capture follow-up.

Use a counting engine subclass or injected object only through the existing constructor shape; do
not add another engine interface unless TypeScript requires a narrow `Pick<ReflectionEngine,
'generate' | 'generateFollowUp'>` constructor type.

- [ ] **Step 3: Run the application test and confirm RED**

Run:

```powershell
npm run test:target -- src/application/reflection/ReflectionApplicationService.test.ts
```

Expected: FAIL because normal mode currently completes as soon as the original saved queue is
processed.

- [ ] **Step 4: Implement the preflight and single optimistic mutation**

In `answer`:

```ts
const stored = await this.requiredCycle(input.cycleId);
const question = requiredQuestion(stored, input.questionId);
const existing = stored.reflectionResults.find(({ questionId }) => questionId === question.id);
if (existing !== undefined) return sessionFrom(stored);

const context = await this.#getContext.execute(input.cycleId);
const followUp =
  stored.mode === EVENING_CYCLE_MODE.normal
    ? this.#engine.generateFollowUp({
        context,
        question,
        answer: input.answer,
        currentQuestionCount: stored.reflectionQuestions.length,
      })
    : null;

const cycle = await this.mutate(input.cycleId, (current, occurredAt) => {
  const currentQuestion = requiredQuestion(current, input.questionId);
  if (current.reflectionResults.some(({ questionId }) => questionId === currentQuestion.id)) return;
  const result = ReflectionResult.answer(current.id, currentQuestion, input.answer, occurredAt);
  current.recordReflectionResult(
    result,
    createSignal(current, currentQuestion, input.answer, occurredAt),
    occurredAt,
  );
  if (followUp !== null) {
    current.insertReflectionFollowUp(currentQuestion.id, followUp, occurredAt);
  }
  if (current.mode === EVENING_CYCLE_MODE.quick) {
    current.completeReflectionForSelectedMode(occurredAt);
  } else if (current.reflectionProgress.complete) {
    current.completeReflection(occurredAt);
  }
});
```

The mutation must validate the question against the current clone. Never render or return the
follow-up before `saveIfVersionMatches` succeeds.

- [ ] **Step 5: Prove no TomorrowPlan mutation boundary was introduced**

In the application test, assert the service constructor and test setup still contain only cycle,
context, engine, clock, and id ports. Add an explicit behavioral assertion that answering creates
only Reflection results/signals/corrections on the stored cycle; no plan command callback is supplied
or invoked. Do not add a fake plan repository merely to prove an unreachable dependency.

- [ ] **Step 6: Run application and fast suites**

Run:

```powershell
npm run test:target -- src/application/reflection/ReflectionApplicationService.test.ts
npm run test:fast
git diff --check -- src/application/reflection/ReflectionApplicationService.ts src/application/reflection/ReflectionApplicationService.test.ts
```

Expected: PASS. Confirm `QUICK`, `EMERGENCY`, completed history, and CAS tests remain green.

### Task 4: Persistence and immutable history

**Files:**

- Test: `src/infrastructure/persistence/ReflectionPersistence.test.ts`
- Test: `src/presentation/pages/EveningCompletedHistoryScenes.test.ts`

**Interfaces:**

- Consumes: existing `EveningCycleRecordMapper` ordered arrays and R2 typed answer serializer.
- Produces: compatibility evidence only; no schema or production mapper change.

- [ ] **Step 1: Add a persistence round-trip test for an inserted follow-up**

Build a reflecting cycle with a single-choice parent and short-capture follow-up, answer both, save
through the existing IndexedDB repository, reload, and assert:

```ts
expect(restored?.reflectionQuestions.map(({ id }) => id)).toEqual([
  parent.id,
  `${parent.id}:FOLLOW_UP`,
]);
expect(restored?.reflectionResults.map(({ answer }) => answer)).toEqual([
  'DISTRACTIONS',
  'Убрать телефон до начала блока',
]);
```

Extend the same fixture or a separate R2 compatibility fixture to retain boolean and string-array
answers. Assert the imported IndexedDB schema version constant is unchanged from its current value.

- [ ] **Step 2: Add a history test using only the saved sequence**

Render a completed cycle whose stored order is parent → follow-up → baseline remainder. Assert each
prompt and answer appears in that order and that the renderer receives the saved cycle/session only.
Do not construct or invoke `ReflectionEngine` in the history test.

- [ ] **Step 3: Run persistence and history tests**

Run:

```powershell
npm run test:target -- src/infrastructure/persistence/ReflectionPersistence.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts
```

Expected: PASS without production persistence changes. If the test fails, fix the test setup or the
R2 mapper defect only when the failure proves an actual incompatibility; do not bump the database
version.

- [ ] **Step 4: Verify the persistence boundary stayed unchanged**

Run:

```powershell
git diff --name-only -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts src/infrastructure/persistence/mappers/EveningCycleRecordMapper.ts src/infrastructure/persistence/records/EveningCycleRecord.ts
git diff --check -- src/infrastructure/persistence/ReflectionPersistence.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts
```

Expected: the first command prints nothing; the second reports no whitespace errors.

### Task 5: Typed answer draft and one-question controls

**Files:**

- Create: `src/presentation/pages/ReflectionAnswerDraft.ts`
- Create: `src/presentation/pages/ReflectionAnswerDraft.test.ts`
- Modify: `src/presentation/pages/EveningReviewPanel.tsx`
- Modify: `src/presentation/pages/EveningReviewPanel.test.ts`
- Modify: `src/presentation/pages/EveningReflectionScene.tsx`
- Modify: `src/presentation/pages/EveningReflectionSceneVisual.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ReflectionAnswerDraft {
  readonly text: string;
  readonly choices: readonly string[];
  readonly yesNo: boolean | null;
}

export const EMPTY_REFLECTION_ANSWER_DRAFT: ReflectionAnswerDraft;

export function reflectionAnswerFromDraft(
  question: ReflectionQuestion,
  draft: ReflectionAnswerDraft,
): ReflectionAnswer | null;
```

- `EveningReflectionScene` consumes one `draft` and one `onDraftChange`; it remains a presentation
  component and never records domain state directly.

- [ ] **Step 1: Write failing typed-draft tests**

```ts
it.each([
  [REFLECTION_QUESTION_TYPE.yesNo, { text: '', choices: [], yesNo: false }, false],
  [
    REFLECTION_QUESTION_TYPE.singleChoice,
    { text: 'TOO_LARGE', choices: [], yesNo: null },
    'TOO_LARGE',
  ],
  [
    REFLECTION_QUESTION_TYPE.multiChoice,
    { text: '', choices: ['TOO_LARGE'], yesNo: null },
    ['TOO_LARGE'],
  ],
  [
    REFLECTION_QUESTION_TYPE.shortCapture,
    { text: '  Один шаг  ', choices: [], yesNo: null },
    'Один шаг',
  ],
])('derives a typed %s answer', (type, draft, expected) => {
  expect(reflectionAnswerFromDraft(question(type), draft)).toEqual(expected);
});

it('returns null for an unanswered typed draft', () => {
  expect(
    reflectionAnswerFromDraft(
      question(REFLECTION_QUESTION_TYPE.yesNo),
      EMPTY_REFLECTION_ANSWER_DRAFT,
    ),
  ).toBeNull();
});
```

Also cover legacy `SHORT_TEXT`/`OPTIONAL_TEXT` and ensure unsupported empty/rating drafts return
`null` rather than a forged answer.

- [ ] **Step 2: Run the draft test and confirm RED**

Run:

```powershell
npm run test:target -- src/presentation/pages/ReflectionAnswerDraft.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure typed draft converter**

Use a switch on `question.type`; return `null` for missing values, freeze/copy multi-choice arrays,
trim capture/text values, and preserve `false` as a valid YES/NO answer. Do not cast through
`unknown` or use `any`.

- [ ] **Step 4: Add failing scene/controller tests**

Extend `EveningReflectionSceneVisual.test.ts` with:

```ts
expect(yesNoMarkup).toContain('aria-label="Да"');
expect(yesNoMarkup).toContain('aria-label="Нет"');
expect(yesNoMarkup.match(/type="button"/g)).toHaveLength(3); // Да, Нет, primary CTA
expect(shortCaptureMarkup).toContain('maxlength="2000"');
expect(shortCaptureMarkup.match(/evening-reflection-question-block/g)).toHaveLength(1);
```

Extend `EveningReviewPanel.test.ts` so a `false` answer reaches `reflection.answer` as boolean
`false`, a multi-choice answer remains `readonly string[]`, and applying the returned session clears
all three draft fields before showing the next saved question.

- [ ] **Step 5: Wire the typed draft through the existing panel**

Replace the two independent state variables with:

```ts
const [reflectionDraft, setReflectionDraft] = useState<ReflectionAnswerDraft>(
  EMPTY_REFLECTION_ANSWER_DRAFT,
);
```

`applyReflectionSession` resets to a fresh copied empty draft. `handleReflectionAnswer` calls
`reflectionAnswerFromDraft`; when it returns `null`, leave the current question visible and do not
call the application service. Pass `draft`/`onDraftChange` through `EveningReviewPanelView`, the
embedded `EveningReflectionScene`, and the legacy `AdaptiveReflectionSection` path so both render
paths understand the same typed answer.

- [ ] **Step 6: Render YES/NO and SHORT_CAPTURE without a new page pattern**

In `ReflectionQuestionCard`:

- render two large buttons labelled `Да` and `Нет` for `YES_NO`;
- set `aria-pressed` and the existing `is-selected` class;
- keep false distinct from unanswered `null`;
- include `SHORT_CAPTURE` in the existing text-control branch;
- derive CTA disabled state with `reflectionAnswerFromDraft(question, draft) === null`;
- keep exactly one current question card and existing guidance panel;
- retain legacy short-text and optional-text rendering for old cycles.

Update the fallback `ReflectionQuestionForm` in `EveningReviewPanel.tsx` with the same types rather
than allowing YES/NO to fall through to a blank textarea.

- [ ] **Step 7: Run presentation tests**

Run:

```powershell
npm run test:target -- src/presentation/pages/ReflectionAnswerDraft.test.ts src/presentation/pages/EveningReflectionSceneVisual.test.ts src/presentation/pages/EveningReviewPanel.test.ts
npm run typecheck
```

Expected: PASS with no `any`, no invalid union narrowing, and one-question markup intact.

### Task 6: Approved visual, mobile, focus, and error states

**Files:**

- Modify: `src/presentation/pages/EveningReflectionScene.tsx`
- Modify: `src/presentation/pages/EveningReflectionSceneVisual.test.ts`
- Modify: `src/presentation/styles/global.css`

**Interfaces:**

- Consumes: existing `.evening-reflection-*` selectors and LifeOS tokens.
- Produces: approved 65/35 desktop layout and single-column mobile layout for typed quick controls.

- [ ] **Step 1: Add failing visual contract assertions**

Protect:

- YES/NO buttons have a minimum 44px block size;
- selected state uses existing gold semantics and focus-visible outline;
- disabled/submitting state remains visible and stable;
- `.evening-reflection-workspace` stays `65fr/35fr` on desktop;
- media queries at `60rem` and `48rem` collapse to one column;
- mobile primary CTA uses full available width;
- long labels use wrapping and no horizontal overflow;
- `role="alert"` stays inside the Reflection scene for retry on the same question.

Use the existing CSS-reading style in `EveningReflectionSceneVisual.test.ts`; do not snapshot the
entire stylesheet.

- [ ] **Step 2: Run the visual test and confirm RED**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningReflectionSceneVisual.test.ts
```

Expected: FAIL only for the new YES/NO/mobile selectors.

- [ ] **Step 3: Refine existing selectors**

Add `.evening-reflection-yes-no` and its buttons under the existing Evening command-center scope.
Reuse `--color-gold-*`, existing graphite surfaces, border radii, transition, and focus tokens. Keep
the question as the dominant visual center; do not introduce permanent violet or a new atmosphere
asset. In existing mobile media queries, stack guidance after the question and make the primary CTA
full width with safe bottom spacing.

- [ ] **Step 4: Run visual/presentation tests and format touched files**

Run:

```powershell
npm run test:target -- src/presentation/pages/EveningReflectionSceneVisual.test.ts src/presentation/pages/EveningReviewPanel.test.ts
.\node_modules\.bin\prettier.cmd --write src/presentation/pages/ReflectionAnswerDraft.ts src/presentation/pages/ReflectionAnswerDraft.test.ts src/presentation/pages/EveningReviewPanel.tsx src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningReflectionScene.tsx src/presentation/pages/EveningReflectionSceneVisual.test.ts src/presentation/styles/global.css
```

Expected: PASS and the already-installed local Prettier changes only the listed R3 files.

### Task 7: R3 verification and handoff

**Files:**

- Modify: `docs/design/features/2026-08-30-r3-adaptive-reflection-flow.md` only to record factual test/visual status after checks.
- Review: every R3 file listed above.

**Interfaces:**

- Produces: verified R3 implementation and evidence; no R4 work.

- [ ] **Step 1: Run the complete targeted R3 set**

Run:

```powershell
npm run test:target -- src/domain/reflection/Reflection.test.ts src/domain/reflection/ReflectionEngine.test.ts src/domain/evening-cycle/EveningCycle.test.ts src/application/reflection/ReflectionApplicationService.test.ts src/infrastructure/persistence/ReflectionPersistence.test.ts src/presentation/pages/ReflectionAnswerDraft.test.ts src/presentation/pages/EveningReflectionSceneVisual.test.ts src/presentation/pages/EveningReviewPanel.test.ts src/presentation/pages/EveningCompletedHistoryScenes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the canonical R3 Stage Gate once**

Run:

```powershell
npm run verify
```

Expected: exit code 0. Per the factual `package.json`, this runs typecheck → lint → unit/integration →
infrastructure → alpha → build → format check → `git diff --check`, without Playwright.

- [ ] **Step 3: Perform controlled browser QA**

Start the existing Vite app in a controlled terminal, open the real Evening Reflection route through
normal app navigation, and inspect these viewports:

- 1600×900;
- 1280×720;
- 390×844;
- 360×800.

Exercise successful, unfinished, repeated carry-forward, no-op yes/no, selected, submitting,
inline-error/retry, completion, refresh, and completed-history states. Confirm:

- one question visible at a time;
- focus moves predictably to the next question or error;
- keyboard and touch controls work;
- no horizontal overflow or bottom-nav overlap;
- history does not generate questions;
- browser console has no new errors.

Compare desktop and mobile results with
`D:/LifeOS-App/Evening_UI_Reference_for_Codex/02_reflection.png` and complete Rule 38. Stop only the
dev-server process started for this QA.

- [ ] **Step 4: Decide whether the full E2E exception is actually triggered**

Default R3 decision: do not run `npm run test:e2e`. Run it only when the final diff proves R3 changed
routing, navigation state, IndexedDB schema/mapper behavior, critical startup/recovery, or another
cross-cutting browser contract listed in `AGENTS.md`. Before running, state the exact changed contract
that requires it. UI rendering by itself is covered by the mandatory browser QA and targeted tests.

- [ ] **Step 5: Perform Git hygiene without touching unrelated changes**

Run:

```powershell
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Review every R3 hunk. Do not stage, revert, format, or claim ownership of unrelated Morning/R2/user
changes.

- [ ] **Step 6: Update factual status and report the stage gate**

In the design spec, check only Definition-of-Done items supported by fresh command/browser evidence.
Keep final visual status `PENDING` until the user explicitly approves the implemented visual result.
Report changed R3 files, targeted results, `npm run verify`, browser viewports/states, the full-E2E
decision, compatibility evidence, and remaining manual approval.

End the implementation report exactly with:

```text
R3 COMPLETE — WAITING FOR USER APPROVAL.
```

Do not begin R4.
