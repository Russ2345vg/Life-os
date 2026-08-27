# WALK-04 Completion and Reentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершать активную прогулку, сохранять короткий post-walk outcome в том же `Walk` и показывать безопасный экран возвращения.

**Architecture:** Существующий `CompleteWalk` немедленно фиксирует `completed` и `endedAt`. Новый доменный метод и application-команда `RecordWalkOutcome` дополняют тот же completed Walk полями `afterState`, `impact` и reflection, после чего Presentation показывает reentry на основе существующего `returnContext`.

**Tech Stack:** TypeScript 5, React 19, Vitest, IndexedDB/fake-indexeddb, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-walk-04-completion-reentry-design.md`

## Global Constraints

- WALK-03.1 — принятый baseline; WALK-01/02/03/03.1 не переписывать без доказанной необходимости.
- WALK-05 и дальше не начинать.
- Не создавать `WalkResult`, второй aggregate, второй repository/store или второй completion/session engine.
- Не добавлять аналитику, графики, voice, GPS, maps, photos, recommendation engine или автоматические изменения Routine/Decision/Goal.
- Поток зависимостей остаётся `UI → Presentation → Application → Domain`; Infrastructure реализует application-порты.
- Не использовать `any`, не добавлять зависимости и не писать в IndexedDB из React.
- Сохранить чтение старых Walk без `impact`, `afterState` и новых optional-полей.
- Все production-изменения выполняются только после наблюдаемого RED соответствующего теста.
- Существующие staged/unstaged изменения принадлежат cumulative WALK-01/02/03/03.1. Не коммитить production-файлы по отдельности: они пересекаются с предыдущими этапами. На каждом checkpoint фиксировать diff и результаты тестов; новый commit возможен только по отдельному запросу пользователя.

---

### Task 1: Доменный контракт outcome в существующем Walk

**Files:**

- Create: `src/domain/walk/WalkImpact.ts`
- Modify: `src/domain/walk/Walk.ts`
- Modify: `src/domain/walk/index.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/walk/Walk.test.ts`

**Interfaces:**

- Consumes: `WalkStateSnapshot`, существующие `Walk.status`, `Walk.endedAt`, `Walk.result`, optimistic `version`.
- Produces: `WALK_IMPACT`, `WalkImpact`, `WalkOutcomeData`, `Walk.impact`, `Walk.recordOutcome(data)`.

- [ ] **Step 1: Написать RED-тесты домена**

Добавить отдельные тесты, которые выражают публичный контракт:

```ts
const completed = runningWalk().complete({ endedAt: ENDED_AT });
const recorded = completed.recordOutcome({
  afterState: { energy: 7, tension: 2, clarity: 8 },
  impact: WALK_IMPACT.better,
  reflection: 'Стало понятнее, с чего начать.',
  updatedAt: OUTCOME_AT,
});

expect(recorded).toMatchObject({
  status: WALK_STATUS.completed,
  endedAt: ENDED_AT,
  afterState: { energy: 7, tension: 2, clarity: 8 },
  impact: WALK_IMPACT.better,
  result: 'Стало понятнее, с чего начать.',
  version: completed.version + 1,
});
expect(recorded.actualDurationMilliseconds).toBe(completed.actualDurationMilliseconds);
```

Также проверить `walk.outcome_requires_completed`, `walk.outcome_already_recorded`, trim/nullable reflection, invalid impact при rehydrate и независимое копирование `afterState`.

- [ ] **Step 2: Запустить RED**

Run: `npx vitest run src/domain/walk/Walk.test.ts`

Expected: FAIL, потому что `WALK_IMPACT`, `impact` и `recordOutcome` ещё не существуют.

- [ ] **Step 3: Реализовать минимальный доменный контракт**

Создать:

```ts
export const WALK_IMPACT = {
  better: 'better',
  same: 'same',
  worse: 'worse',
} as const;

export type WalkImpact = (typeof WALK_IMPACT)[keyof typeof WALK_IMPACT];

export function isWalkImpact(value: unknown): value is WalkImpact {
  return Object.values(WALK_IMPACT).some((impact) => impact === value);
}
```

Расширить `WalkRehydrationData` optional `impact?: WalkImpact | null`, а `Walk` — readonly `impact: WalkImpact | null`. Новые Walk получают `impact: null`; missing rehydration value нормализуется в `null`.

Добавить:

```ts
export interface WalkOutcomeData {
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection?: string;
  readonly updatedAt: Date;
}

public recordOutcome(data: WalkOutcomeData): Walk {
  if (this.status !== WALK_STATUS.completed) {
    throw new DomainError('walk.outcome_requires_completed', 'Итог можно сохранить только после завершения прогулки.');
  }
  if (this.impact !== null) {
    throw new DomainError('walk.outcome_already_recorded', 'Итог прогулки уже сохранён.');
  }
  return new Walk({
    ...this.toRehydrationData(),
    afterState: data.afterState,
    impact: data.impact,
    result: normalizeResult(data.reflection),
    updatedAt: data.updatedAt,
    version: this.version + 1,
  });
}
```

Проверить `updatedAt >= endedAt`, `isWalkStateSnapshot(data.afterState)` и `isWalkImpact(data.impact)` через существующий invariant path. Не запрещать nullable outcome у старых completed Walk.

- [ ] **Step 4: Запустить GREEN и соседние доменные тесты**

Run: `npx vitest run src/domain/walk/Walk.test.ts src/application/commands/FinishWalk.test.ts`

Expected: PASS; существующее завершение и длительность не изменились.

- [ ] **Step 5: Проверить diff checkpoint**

Run: `git diff --check -- src/domain/walk/WalkImpact.ts src/domain/walk/Walk.ts src/domain/walk/index.ts src/domain/index.ts src/domain/walk/Walk.test.ts`

Expected: exit 0. Не создавать production commit из-за пересечения текущего cumulative worktree.

---

### Task 2: Application-команда записи outcome и composition

**Files:**

- Create: `src/application/commands/RecordWalkOutcome.ts`
- Create: `src/application/commands/RecordWalkOutcome.test.ts`
- Modify: `src/application/commands/CreateWalk.ts`
- Modify: `src/application/commands/WalkCommands.test.ts`
- Modify: `src/application/index.ts`
- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`

**Interfaces:**

- Consumes: `Walk.recordOutcome`, `WalkRepository.findById`, `updateIfVersionMatches`, application `Clock`.
- Produces: `RecordWalkOutcomeInput`, `RecordWalkOutcome.execute()`, `LifeOsApplication.recordWalkOutcome`; `CreateWalkInput` сохраняет optional `linkedEntity` и `returnContext`.

- [ ] **Step 1: Написать RED-тесты команды**

```ts
const result = await new RecordWalkOutcome(repository, new FakeClock(OUTCOME_AT)).execute({
  walkId: completed.id,
  afterState: { energy: 7, tension: 2, clarity: 8 },
  impact: WALK_IMPACT.better,
  reflection: '  Стало спокойнее.  ',
});

expect(result).toMatchObject({
  ok: true,
  value: {
    endedAt: ENDED_AT,
    impact: WALK_IMPACT.better,
    result: 'Стало спокойнее.',
  },
});
```

Отдельно проверить not found, active Walk, повторную запись и version conflict. В `WalkCommands.test.ts` проверить, что `CreateWalk.execute()` не теряет переданные `linkedEntity`/`returnContext`.

- [ ] **Step 2: Запустить RED**

Run: `npx vitest run src/application/commands/RecordWalkOutcome.test.ts src/application/commands/WalkCommands.test.ts`

Expected: FAIL из-за отсутствующей команды и отсутствующей передачи context в `CreateWalk`.

- [ ] **Step 3: Реализовать `RecordWalkOutcome`**

```ts
export interface RecordWalkOutcomeInput {
  readonly walkId: EntityId;
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection?: string;
}

export class RecordWalkOutcome {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: RecordWalkOutcomeInput): Promise<Result<Walk, DomainError>> {
    // find → recordOutcome(clock.now()) → updateIfVersionMatches
  }
}
```

Использовать те же паттерны `failure/success`, not-found и version-conflict, что в `CompleteWalk`. Не выполнять скрытый retry.

- [ ] **Step 4: Передать существующий context через `CreateWalk`**

Расширить base input exact типами `WalkLinkedEntity | null` и `WalkReturnContext | null`, затем передать их в `Walk.create`. Не добавлять новые UI entry points.

- [ ] **Step 5: Подключить команду в composition**

Экспортировать команду, создать один instance рядом с `CompleteWalk`, добавить readonly `recordWalkOutcome` в `LifeOsApplication` и передать его из `createLifeOsApplication`.

- [ ] **Step 6: Запустить GREEN и composition type tests**

Run: `npx vitest run src/application/commands/RecordWalkOutcome.test.ts src/application/commands/WalkCommands.test.ts src/app/composition/WalkComposition.integration.test.ts`

Expected: PASS; существующие start/pause/resume/complete сценарии остаются зелёными.

- [ ] **Step 7: Проверить checkpoint**

Run: `npm run typecheck`

Expected: exit 0 без `any` и без новых циклических импортов.

---

### Task 3: Persistence и backward-compatible round trip

**Files:**

- Modify: `src/infrastructure/persistence/records/WalkRecord.ts`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.ts`
- Modify: `src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbWalkRepository.test.ts`
- Modify: `src/app/composition/WalkComposition.integration.test.ts`

**Interfaces:**

- Consumes: `Walk.impact`, `isWalkImpact`, `RecordWalkOutcome`.
- Produces: optional `WalkRecord.impact?: string | null` с чтением missing field как `null`.

- [ ] **Step 1: Написать RED mapper-тесты**

Проверить три независимых контракта:

```ts
expect(WalkRecordMapper.toRecord(completedWithOutcome)).toMatchObject({
  afterState: { energy: 7, tension: 2, clarity: 8 },
  impact: 'better',
  result: 'Стало спокойнее.',
});

expect(WalkRecordMapper.fromRecord(legacyRecordWithoutImpact).impact).toBeNull();
expect(() => WalkRecordMapper.fromRecord({ ...record, impact: 'unknown' })).toThrowError(/impact/);
```

- [ ] **Step 2: Запустить RED mapper tests**

Run: `npx vitest run src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts`

Expected: FAIL, потому что record/mapper ещё не знают `impact`.

- [ ] **Step 3: Реализовать optional persistence field**

Добавить optional nullable record field, записывать `walk.impact`, читать через `Object.hasOwn` и `readNullableString`, затем валидировать `isWalkImpact`. `schemaVersion` оставить равной 1.

- [ ] **Step 4: Написать RED IndexedDB/composition round-trip**

Сценарий должен создать и запустить Walk, вызвать `CompleteWalk`, затем `RecordWalkOutcome`, закрыть приложение, открыть ту же базу и проверить `endedAt`, `afterState`, `impact`, `result`, длительность и отсутствие изменений внешних repositories.

- [ ] **Step 5: Запустить RED round-trip**

Run: `npx vitest run src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts`

Expected: FAIL до полного mapper/composition wiring.

- [ ] **Step 6: Завершить mapper/composition wiring и запустить GREEN**

Run: `npx vitest run src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts`

Expected: PASS; legacy records читаются, новый outcome восстанавливается после reopen.

---

### Task 4: Quick completion и Reentry presentation

**Files:**

- Create: `src/presentation/walk/WalkCompletionFlow.tsx`
- Create: `src/presentation/walk/WalkCompletionFlow.test.ts`
- Modify: `src/presentation/walk/WalkSessionPresentation.ts`
- Modify: `src/presentation/walk/WalkSessionFlow.tsx`

**Interfaces:**

- Consumes: completed `Walk`, `WALK_IMPACT`, `WalkReturnContext`, существующий `WalkStateSnapshot`.
- Produces: `WalkOutcomeDraft`, `WalkQuickCompletionPanel`, `WalkReentryPanel`, `getWalkReturnPresentation`.

- [ ] **Step 1: Написать RED SSR presentation tests**

Проверить, что Quick completion отображает режим, фактическую длительность, start/end, beforeState, три afterState ranges, ровно три impact options и корректный optional prompt. Для reflection intent ожидается «Что стало понятнее?», для остальных — «Что изменилось?». Основная CTA disabled, пока impact не выбран.

Проверить Reentry:

```ts
expect(returnContextMarkup).toContain('Вернуться к решению');
expect(returnContextMarkup).toContain('Следующий шаг');
expect(fallbackMarkup).toContain('Вернуться к прогулкам');
expect(fallbackMarkup).toContain('На экран «Сегодня»');
```

- [ ] **Step 2: Запустить RED**

Run: `npx vitest run src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/pages/WalksPage.test.ts`

Expected: FAIL, потому что новые панели ещё не существуют.

- [ ] **Step 3: Реализовать `WalkQuickCompletionPanel`**

Компонент принимает:

```ts
interface WalkQuickCompletionPanelProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onSave: (draft: WalkOutcomeDraft) => void;
}

export interface WalkOutcomeDraft {
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection: string;
}
```

Инициализировать state значениями `beforeState ?? { energy: 5, tension: 5, clarity: 5 }`. Не предвыбирать impact. Переиспользовать визуальный контракт sliders WALK-03.1, но не изменять подготовительную бизнес-логику.

- [ ] **Step 4: Реализовать `WalkReentryPanel` и presentation mapping**

`getWalkReturnPresentation(context)` возвращает только пользовательский label и destination из существующих `APP_SECTION`; никаких writes или entity lookup. Панель показывает optional `nextStep`, green success state, одну gold primary CTA и максимум одну secondary CTA.

- [ ] **Step 5: Обновить confirmation copy**

В `WalkActivePanel` заменить обещание «Итог можно оформить позже» на точное описание короткого следующего шага. Сохранить Escape, возврат focus и текущие 52 px controls.

- [ ] **Step 6: Запустить GREEN**

Run: `npx vitest run src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/pages/WalksPage.test.ts src/presentation/walk/WalkTimer.test.ts`

Expected: PASS; active timer и WALK-03.1 presentation не регрессировали.

---

### Task 5: Оркестрация Active → Completion → Reentry

**Files:**

- Modify: `src/presentation/pages/WalksPage.tsx`
- Modify: `src/presentation/pages/WalksPage.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/presentation/layouts/ApplicationShellView.test.ts`

**Interfaces:**

- Consumes: `CompleteWalk`, `RecordWalkOutcome`, Quick completion/Reentry panels, `APP_SECTION`.
- Produces: presentation phases `completion` и `reentry`; callbacks `recordWalkOutcome` и `onOpenSection` в `WalksPageProps`.

- [ ] **Step 1: Написать RED orchestration contracts**

Зафиксировать ожидаемые phase rules в pure helper либо через существующий render contract:

- success `CompleteWalk` сохраняет возвращённый completed Walk и открывает Quick completion;
- success `RecordWalkOutcome` открывает Reentry;
- failed outcome остаётся на Quick completion;
- fallback primary возвращает `sessionPhase = center`, secondary вызывает `APP_SECTION.today`;
- context primary вызывает точный existing destination без application-команд внешнего модуля.

- [ ] **Step 2: Запустить RED**

Run: `npx vitest run src/presentation/pages/WalksPage.test.ts src/presentation/layouts/ApplicationShellView.test.ts`

Expected: FAIL до wiring новых phases/props.

- [ ] **Step 3: Изменить finish orchestration**

Расширить `WalkSessionPhase` значениями `completion | reentry` и добавить `completedWalk: Walk | null`. `finishActiveWalk` после успешного `CompleteWalk` должен:

```ts
setFinishConfirmationOpen(false);
setActiveWalkState({ status: 'ready', value: null });
setCompletedWalk(completed.value);
setSessionPhase('completion');
await Promise.all([reload(), reloadStatistics()]);
```

Не возвращать пользователя сразу в Center.

- [ ] **Step 4: Добавить outcome orchestration**

`saveWalkOutcome` использует `WalkSubmissionGuard`, вызывает `recordWalkOutcome.execute`, сохраняет возвращённый Walk, открывает `reentry` и перезагружает list/statistics. Ошибка оставляет form state смонтированным.

- [ ] **Step 5: Добавить безопасную навигацию reentry**

Для `walks` и fallback primary очистить `completedWalk` и открыть Center. Для остальных destination вызвать переданный `onOpenSection`. Не вызывать команды Routine/Decision/Goal.

- [ ] **Step 6: Подключить props в `ApplicationShell`**

Передать `recordWalkOutcome={application.recordWalkOutcome}` и `onOpenSection={openSection}`. Не менять существующее поведение `openSection`.

- [ ] **Step 7: Запустить GREEN и соседние UI tests**

Run: `npx vitest run src/presentation/pages/WalksPage.test.ts src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/app/ApplicationStartup.test.ts`

Expected: PASS; startup restore active/paused и соседняя navigation остаются рабочими.

---

### Task 6: LifeOS styling, mobile constraints и browser flow

**Files:**

- Modify: `src/presentation/styles/global.css`
- Modify: `tests/e2e/lifeos.smoke.spec.ts`
- Evidence only: `.codex-temp/walk04-after/*.png`

**Interfaces:**

- Consumes: semantic class names новых WALK-04 panels.
- Produces: compact desktop/mobile layout и executable browser acceptance scenario.

- [ ] **Step 1: Написать RED Playwright assertions до CSS/flow completion**

Добавить сценарий `completes WALK-04 and returns safely`, который:

1. открывает Walks;
2. запускает прогулку и ждёт не менее 10 секунд;
3. сохраняет active screenshot;
4. подтверждает завершение;
5. проверяет Quick completion и frozen ended duration;
6. выбирает afterState, impact и optional reflection;
7. сохраняет outcome;
8. проверяет Reentry fallback и переход на Сегодня;
9. повторяет layout assertions при 1366×768 и 360×800.

Проверки mobile должны измерять bounds самого completion/reentry stage, `scrollWidth <= clientWidth`, touch-target ≥44 px и отсутствие пересечения с bottom navigation.

- [ ] **Step 2: Запустить RED E2E**

Run: `npm run test:e2e -- tests/e2e/lifeos.smoke.spec.ts --grep "completes WALK-04 and returns safely"`

Expected: FAIL на отсутствующем Quick completion/Reentry либо новых layout assertions. Ограничить наблюдение процесса; hang после результатов не считать pass.

- [ ] **Step 3: Реализовать scoped WALK-04 CSS**

Добавить только `.walk-completion-*` и `.walk-reentry-*` rules поверх графитовой базы WALK-03.1. Gold использовать для primary/selected, green — для completed confirmation, red — только в finish confirm. Добавить mobile stacking, bottom safe padding, focus-visible и reduced-motion. Не менять глобальные Routine/Decision/Today selectors.

- [ ] **Step 4: Запустить GREEN desktop/mobile E2E**

Run: `npm run test:e2e -- tests/e2e/lifeos.smoke.spec.ts --grep "completes WALK-04 and returns safely"`

Expected: desktop и mobile cases PASS, console/page errors пусты. Если canonical Playwright webServer снова зависает после завершённых cases, отдельно выполнить эквивалентный bounded run с явно управляемым Vite и честно зафиксировать canonical lifecycle как unresolved infrastructure limitation.

- [ ] **Step 5: Сохранить screenshots**

Сохранить без добавления в Git:

- `.codex-temp/walk04-after/walk04-active-desktop-1366.png`;
- `.codex-temp/walk04-after/walk04-completion-desktop-1366.png`;
- `.codex-temp/walk04-after/walk04-reentry-desktop-1366.png`;
- `.codex-temp/walk04-after/walk04-completion-mobile-360.png`;
- `.codex-temp/walk04-after/walk04-reentry-mobile-360.png`.

Визуально проверить каждый файл, а не только факт существования.

---

### Task 7: Финальный cumulative quality gate и отчёт

**Files:**

- Review only: весь cumulative diff WALK-01/02/03/03.1/04
- Do not add: `.codex-temp/`

**Interfaces:**

- Consumes: все результаты Tasks 1–6.
- Produces: evidence-backed verdict и отчёт в формате пользовательского запроса.

- [ ] **Step 1: Запустить целевые Walk regression tests**

Run:

```text
npx vitest run src/domain/walk/Walk.test.ts src/application/commands/FinishWalk.test.ts src/application/commands/RecordWalkOutcome.test.ts src/application/commands/WalkCommands.test.ts src/application/commands/WalkActiveCommands.test.ts src/infrastructure/persistence/mappers/WalkRecordMapper.test.ts src/infrastructure/persistence/IndexedDbWalkRepository.test.ts src/app/composition/WalkComposition.integration.test.ts src/presentation/walk/WalkTimer.test.ts src/presentation/walk/WalkCompletionFlow.test.ts src/presentation/pages/WalksPage.test.ts
```

Expected: all pass.

- [ ] **Step 2: Запустить alpha и полный gate**

Run: `npm run test:alpha`

Run: `npm run verify`

Expected: typecheck, lint, full Vitest, build, format check и `git diff --check` exit 0.

- [ ] **Step 3: Провести финальный diff review**

Проверить отсутствие второго aggregate/engine/repository, неизменность elapsed timestamps, backward compatibility, отсутствие внешних Routine/Decision/Goal writes, отсутствие WALK-05 и отсутствие `.codex-temp` в index.

- [ ] **Step 4: Зафиксировать точный repository state**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --name-status`

Expected: только ожидаемый cumulative scope; `.codex-temp/` untracked.

- [ ] **Step 5: Подготовить финальный отчёт и остановиться**

Вернуть разделы: реализовано, flow, таблица файлов WALK-04, persistence, returnContext, RED→GREEN evidence, Browser verification, screenshots, checks, точный Git status и явное подтверждение «WALK-05 не начат». Не выполнять push.
