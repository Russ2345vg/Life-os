import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import type {
  CommitPreparationInput,
  EveningReviewSnapshot,
  OpenLoopItem,
  PreparationSnapshot,
  ReflectionSession,
} from '../../application';
import {
  Day,
  DayDate,
  type Decision,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  type LifeAction,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionCorrection,
  ReflectionQuestion,
  ReflectionResult,
  PREPARATION_CATEGORY,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  TomorrowPlan,
} from '../../domain';
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { TestDecisionRepository, TestLifeActionRepository } from '../../test/helpers/TestRepositories';
import { InMemoryEveningCycleRepository } from '../../infrastructure/persistence/InMemoryEveningCycleRepository';
import { InMemoryPreparationPlanRepository } from '../../infrastructure/persistence/InMemoryPreparationPlanRepository';
import { InMemoryPreparationRuleRepository } from '../../infrastructure/persistence/InMemoryPreparationRuleRepository';
import { InMemoryProjectRepository } from '../../infrastructure/persistence/InMemoryProjectRepository';
import { InMemoryTomorrowPlanRepository } from '../../infrastructure/persistence/InMemoryTomorrowPlanRepository';
import { PreparationService } from '../../application/preparation/PreparationService';
import {
  EveningReflectionHistoryScene,
  EveningTodayHistoryScene,
} from './EveningCompletedHistoryScenes';
import {
  eveningHistoryOutcomePresentation,
  openLoopResolutionHistoryLabel,
} from './EveningCompletedHistoryPresentation';
import { EveningResolvingScene } from './EveningResolvingScene';
import { PreparationSceneView } from './PreparationPanel';

const DATE = DayDate.create('2026-08-21');
const TOMORROW = DayDate.create('2026-08-22');
const NOW = new Date('2026-08-21T20:00:00.000+09:00');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const e113cCss = globalCss.slice(globalCss.lastIndexOf('/* E11.3C:'));

describe('completed evening history scenes', () => {
  it('показывает сохранённые области среды и исходы нового плана без изменения истории', () => {
    const sleepItem = preparationItem(
      'sleep-completed',
      'Проветрить комнату',
      PREPARATION_AREA.sleepEnvironment,
    ).complete(NOW);
    const tomorrowItem = preparationItem(
      'tomorrow-skipped',
      'Положить одежду на завтра',
      PREPARATION_AREA.tomorrowStart,
    ).skip(NOW, 'Уже подготовлено');
    const plan = completedPreparationPlan([
      sleepItem,
      tomorrowItem,
      preparationItem('sleep-required', 'Убрать экран', PREPARATION_AREA.sleepEnvironment).complete(NOW),
      preparationItem('tomorrow-required', 'Поставить воду', PREPARATION_AREA.tomorrowStart).complete(NOW),
    ]);
    const versionBefore = plan.version;

    const markup = renderPreparationHistory(plan);
    const sleepArea = preparationAreaMarkup(markup, 'sleep_environment', 'tomorrow_start');
    const tomorrowArea = preparationAreaMarkup(markup, 'tomorrow_start');

    expect(markup).toContain('Среда для сна');
    expect(markup).toContain('Среда для завтра');
    expect(sleepArea).toContain('Проветрить комнату');
    expect(sleepArea).toContain('Выполнено');
    expect(sleepArea).not.toContain('Положить одежду на завтра');
    expect(tomorrowArea).toContain('Положить одежду на завтра');
    expect(tomorrowArea).toContain('Было осознанно пропущено');
    expect(tomorrowArea).not.toContain('Проветрить комнату');
    expect(markup).toContain('>Изменить подготовку</button>');
    expect(markup).not.toContain('>Выполнено</button>');
    expect(markup).not.toContain('>Пропустить сегодня</button>');
    expect(plan.version).toBe(versionBefore);
    expect(plan.items.map((item) => item.status)).toEqual([
      sleepItem.status,
      tomorrowItem.status,
      'COMPLETED',
      'COMPLETED',
    ]);
  });

  it('открывает сохранённый completed history без генерации, записи или application mutation', async () => {
    const cycles = new InMemoryEveningCycleRepository();
    const tomorrowPlans = new InMemoryTomorrowPlanRepository();
    const preparationPlans = new InMemoryPreparationPlanRepository();
    const rules = new InMemoryPreparationRuleRepository();
    const ids = new FakeIdGenerator('completed-history-read');
    const cycle = completedCycle();
    const tomorrowPlan = TomorrowPlan.create({
      id: EntityId.create('completed-history-tomorrow-plan'),
      cycleId: cycle.id,
      sourceDayId: cycle.dayId,
      targetDayId: EntityId.create('completed-history-target-day'),
      targetDateKey: TOMORROW,
      createdAt: NOW,
    });
    const storedPlan = PreparationPlan.rehydrate({
      id: EntityId.create('completed-history-preparation-plan'),
      cycleId: cycle.id,
      tomorrowPlanId: tomorrowPlan.id,
      targetDayId: tomorrowPlan.targetDayId,
      items: [],
      requiredCoreKeys: null,
      sourceVersion: 1,
      generationSignature: 'saved-history',
      status: PREPARATION_PLAN_STATUS.completed,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: NOW,
      version: 7,
    });
    const commit = vi.fn(async (_input: CommitPreparationInput): Promise<void> => undefined);
    const service = new PreparationService(
      cycles,
      tomorrowPlans,
      preparationPlans,
      rules,
      new TestDecisionRepository(),
      new TestLifeActionRepository(),
      new InMemoryProjectRepository(),
      new FakeClock(NOW),
      ids,
      { commit },
    );
    await cycles.createIfAbsent(cycle);
    await tomorrowPlans.createIfAbsent(tomorrowPlan);
    await preparationPlans.createIfAbsent(storedPlan);
    const create = vi.spyOn(preparationPlans, 'createIfAbsent');
    const save = vi.spyOn(preparationPlans, 'saveIfVersionMatches');
    const readRules = vi.spyOn(rules, 'findActive');

    const history = await service.getOrGenerate(DATE);

    expect(history.plan).toBe(storedPlan);
    expect(history.plan.version).toBe(7);
    expect(ids.generatedCount).toBe(0);
    expect(readRules).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('открывает legacy историю только с сохранённой средой завтра без фабрикации сна', () => {
    const legacyItem = preparationItem(
      'legacy-tomorrow',
      'Поставить будильник',
      PREPARATION_AREA.tomorrowStart,
      'legacy-history-plan',
    ).complete(NOW);
    const plan = PreparationPlan.rehydrate({
      id: EntityId.create('legacy-history-plan'),
      cycleId: EntityId.create('legacy-history-cycle'),
      tomorrowPlanId: EntityId.create('legacy-history-tomorrow-plan'),
      targetDayId: EntityId.create('legacy-history-target-day'),
      items: [legacyItem],
      requiredCoreKeys: null,
      sourceVersion: 1,
      generationSignature: 'legacy-history',
      status: PREPARATION_PLAN_STATUS.completed,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: NOW,
      version: 9,
    });
    const versionBefore = plan.version;
    const statusesBefore = plan.items.map((item) => item.status);

    const markup = renderPreparationHistory(plan);

    expect(markup).toContain('Среда для завтра');
    expect(markup).toContain('Поставить будильник');
    expect(markup).not.toContain('Среда для сна');
    expect(markup).not.toContain('data-area="sleep_environment"');
    expect(markup).toContain('>Изменить подготовку</button>');
    expect(markup).not.toContain('>Выполнено</button>');
    expect(markup).not.toContain('>Пропустить сегодня</button>');
    expect(plan.version).toBe(versionBefore);
    expect(plan.items.map((item) => item.status)).toEqual(statusesBefore);
  });

  it('показывает сохранённый исход Today без команд изменения истории', () => {
    const cycle = completedCycle();
    const snapshot = completedSnapshot(cycle);
    const versionBefore = cycle.version;

    const markup = renderToStaticMarkup(createElement(EveningTodayHistoryScene, { snapshot }));

    expect(markup).toContain('data-history-scene="today"');
    expect(markup).toContain('Сегодня · завершено');
    expect(markup).toContain('Разобрано');
    expect(markup).toContain('Перенесено');
    expect(markup).toContain('evening-history-object-card is-decision');
    expect(markup).toContain('aria-label="Сохранённый исход: Перенесено"');
    expect(markup).toContain('aria-label="Сохранённый прогресс разбора"');
    expect(markup).toContain('aria-label="Предыдущий итог"');
    expect(markup).toContain('aria-label="Следующий итог"');
    expect(markup).not.toContain('<dl');
    expect(markup).not.toContain('role="tooltip"');
    expect(markup).not.toContain('aria-expanded');
    expect(markup).not.toContain('>Завершить<');
    expect(markup).not.toContain('>Перенести<');
    expect(markup).not.toContain('>Изменить<');
    expect(markup).not.toContain('>Отказаться<');
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(cycle.version).toBe(versionBefore);
  });

  it('закрепляет один history-object, локальные outcome-тона и мобильный stack', () => {
    expect(e113cCss).toMatch(/E11\.3C TodayScene and completed Today history/);
    expect(e113cCss).toMatch(
      /\.evening-history-object-card\s*{[^}]*grid-template-columns:\s*6\.6rem minmax\(0, 1fr\) minmax\(10rem, auto\)/,
    );
    expect(e113cCss).toMatch(
      /\.evening-history-outcome\.is-complete\s*{[^}]*color:\s*#7cc987[^}]*border-color:\s*#365f3e/,
    );
    expect(e113cCss).toMatch(
      /\.evening-history-outcome\.is-drop\s*{[^}]*color:\s*var\(--evening-v1-red\)[^}]*border-color:\s*#613d3b/,
    );
    expect(e113cCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-history-object-card\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(e113cCss).not.toContain('repeat(auto-fit, minmax(420px, 1fr))');
  });

  it('различает подписи, тона и иконки всех четырёх исходов', () => {
    expect(openLoopResolutionHistoryLabel(OPEN_LOOP_RESOLUTION.complete)).toBe('Завершено');
    expect(openLoopResolutionHistoryLabel(OPEN_LOOP_RESOLUTION.carryForward)).toBe('Перенесено');
    expect(openLoopResolutionHistoryLabel(OPEN_LOOP_RESOLUTION.revise)).toBe('Изменено');
    expect(openLoopResolutionHistoryLabel(OPEN_LOOP_RESOLUTION.drop)).toBe('Отказались');
    expect(eveningHistoryOutcomePresentation(OPEN_LOOP_RESOLUTION.complete)).toMatchObject({
      outcomeTone: 'complete',
      outcomeIcon: 'check',
    });
    expect(eveningHistoryOutcomePresentation(OPEN_LOOP_RESOLUTION.carryForward)).toMatchObject({
      outcomeTone: 'carry',
      outcomeIcon: 'arrow',
    });
    expect(eveningHistoryOutcomePresentation(OPEN_LOOP_RESOLUTION.revise)).toMatchObject({
      outcomeTone: 'revise',
      outcomeIcon: 'pencil',
    });
    expect(eveningHistoryOutcomePresentation(OPEN_LOOP_RESOLUTION.drop)).toMatchObject({
      outcomeTone: 'drop',
      outcomeIcon: 'drop',
    });
  });

  it('показывает связанный перенесённый LifeAction как один сохранённый объект', () => {
    const cycle = completedCycle();
    const decision = createPlannedDecision('111', DATE);
    const lifeAction = createReadyLifeAction('11', DATE, { decisionId: decision.id });
    const items = [
      historyItem('11', OPEN_LOOP_ENTITY_TYPE.lifeAction, OPEN_LOOP_RESOLUTION.carryForward, '11'),
      historyItem('111', OPEN_LOOP_ENTITY_TYPE.decision, OPEN_LOOP_RESOLUTION.carryForward, '111'),
    ];
    const snapshot = completedSnapshot(cycle, {
      items,
      decisions: [decision],
      lifeActions: [lifeAction],
    });

    const markup = renderToStaticMarkup(createElement(EveningTodayHistoryScene, { snapshot }));
    expect(markup).toContain('Связано с Решением «Решение 111»');
    expect(markup).toContain('evening-history-object-card is-life-action');
    expect(markup).toContain('data-evening-icon="carry"');
    expect(markup).toContain('<strong>Перенесено</strong>');
    expect(markup).not.toContain('evening-history-object-card is-decision');
  });

  it('не превращает history-mode в KPI-dashboard и локально показывает перенос', () => {
    const cycle = completedCycle();
    const snapshot = completedSnapshot(cycle, {
      items: [
        historyItem(
          'only-carry',
          OPEN_LOOP_ENTITY_TYPE.lifeAction,
          OPEN_LOOP_RESOLUTION.carryForward,
        ),
      ],
    });

    const markup = renderToStaticMarkup(createElement(EveningTodayHistoryScene, { snapshot }));

    expect(markup).not.toContain('<dl');
    expect(markup).toContain('evening-history-outcome is-carry');
    expect(markup).toContain('data-evening-icon="carry"');
    expect(markup).not.toContain('evening-history-outcome is-complete');
  });

  it('держит один сохранённый объект за раз и не обрезает исходные данные', () => {
    const cycle = completedCycle();
    const longTitle = `Очень длинное название ${'важного результата '.repeat(7)}`.trim();
    const oneMarkup = renderToStaticMarkup(
      createElement(EveningTodayHistoryScene, {
        snapshot: completedSnapshot(cycle, {
          items: [
            historyItem(
              'long-title',
              OPEN_LOOP_ENTITY_TYPE.decision,
              OPEN_LOOP_RESOLUTION.carryForward,
              longTitle,
            ),
          ],
        }),
      }),
    );
    const manyItems = Array.from({ length: 8 }, (_, index) =>
      historyItem(
        `many-${index}`,
        index % 2 === 0 ? OPEN_LOOP_ENTITY_TYPE.decision : OPEN_LOOP_ENTITY_TYPE.lifeAction,
        index % 3 === 0 ? OPEN_LOOP_RESOLUTION.complete : OPEN_LOOP_RESOLUTION.carryForward,
      ),
    );
    const manyMarkup = renderToStaticMarkup(
      createElement(EveningTodayHistoryScene, {
        snapshot: completedSnapshot(cycle, { items: manyItems }),
      }),
    );

    expect(longTitle.length).toBeGreaterThan(120);
    expect(oneMarkup).toContain(longTitle);
    expect(oneMarkup.match(/evening-history-object-card /g)).toHaveLength(1);
    expect(manyMarkup.match(/evening-history-object-card /g)).toHaveLength(1);
    expect(manyMarkup).toContain('<strong>1</strong> из 8');
    expect(manyMarkup).toContain('aria-label="Предыдущий итог"');
    expect(manyMarkup).toContain('aria-label="Следующий итог"');
  });

  it('не объявляет пустой Today progress как недопустимый range 0..0', () => {
    const cycle = completedCycle();
    const markup = renderToStaticMarkup(
      createElement(EveningResolvingScene, {
        snapshot: completedSnapshot(cycle, { items: [] }),
        notes: {},
        disabled: false,
        error: null,
        feedback: null,
        pendingResolution: null,
        preferredKey: null,
        onNoteChange: () => undefined,
        onResolve: () => undefined,
        onReturnToWork: () => undefined,
        onContinue: () => undefined,
        onResolveOpenAction: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(markup).toContain('data-progress="0/0"');
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).not.toContain('aria-valuemax="0"');
  });

  it('сохраняет 65/35 workspace для пустого Reflection history без рабочих действий', () => {
    const markup = renderToStaticMarkup(
      createElement(EveningReflectionHistoryScene, { session: null }),
    );

    expect(markup).toContain(
      'evening-reflection-workspace evening-reflection-history-workspace is-empty',
    );
    expect(markup).toContain('evening-reflection-history-main evening-reflection-empty-card');
    expect(markup).toContain('is-insight is-empty');
    expect(markup).toContain('is-recommendation is-empty');
    expect(markup).toContain('Сохранённый инсайт отсутствует.');
    expect(markup).toContain('Связанная рекомендация не зафиксирована.');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<textarea');
  });

  it('показывает сохранённые вопросы, ответы и корректировки Reflection', () => {
    const question = reflectionQuestion();
    const cycle = completedCycle(question);
    const session: ReflectionSession = {
      cycle,
      questions: [question],
      currentQuestion: null,
      processed: 1,
      total: 1,
      complete: true,
    };

    const markup = renderToStaticMarkup(createElement(EveningReflectionHistoryScene, { session }));

    expect(markup).toContain('data-history-scene="reflection"');
    expect(markup).toContain('Осмысление · сохранено');
    expect(markup).toContain('Ваш ответ');
    expect(markup).toContain('Инсайт');
    expect(markup).toContain('Рекомендация');
    expect(markup).toContain('Что помогло сохранить фокус?');
    expect(markup).toContain('Сохранённый инсайт дня');
    expect(markup).toContain('Ясный первый шаг');
    expect(markup).toContain('Открыть проект до начала работы');
    expect(markup).toContain('is-recommendation has-result');
    expect(markup).not.toContain('<button');
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
  });

  it('показывает один выбранный вопрос из нескольких и read-only choice answer', () => {
    const questions = multipleReflectionQuestions();
    const cycle = completedMultiQuestionCycle(questions);
    const session: ReflectionSession = {
      cycle,
      questions,
      currentQuestion: null,
      processed: 2,
      total: 2,
      complete: true,
    };

    const markup = renderToStaticMarkup(createElement(EveningReflectionHistoryScene, { session }));

    expect(markup).toContain('<strong>1</strong> из 2');
    expect(markup).toContain('aria-label="Предыдущий вопрос"');
    expect(markup).toContain('aria-label="Следующий вопрос"');
    expect(markup).toContain('Какие причины повлияли на результат?');
    expect(markup).toContain('Слишком большой объём');
    expect(markup).toContain('Не хватило времени');
    expect(markup).toContain('evening-reflection-answer-choices');
    expect(markup).not.toContain('Что стоит сохранить на завтра?');
    expect(markup).not.toContain('Ответ второго вопроса');
    expect(markup).toContain('Главное Решение осталось незавершённым.');
    expect(markup).toContain('Связанная рекомендация не зафиксирована.');
    expect(markup).toContain('is-recommendation is-empty');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('<textarea');
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
  });

  it('закрепляет общий 65/35-каркас и mobile stack Reflection history', () => {
    const desktopNarrowingCss = e113cCss.slice(
      e113cCss.indexOf('@media (max-width: 72rem)'),
      e113cCss.indexOf('@media (max-width: 60rem)'),
    );

    expect(e113cCss).toMatch(
      /\.evening-reflection-workspace\s*{[^}]*grid-template-columns:\s*minmax\(0, 65fr\) minmax\(16rem, 35fr\)/,
    );
    expect(e113cCss).toMatch(/\.evening-reflection-history-answer\s*{[^}]*background:\s*#0d1215/);
    expect(e113cCss).toMatch(
      /\.evening-reflection-guidance\s*{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) 1px minmax\(0, 1fr\)/,
    );
    expect(e113cCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-reflection-workspace\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(e113cCss).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.evening-reflection-workspace\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(desktopNarrowingCss).not.toContain('.evening-reflection-workspace');
    expect(e113cCss).toMatch(
      /\.evening-resolving-progress-segments,[\s\S]*?grid-auto-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(e113cCss).toMatch(
      /\.evening-reflection-guidance strong\s*{[^}]*overflow-wrap:\s*anywhere|\.evening-reflection-guidance strong,[\s\S]*?overflow-wrap:\s*anywhere/,
    );
  });
});

function renderPreparationHistory(plan: PreparationPlan): string {
  const snapshot: PreparationSnapshot = {
    plan,
    recommendedCoreKeys: [],
    firstAction: null,
    primaryDecision: null,
    project: null,
  };
  return renderToStaticMarkup(
    createElement(PreparationSceneView, {
      snapshot,
      mode: EVENING_CYCLE_MODE.normal,
      completedReview: true,
      completedReviewEditing: false,
      busyItemId: null,
      isContinuing: false,
      onProcess: async () => undefined,
      onContinue: async () => undefined,
      onReviewEditingChange: () => undefined,
    }),
  );
}

function preparationAreaMarkup(
  markup: string,
  area: 'sleep_environment' | 'tomorrow_start',
  nextArea?: 'tomorrow_start',
): string {
  const start = markup.indexOf(`data-area="${area}"`);
  const end = nextArea === undefined ? markup.length : markup.indexOf(`data-area="${nextArea}"`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return markup.slice(start, end);
}

function completedPreparationPlan(items: readonly PreparationItem[]): PreparationPlan {
  return PreparationPlan.rehydrate({
    id: EntityId.create('environment-history-plan'),
    cycleId: EntityId.create('environment-history-cycle'),
    tomorrowPlanId: EntityId.create('environment-history-tomorrow-plan'),
    targetDayId: EntityId.create('environment-history-target-day'),
    items,
    requiredCoreKeys: items.slice(0, 4).map((item) => item.key),
    sourceVersion: 4,
    generationSignature: 'environment-history',
    status: PREPARATION_PLAN_STATUS.completed,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    version: 5,
  });
}

function preparationItem(
  key: string,
  title: string,
  area: PreparationArea,
  planId = 'environment-history-plan',
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`history-${key}`),
    planId: EntityId.create(planId),
    key,
    area,
    category: PREPARATION_CATEGORY.physical,
    title,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required: false,
  });
}

function completedCycle(question?: ReflectionQuestion): EveningCycle {
  const cycleId = EntityId.create('completed-history-cycle');
  return EveningCycle.rehydrate({
    id: cycleId,
    dayId: EntityId.create('completed-history-day'),
    dateKey: DATE,
    state: EVENING_CYCLE_STATE.completed,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    reflectionQuestions: question === undefined ? [] : [question],
    reflectionResults:
      question === undefined
        ? []
        : [ReflectionResult.answer(cycleId, question, 'Ясный первый шаг', NOW)],
    reflectionCorrections:
      question === undefined
        ? []
        : [
            ReflectionCorrection.create({
              id: EntityId.create('saved-correction'),
              cycleId,
              sourceQuestionId: question.id,
              sourceEntityIds: [],
              observation: 'Ясный первый шаг',
              action: 'Открыть проект до начала работы',
              createdAt: NOW,
            }),
          ],
    version: 12,
  });
}

interface CompletedSnapshotOptions {
  readonly items?: readonly OpenLoopItem[];
  readonly decisions?: readonly Decision[];
  readonly lifeActions?: readonly LifeAction[];
}

function completedSnapshot(
  cycle: EveningCycle,
  options: CompletedSnapshotOptions = {},
): EveningReviewSnapshot {
  const items = options.items ?? defaultHistoryItems();
  const day = Day.openCurrent({
    id: cycle.dayId,
    currentDate: DATE,
    occurredAt: NOW,
    createdEventId: EntityId.create('history-day-created'),
    openedEventId: EntityId.create('history-day-opened'),
  });
  return {
    cycle,
    day,
    currentDate: DATE,
    tomorrowDate: TOMORROW,
    isRecoveryReview: false,
    decisions: options.decisions ?? [],
    lifeActions: options.lifeActions ?? [],
    actionSessions: [],
    unfinishedSession: null,
    tomorrowDecisions: [],
    openLoops: {
      cycle,
      total: items.length,
      resolved: items.length,
      remaining: 0,
      items,
    },
  };
}

function defaultHistoryItems(): readonly OpenLoopItem[] {
  return [
    historyItem(
      'saved-decision',
      OPEN_LOOP_ENTITY_TYPE.decision,
      OPEN_LOOP_RESOLUTION.carryForward,
      'Сохранённое Решение',
    ),
    historyItem(
      'saved-completed-action',
      OPEN_LOOP_ENTITY_TYPE.lifeAction,
      OPEN_LOOP_RESOLUTION.complete,
      'Завершённое Действие',
    ),
    historyItem(
      'saved-dropped-action',
      OPEN_LOOP_ENTITY_TYPE.lifeAction,
      OPEN_LOOP_RESOLUTION.drop,
      'Отменённое Действие',
    ),
  ];
}

function historyItem(
  entityId: string,
  entityType: OpenLoopItem['entityType'],
  resolution: OpenLoopItem['resolution'],
  title = `Исторический элемент ${entityId}`,
): OpenLoopItem {
  return {
    entityType,
    entityId,
    title,
    requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
    status: resolution === OPEN_LOOP_RESOLUTION.complete ? 'completed' : 'planned',
    resolution,
    resolvedAt: NOW,
    allowedResolutions: Object.values(OPEN_LOOP_RESOLUTION),
  };
}

function reflectionQuestion(): ReflectionQuestion {
  return ReflectionQuestion.create({
    id: 'saved-history-question',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.shortText,
    prompt: 'Что помогло сохранить фокус?',
    context: 'Сохранённый инсайт дня',
    required: true,
    sourceEntityIds: [],
  });
}

function multipleReflectionQuestions(): readonly ReflectionQuestion[] {
  return [
    ReflectionQuestion.create({
      id: 'saved-choice-question',
      kind: REFLECTION_QUESTION_KIND.repeatedFriction,
      signal: REFLECTION_DAY_SIGNAL.friction,
      type: REFLECTION_QUESTION_TYPE.multiChoice,
      prompt: 'Какие причины повлияли на результат?',
      context: 'Главное Решение осталось незавершённым.',
      required: true,
      sourceEntityIds: [],
      options: [
        { value: 'TOO_LARGE', label: 'Слишком большой объём' },
        { value: 'NO_TIME', label: 'Не хватило времени' },
      ],
    }),
    ReflectionQuestion.create({
      id: 'saved-text-question',
      kind: REFLECTION_QUESTION_KIND.generalLearning,
      signal: REFLECTION_DAY_SIGNAL.learning,
      type: REFLECTION_QUESTION_TYPE.shortText,
      prompt: 'Что стоит сохранить на завтра?',
      context: 'Второй сохранённый контекст.',
      required: true,
      sourceEntityIds: [],
    }),
  ];
}

function completedMultiQuestionCycle(questions: readonly ReflectionQuestion[]): EveningCycle {
  const cycleId = EntityId.create('completed-multi-question-cycle');
  const first = questions[0]!;
  const second = questions[1]!;
  return EveningCycle.rehydrate({
    id: cycleId,
    dayId: EntityId.create('completed-multi-question-day'),
    dateKey: DATE,
    state: EVENING_CYCLE_STATE.completed,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    reflectionQuestions: questions,
    reflectionResults: [
      ReflectionResult.answer(cycleId, first, ['TOO_LARGE', 'NO_TIME'], NOW),
      ReflectionResult.answer(cycleId, second, 'Ответ второго вопроса', NOW),
    ],
    reflectionCorrections: [],
    version: 13,
  });
}
