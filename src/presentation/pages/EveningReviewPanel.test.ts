import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error -- Node types are intentionally absent from the browser application project.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import {
  ActionSession,
  DAY_STATUS,
  DECISION_KIND,
  Day,
  DayDate,
  EntityId,
  EveningCycle,
  SESSION_COMPLETION_KIND,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_FAILURE_REASON,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_STATE,
  EVENING_MODE_REASON,
  EVENING_STAGE_SKIP_REASON,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  ReflectionQuestion,
  type LifeAction,
  type ReflectionQuestionType,
} from '../../domain';
import type {
  EveningCycleRepository,
  EveningReviewSnapshot,
  OpenLoopItem,
  ReflectionSession,
} from '../../application';
import { DomainError } from '../../shared/errors/DomainError';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import {
  EmergencyPreparationSkipPanel,
  EveningPreparationScene,
  EveningNotStartedScene,
  EveningSkipDialog,
  EveningSkippedScene,
  EveningReviewPanelView,
  buildEveningSkipCompletionInput,
  executeEveningStartChoice,
  skipEmergencyPreparation,
} from './EveningReviewPanel';
import { EveningCycleApplicationService } from '../../application/evening-cycle/EveningCycleApplicationService';
import { FakeClock, FakeDayRepository, FakeIdGenerator } from '../../test/helpers/Fakes';
import { EMPTY_REFLECTION_ANSWER_DRAFT } from './ReflectionAnswerDraft';
import { buildEveningNotStartedSceneModel } from './EveningCommandCenterPresentation';
import { loadEveningReviewState } from './EveningReviewLoadState';
import { EveningRecoveryScene, EveningShutdownScene } from './EveningShutdownScene';
import {
  buildEveningRecoverySceneModel,
  buildEveningShutdownSceneModel,
} from './EveningFinalPresentation';
import {
  buildCompleteCurrentDayInput,
  canCompleteAction,
  createInitialEveningActionForms,
  createInitialTomorrowDecisionForms,
  getEveningReviewReadiness,
  updateEveningActionForm,
  validateEveningReviewSubmission,
  type EveningActionForms,
  type TomorrowDecisionForm,
} from './EveningReviewPanelState';
import {
  createResolutionFeedback,
  createTechnicalResolutionFeedback,
  tryBeginOpenLoopResolution,
  type EveningResolutionFeedback,
  type PendingOpenLoopResolution,
} from './EveningResolvingPresentation';

const TODAY = DayDate.create('2026-08-05');
const TOMORROW = DayDate.create('2026-08-06');
const NOOP = () => undefined;
const panelSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');

function renderPanel(
  snapshot: EveningReviewSnapshot,
  options: {
    readonly summary?: string;
    readonly actionForms?: EveningActionForms;
    readonly tomorrowForms?: readonly TomorrowDecisionForm[];
    readonly error?: string | null;
    readonly reflectionSession?: ReflectionSession;
    readonly reflectionText?: string;
    readonly reflectionChoices?: readonly string[];
    readonly reflectionYesNo?: boolean | null;
    readonly lastAnsweredQuestionId?: string | null;
    readonly correctionAction?: string;
    readonly embedded?: boolean;
    readonly isSubmitting?: boolean;
    readonly resolutionFeedback?: EveningResolutionFeedback | null;
    readonly pendingResolution?: PendingOpenLoopResolution | null;
    readonly preferredOpenLoopKey?: string | null;
  } = {},
): string {
  return renderToStaticMarkup(
    EveningReviewPanelView({
      snapshot,
      summary: options.summary ?? '',
      actionForms: options.actionForms ?? createInitialEveningActionForms(snapshot),
      tomorrowForms: options.tomorrowForms ?? createInitialTomorrowDecisionForms(snapshot),
      isSubmitting: options.isSubmitting ?? false,
      error: options.error ?? null,
      resolutionFeedback: options.resolutionFeedback ?? null,
      pendingResolution: options.pendingResolution ?? null,
      preferredOpenLoopKey: options.preferredOpenLoopKey ?? null,
      onClose: NOOP,
      onSummaryChange: NOOP,
      ...(options.reflectionSession === undefined
        ? {}
        : { reflectionSession: options.reflectionSession }),
      adaptiveReflectionEnabled: options.reflectionSession !== undefined,
      reflectionDraft: {
        ...EMPTY_REFLECTION_ANSWER_DRAFT,
        text: options.reflectionText ?? '',
        choices: options.reflectionChoices ?? [],
        yesNo: options.reflectionYesNo ?? null,
      },
      lastAnsweredQuestionId: options.lastAnsweredQuestionId ?? null,
      correctionAction: options.correctionAction ?? '',
      onReflectionDraftChange: NOOP,
      onReflectionAnswer: NOOP,
      onReflectionSkip: NOOP,
      onCorrectionActionChange: NOOP,
      onCreateCorrection: NOOP,
      onActionKindChange: NOOP,
      onActionActualResultChange: NOOP,
      onActionDateChange: NOOP,
      onActionReasonChange: NOOP,
      onAddTomorrowDecision: NOOP,
      onUpdateTomorrowDecision: NOOP,
      onRemoveTomorrowDecision: NOOP,
      onSubmit: NOOP,
      onOpenLoopNoteChange: NOOP,
      onResolveOpenLoop: NOOP,
      onContinueResolving: NOOP,
      embedded: options.embedded ?? false,
    }),
  );
}

describe('EveningReviewPanel', () => {
  it('маршрутизирует current и history Relaxation через отдельную сцену без R6', () => {
    expect(panelSource).toContain(
      "import { EveningRelaxationScene } from './EveningRelaxationScene'",
    );
    expect(panelSource).toContain("activeSelectedView === 'relaxation'");
    expect(panelSource).toContain('activeCycleState === EVENING_CYCLE_STATE.relaxing');
    expect(panelSource).toContain('readOnly');
    expect(panelSource).not.toContain('Sleep Check');
    expect(panelSource).not.toContain('beforeRating');
    expect(panelSource).not.toContain('afterRating');
  });

  it('не монтирует PreparationPanel и не вызывает preparation service в composed emergency PREPARING ветке', () => {
    const cycle = createEmergencyPreparingCycle();
    const getOrGenerate = vi.fn(async (): Promise<never> => {
      throw new Error('EMERGENCY не должен генерировать план среды');
    });
    const completeItem = vi.fn(async (): Promise<never> => {
      throw new Error('EMERGENCY не должен завершать пункт среды');
    });
    const skipItem = vi.fn(async (): Promise<never> => {
      throw new Error('EMERGENCY не должен пропускать пункт среды');
    });
    const continueToRelaxation = vi.fn(async (): Promise<never> => {
      throw new Error('EMERGENCY не должен продолжать через PreparationService');
    });
    const configureRequiredCore = vi.fn(async (): Promise<never> => {
      throw new Error('EMERGENCY не должен настраивать обязательное ядро среды');
    });
    const markup = renderToStaticMarkup(
      createElement(EveningPreparationScene, {
        cycle,
        preparation: {
          getOrGenerate,
          completeItem,
          skipItem,
          continueToRelaxation,
          configureRequiredCore,
        },
        isSubmitting: false,
        submitError: null,
        onEmergencyContinue: NOOP,
        onPreparationContinued: NOOP,
        onClose: NOOP,
        embedded: true,
      }),
    );

    expect(markup).toContain('Позднее завершение · Среда');
    expect(markup).toContain('Перейти к расслаблению');
    expect(markup).not.toContain('Настройте обязательное ядро');
    expect(markup).not.toContain('Собираем подготовку к первому старту…');
    expect(getOrGenerate).not.toHaveBeenCalled();
    expect(completeItem).not.toHaveBeenCalled();
    expect(skipItem).not.toHaveBeenCalled();
    expect(continueToRelaxation).not.toHaveBeenCalled();
    expect(configureRequiredCore).not.toHaveBeenCalled();
  });

  it('называет emergency этап средой и передаёт только cycle skip затем reload', async () => {
    const cycles = createEveningCycleRepository();
    const cycle = createEmergencyPreparingCycle();
    const eveningCycle = new EveningCycleApplicationService(
      cycles,
      new FakeDayRepository(),
      new FakeClock(new Date('2026-08-05T20:10:00.000+09:00')),
      new FakeIdGenerator('emergency-preparation'),
    );
    const reload = vi.fn(async (): Promise<void> => undefined);
    await cycles.createIfAbsent(cycle);
    const skip = vi.spyOn(eveningCycle, 'skipPreparation');
    const markup = renderToStaticMarkup(
      createElement(EmergencyPreparationSkipPanel, {
        busy: false,
        error: null,
        onContinue: NOOP,
        onClose: NOOP,
        embedded: true,
      }),
    );

    await skipEmergencyPreparation(eveningCycle, TODAY, reload);
    const stored = await cycles.findByDateKey(TODAY);

    expect(markup).toContain('Позднее завершение · Среда');
    expect(skip).toHaveBeenCalledOnce();
    expect(skip).toHaveBeenCalledWith(TODAY);
    expect(reload).toHaveBeenCalledOnce();
    const [skipCall] = skip.mock.invocationCallOrder;
    const [reloadCall] = reload.mock.invocationCallOrder;
    if (skipCall === undefined || reloadCall === undefined) {
      throw new Error('Expected emergency skip and reload calls.');
    }
    expect(skipCall).toBeLessThan(reloadCall);
    expect(stored?.skippedStages.at(-1)).toMatchObject({
      stage: EVENING_CYCLE_STATE.preparing,
      reason: EVENING_STAGE_SKIP_REASON.emergencyMode,
    });
  });

  it('показывает стартовый интерфейс для NOT_STARTED', () => {
    const markup = renderToStaticMarkup(
      EveningNotStartedScene({
        snapshot: createSnapshot(),
        busy: false,
        error: null,
        startDisabled: false,
        lateOfferMinutes: null,
        onStart: NOOP,
        onStartShort: NOOP,
        onOpenSkip: NOOP,
      }),
    );

    expect(markup).toContain('class="evening-not-started-card"');
    expect(markup).toContain('Сегодняшний вечер ещё не начат');
    expect(markup).toContain('Завершите день спокойно и подготовьте ясный старт завтра.');
    expect(markup).not.toContain('class="evening-not-started-summary"');
    expect(markup).toContain('Начать вечер');
    expect(markup).toContain('≈ 10–15 минут');
    expect(markup).toContain('Пропустить вечерний ритуал');
    expect(markup).toContain('class="evening-not-started-cta-zone"');
    expect(markup).toContain('data-evening-icon="clock"');
    expect(markup).toContain('data-evening-icon="arrow-right"');
    expect(markup).toContain('aria-busy="false"');
    expect(markup).not.toContain('<dl');
  });

  it('выстраивает луну над заголовком стартовой сцены', () => {
    const markup = renderToStaticMarkup(
      EveningNotStartedScene({
        snapshot: createSnapshot(),
        busy: false,
        error: null,
        startDisabled: false,
        lateOfferMinutes: null,
        onStart: NOOP,
        onStartShort: NOOP,
        onOpenSkip: NOOP,
      }),
    );

    expect(markup).toMatch(
      /class="evening-not-started-moon"[\s\S]*?data-evening-icon="moon"[\s\S]*?<h3 id="evening-start-title"/,
    );
  });

  it('скрывает осознанный пропуск, когда он выключен в settings', () => {
    const markup = renderToStaticMarkup(
      EveningNotStartedScene({
        snapshot: createSnapshot(),
        busy: false,
        error: null,
        startDisabled: false,
        lateOfferMinutes: null,
        allowConsciousSkip: false,
        onStart: NOOP,
        onStartShort: NOOP,
        onOpenSkip: NOOP,
      }),
    );

    expect(markup).not.toContain('Пропустить вечерний ритуал');
  });

  it('показывает loading, disabled и retryable command error без второй CTA', () => {
    const markup = renderToStaticMarkup(
      EveningNotStartedScene({
        snapshot: createSnapshot(),
        busy: true,
        error: 'Не удалось начать вечер.',
        startDisabled: false,
        lateOfferMinutes: null,
        onStart: NOOP,
        onStartShort: NOOP,
        onOpenSkip: NOOP,
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Начинаем…');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось начать вечер.');
    expect(markup.match(/evening-not-started-primary/g)).toHaveLength(1);
    expect(markup).not.toContain('data-evening-icon="arrow-right"');
  });

  it('предлагает поздний SHORT явно и оставляет выбор обычного режима', () => {
    const onStart = vi.fn();
    const onStartShort = vi.fn();
    const markup = renderToStaticMarkup(
      EveningNotStartedScene({
        snapshot: createSnapshot(),
        busy: false,
        error: null,
        startDisabled: false,
        lateOfferMinutes: 24,
        onStart,
        onStartShort,
        onOpenSkip: NOOP,
      }),
    );

    expect(markup).toContain('До сна осталось 24 минут. Перейти в короткий режим?');
    expect(markup).toContain('Короткий');
    expect(markup).toContain('Обычный');
    expect(onStart).not.toHaveBeenCalled();
    expect(onStartShort).not.toHaveBeenCalled();
  });

  it('маршрутизирует явный выбор SHORT и NORMAL в разные application-команды', async () => {
    const cycle = createSnapshot().cycle;
    const start = vi.fn(async () => cycle);
    const startShort = vi.fn(async () => cycle);
    const service = { start, startShort };

    await executeEveningStartChoice(service, TODAY, 'SHORT');
    await executeEveningStartChoice(service, TODAY, 'NORMAL');

    expect(startShort).toHaveBeenCalledOnce();
    expect(startShort).toHaveBeenCalledWith(TODAY);
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(TODAY);
  });

  it('показывает нейтральное подтверждение пропуска и необязательную причину', () => {
    const markup = renderToStaticMarkup(
      createElement(EveningSkipDialog, {
        reason: 'Поздняя дорога домой',
        busy: false,
        onReasonChange: NOOP,
        onConfirm: NOOP,
        onCancel: NOOP,
      }),
    );

    expect(markup).toContain('Пропустить вечерний ритуал сегодня?');
    expect(markup).toContain('Причина (необязательно)');
    expect(markup).toContain('Поздняя дорога домой');
    expect(markup).toContain('Пропустить');
    expect(markup).toContain('Отмена');
    expect(markup).not.toContain('page-error');
  });

  it('подтверждает skip отдельной командой, а отмена ничего не сохраняет', () => {
    expect(buildEveningSkipCompletionInput('CANCEL', 'Неважно')).toBeNull();
    expect(buildEveningSkipCompletionInput('CONFIRM', '  Нужен отдых  ')).toEqual({
      skipEvening: true,
      summary: 'Нужен отдых',
      actionResolutions: [],
      tomorrowDecisions: [],
    });
    expect(buildEveningSkipCompletionInput('CONFIRM', '   ')?.summary).toBe('');
  });

  it('показывает сохранённый SKIPPED нейтрально после refresh', () => {
    const cycle = createSnapshot().cycle;
    cycle.skip(new Date('2026-08-05T21:20:00.000+09:00'), 'Нужен отдых');
    const markup = renderToStaticMarkup(
      createElement(EveningSkippedScene, { cycle, onClose: NOOP }),
    );

    expect(cycle.completion).toBe(EVENING_CYCLE_COMPLETION.skipped);
    expect(markup).toContain('Вечерний ритуал пропущен');
    expect(markup).toContain('Нужен отдых');
    expect(markup).not.toContain('page-error');
  });

  it('маппит 0, 1 и несколько незавершённых элементов без дроби решений и действий', () => {
    const empty = buildEveningNotStartedSceneModel(createSnapshot());
    const one = buildEveningNotStartedSceneModel(
      createSnapshot({
        decisions: [createPlannedDecision('one-open-decision', TODAY, DECISION_KIND.main, 1)],
      }),
    );
    const several = buildEveningNotStartedSceneModel(
      createSnapshot({
        decisions: [createPlannedDecision('two-open-decision', TODAY, DECISION_KIND.main, 1)],
        lifeActions: [createReadyLifeAction('two-open-action', TODAY)],
      }),
    );

    expect(empty.facts[0]).toMatchObject({ value: 'Нет', meta: 'Всё разобрано', tone: 'ready' });
    expect(one.facts[0]).toMatchObject({
      value: '1 элемент',
      meta: 'Требует решения',
      tone: 'current',
    });
    expect(several.facts[0]).toMatchObject({
      value: '2 элемента',
      meta: 'Требует решения',
      tone: 'current',
    });
  });

  it('показывает активную сессию и частично начатый план как нейтральный контекст', () => {
    const action = markLifeActionInProgress(createReadyLifeAction('active-start-session', TODAY));
    const session = ActionSession.start({
      id: id('active-start-session-id'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-05T19:00:00.000+09:00'),
      eventId: id('active-start-session-event'),
    });
    const model = buildEveningNotStartedSceneModel(
      createSnapshot({
        lifeActions: [action],
        actionSessions: [session],
        unfinishedSession: session,
        tomorrowDecisions: [
          createPlannedDecision('partial-tomorrow-plan', TOMORROW, DECISION_KIND.main, 1),
        ],
      }),
    );

    expect(model.facts[1]).toMatchObject({
      value: 'Есть',
      meta: 'Будет учтена при разборе',
      tone: 'neutral',
    });
    expect(model.facts[2]).toMatchObject({
      value: '1 решение',
      meta: 'План уже начат',
      tone: 'neutral',
    });
  });

  it('показывает error state только при реальном отказе read model', async () => {
    const state = await loadEveningReviewState({
      execute: async () => Promise.reject(new Error('IndexedDB unavailable')),
    });

    expect(state).toEqual({
      status: 'error',
      message: 'Не удалось загрузить данные вечернего контроля',
    });
  });

  it('показывает кульминацию SHUTDOWN и данные завтрашнего дня', () => {
    const snapshot = createSnapshot();
    const markup = renderToStaticMarkup(
      EveningShutdownScene({
        model: buildEveningShutdownSceneModel(snapshot, {
          primaryDecisionTitle: 'Завершить вечерний режим LifeOS',
          firstStepTitle: 'Открыть проект и продолжить работу',
        }),
        isSubmitting: false,
        error: null,
        onComplete: NOOP,
        onResolveBlocker: NOOP,
      }),
    );

    expect(markup).toContain('Завершение дня');
    expect(markup).toContain('data-evening-icon="check"');
    expect(markup).toContain('Незавершённое разобрано');
    expect(markup).toContain('Итоги сохранены');
    expect(markup).toContain('Главное завтра');
    expect(markup).toContain('Завершить вечерний режим LifeOS');
    expect(markup).toContain('Первый шаг');
    expect(markup).toContain('Завершить день');
  });

  it('при повторном открытии показывает отдельную сцену восстановления', () => {
    const snapshot = createSnapshot();
    const markup = renderToStaticMarkup(
      EveningRecoveryScene({
        model: buildEveningRecoverySceneModel(snapshot, {
          primaryDecisionTitle: 'Завершить интерфейс вечера',
          firstStepTitle: 'Открыть LifeOS',
        }),
        onClose: NOOP,
      }),
    );
    expect(markup).toContain('День завершён');
    expect(markup).toContain('Сегодня больше ничего не требует решения.');
    expect(markup).toContain('Завтра подготовлено');
    expect(markup).toContain('Восстановление');
    expect(markup).toContain('Закрыть');
  });

  it('показывает один адаптивный вопрос вместо статичного вечернего опроса', () => {
    const snapshot = createSnapshot();
    const question = ReflectionQuestion.create({
      id: 'MAIN_DECISION_FAILURE_REASON:main',
      kind: REFLECTION_QUESTION_KIND.mainDecisionFailureReason,
      signal: REFLECTION_DAY_SIGNAL.failure,
      type: REFLECTION_QUESTION_TYPE.singleChoice,
      prompt: 'Что стало основной причиной?',
      context: 'Главное Решение сегодня не завершено.',
      required: true,
      sourceEntityIds: [id('main')],
      options: [
        { value: REFLECTION_FAILURE_REASON.scopeTooLarge, label: 'Слишком большой объём' },
        { value: REFLECTION_FAILURE_REASON.other, label: 'Другое' },
      ],
    });
    snapshot.cycle.initializeReflection([question], new Date('2026-08-05T20:05:00.000+09:00'));
    const session: ReflectionSession = {
      cycle: snapshot.cycle,
      questions: [question],
      currentQuestion: question,
      processed: 0,
      total: 1,
      complete: false,
    };

    const markup = renderPanel(snapshot, { reflectionSession: session });

    expect(markup).toContain('Осмысление дня');
    expect(markup).toContain('Что стало основной причиной?');
    expect(markup).toContain('Слишком большой объём');
    expect(markup).not.toContain('Что стало результатом дня?');
  });

  it('показывает единый обзор решений, действий и рабочих сессий текущего дня', () => {
    const active = markLifeActionInProgress(createReadyLifeAction('active', TODAY));
    const completed = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('completed', TODAY)),
    );
    const snapshot = createSnapshot({
      decisions: [createPlannedDecision('today-main', TODAY, DECISION_KIND.main, 1)],
      lifeActions: [active, completed],
      actionSessions: [createCompletedSession(active)],
    });

    const markup = renderPanel(snapshot);

    expect(markup).toContain('Вечерний контроль и завершение дня');
    expect(markup).toContain('Единое состояние');
    expect(markup).toContain('Решение today-main');
    expect(markup).toContain('Действие active');
    expect(markup).toContain('Уже обработано:');
    expect(markup).toContain('Сессии');
    expect(markup).toContain('Завершить день');
  });

  it.each(['running', 'paused'] as const)(
    'явно блокирует завершение дня при %s-сессии',
    (status) => {
      const action = markLifeActionInProgress(createReadyLifeAction(`blocked-${status}`, TODAY));
      const session = ActionSession.start({
        id: id(`session-${status}`),
        lifeActionId: action.id,
        startedAt: new Date('2026-08-05T19:00:00.000+09:00'),
        eventId: id(`session-${status}-started`),
      });
      if (status === 'paused') {
        session.pause(new Date('2026-08-05T19:20:00.000+09:00'), id('session-paused'));
      }

      const markup = renderPanel(
        createSnapshot({ lifeActions: [action], unfinishedSession: session }),
      );

      expect(markup).toContain('блокирует завершение дня');
      expect(markup).toContain('disabled=""');
    },
  );

  it('требует явное решение по каждому незавершённому действию', () => {
    const action = createReadyLifeAction('unresolved', TODAY);
    const snapshot = createSnapshot({ lifeActions: [action] });

    expect(
      validateEveningReviewSubmission(
        snapshot,
        'Итог дня',
        createInitialEveningActionForms(snapshot),
        [mainTomorrowForm()],
      ),
    ).toBe('Обработайте действие «Действие unresolved»');
  });

  it('разрешает завершить действие только при начатом выполнении и завершённой сессии', () => {
    const ready = createReadyLifeAction('ready', TODAY);
    const inProgress = markLifeActionInProgress(createReadyLifeAction('progress', TODAY));
    const withoutEvidence = createSnapshot({ lifeActions: [ready, inProgress] });
    const withEvidence = createSnapshot({
      lifeActions: [inProgress],
      actionSessions: [createCompletedSession(inProgress)],
    });

    expect(canCompleteAction(ready, withoutEvidence)).toBe(false);
    expect(canCompleteAction(inProgress, withoutEvidence)).toBe(false);
    expect(canCompleteAction(inProgress, withEvidence)).toBe(true);
    expect(renderPanel(withoutEvidence)).toContain(
      'Завершение доступно только после начатого действия и завершённой рабочей сессии.',
    );
  });

  it('собирает отдельные команды завершения, переноса и отмены без изменения истории', () => {
    const completing = markLifeActionInProgress(createReadyLifeAction('complete', TODAY));
    const moving = createReadyLifeAction('move', TODAY);
    const cancelling = createReadyLifeAction('cancel', TODAY);
    const snapshot = createSnapshot({
      lifeActions: [completing, moving, cancelling],
      actionSessions: [createCompletedSession(completing)],
    });
    let forms = createInitialEveningActionForms(snapshot);
    forms = updateEveningActionForm(forms, completing.id.toString(), {
      kind: 'complete',
      actualResult: 'Фактический результат',
    });
    forms = updateEveningActionForm(forms, moving.id.toString(), {
      kind: 'reschedule',
      newPlannedDate: TOMORROW.toString(),
    });
    forms = updateEveningActionForm(forms, cancelling.id.toString(), {
      kind: 'cancel',
      reason: 'Потеряло актуальность',
    });

    const input = buildCompleteCurrentDayInput(snapshot, 'Итог дня', forms, [mainTomorrowForm()]);

    expect(input.actionResolutions.map((resolution) => resolution.kind)).toEqual([
      'complete',
      'reschedule',
      'cancel',
    ]);
    expect(input.summary).toBe('Итог дня');
    expect(input.tomorrowDecisions).toEqual([
      {
        kind: DECISION_KIND.main,
        title: 'Главное решение на завтра',
        expectedResult: 'Проверяемый результат',
      },
    ]);
    expect(completing.status).not.toBe('completed');
    expect(moving.plannedDate?.equals(TODAY)).toBe(true);
    expect(cancelling.status).not.toBe('cancelled');
  });

  it('требует итог дня и хотя бы одно главное решение на завтра', () => {
    const snapshot = createSnapshot();

    expect(validateEveningReviewSubmission(snapshot, ' ', {}, [mainTomorrowForm()])).toBe(
      'Запишите итог дня',
    );
    expect(validateEveningReviewSubmission(snapshot, 'Итог', {}, [])).toBe(
      'Подготовьте хотя бы одно главное решение на завтра',
    );
  });

  it('держит кнопку завершения заблокированной и показывает ближайшее обязательное действие', () => {
    const snapshot = createSnapshot();

    const markup = renderPanel(snapshot);

    expect(markup).toContain('data-completion-ready="false"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Осталось выполнить');
    expect(markup).toContain('Запишите итог дня');
    expect(markup).toContain('Условия завершения дня');
    expect(markup).toContain('Итог заполнен');
  });

  it('активирует завершение только после выполнения всех обязательных условий', () => {
    const snapshot = createSnapshot();
    const readiness = getEveningReviewReadiness(snapshot, 'Итог дня', {}, [mainTomorrowForm()]);
    const markup = renderPanel(snapshot, {
      summary: 'Итог дня',
      tomorrowForms: [mainTomorrowForm()],
    });

    expect(readiness.canComplete).toBe(true);
    expect(readiness.blockingMessage).toBeNull();
    expect(markup).toContain('data-completion-ready="true"');
    expect(markup).not.toContain('data-completion-ready="true" disabled=""');
    expect(markup).toContain('Всё готово к завершению');
    expect(markup).toContain('aria-current="step"><span>5</span>Завершение');
  });

  it('сворачивает пустой день в одно компактное сообщение', () => {
    const markup = renderPanel(createSnapshot());

    expect(markup).toContain('Сегодня решений, действий и рабочих сессий не зафиксировано.');
    expect(markup).not.toContain('class="evening-review-metrics"');
  });

  it('явно показывает режим восстановления прошлого активного дня', () => {
    const snapshot = createSnapshot({ isRecoveryReview: true });
    const markup = renderPanel(snapshot);

    expect(markup).toContain('Восстановление и завершение прошлого дня');
    expect(markup).toContain('Решения для продолжения');
    expect(markup).toContain('Продолжение');
    expect(markup).toContain('Главное решение для продолжения готово');
  });

  it('не создаёт пустую форму, когда главное решение на завтра уже сохранено', () => {
    const snapshot = createSnapshot({
      tomorrowDecisions: [createPlannedDecision('tomorrow-main', TOMORROW, DECISION_KIND.main, 1)],
    });

    expect(createInitialTomorrowDecisionForms(snapshot)).toEqual([]);
    expect(validateEveningReviewSubmission(snapshot, 'Итог', {}, [])).toBeNull();
    expect(renderPanel(snapshot)).toContain('Решение tomorrow-main');
  });

  it('показывает единый прогресс разбора и четыре русских исхода', () => {
    const cycle = createEveningCycle();
    const snapshot = createSnapshot({
      openLoops: {
        cycle,
        total: 1,
        resolved: 0,
        remaining: 1,
        items: [
          {
            entityType: 'LIFE_ACTION',
            entityId: 'open-action',
            title: 'Незавершённое действие',
            requirement: 'REQUIRES_RESOLUTION',
            status: 'ready',
            resolution: null,
            resolvedAt: null,
            allowedResolutions: ['COMPLETE', 'CARRY_FORWARD', 'REVISE', 'DROP'],
          },
        ],
      },
    });

    const markup = renderPanel(snapshot);

    expect(markup).toContain('Разбор дня');
    expect(markup).toContain('1 элементов требуют решения');
    expect(markup).toContain('Завершить');
    expect(markup).toContain('Перенести');
    expect(markup).toContain('Изменить');
    expect(markup).toContain('Отказаться');
  });

  it('E9.2 показывает только один текущий незавершённый элемент', () => {
    const cycle = createResolvingCycle();
    const markup = renderPanel(
      createSnapshot({
        cycle,
        openLoops: createOpenLoops(cycle, [
          openLoop('first', 'Первый незавершённый элемент'),
          openLoop('second', 'Второй незавершённый элемент'),
        ]),
      }),
      { embedded: true },
    );

    expect(markup).toContain('Осталось 2 элемента, которые требуют решения');
    expect(markup).toContain('Первый незавершённый элемент');
    expect(markup).not.toContain('Второй незавершённый элемент');
    expect(markup).toContain('Разобрано 0 из 2');
  });

  it('E9.2 переводит COMPLETE, CARRY_FORWARD, REVISE и DROP в разную иерархию действий', () => {
    const cycle = createResolvingCycle();
    const markup = renderPanel(
      createSnapshot({ cycle, openLoops: createOpenLoops(cycle, [openLoop('one', 'Элемент')]) }),
      { embedded: true },
    );

    expect(markup).toContain('evening-resolving-primary-actions');
    expect(markup).toContain('evening-resolving-secondary-actions');
    expect(markup).toContain('Завершить');
    expect(markup).toContain('Перенести');
    expect(markup).toContain('Изменить');
    expect(markup).toContain('Отказаться');
  });

  it('E9.2 мягко подставляет следующий элемент после обработки текущего', () => {
    const cycle = createResolvingCycle();
    const first = {
      ...openLoop('first', 'Уже разобранный элемент'),
      resolution: OPEN_LOOP_RESOLUTION.carryForward,
      resolvedAt: new Date('2026-08-05T20:10:00.000+09:00'),
    } satisfies OpenLoopItem;
    const markup = renderPanel(
      createSnapshot({
        cycle,
        openLoops: createOpenLoops(cycle, [first, openLoop('second', 'Следующий элемент')], 1),
      }),
      { embedded: true },
    );

    expect(markup).toContain('Следующий элемент');
    expect(markup).not.toContain('Уже разобранный элемент');
    expect(markup).toContain('Разобрано 1 из 2');
  });

  it('показывает бизнес-блокировку COMPLETE и переход к дочернему действию', () => {
    const cycle = createResolvingCycle();
    const decisionLoop: OpenLoopItem = {
      ...openLoop('blocked-decision', 'Решение с действием'),
      entityType: OPEN_LOOP_ENTITY_TYPE.decision,
    };
    const actionLoop = openLoop('blocked-action', 'Дочернее действие');
    const snapshot = createSnapshot({
      cycle,
      openLoops: createOpenLoops(cycle, [decisionLoop, actionLoop]),
    });
    const feedback: EveningResolutionFeedback = {
      kind: 'decision-has-open-actions',
      message: 'Сначала разберите действия этого Решения',
      openActionIds: ['blocked-action'],
    };

    const blockedMarkup = renderPanel(snapshot, {
      embedded: true,
      resolutionFeedback: feedback,
    });
    const actionMarkup = renderPanel(snapshot, {
      embedded: true,
      preferredOpenLoopKey: 'LIFE_ACTION:blocked-action',
    });

    expect(blockedMarkup).toContain('Сначала разберите действия этого Решения');
    expect(blockedMarkup).toContain('1 действие ещё не закрыто');
    expect(blockedMarkup).toContain('Разобрать действие →');
    expect(actionMarkup).toContain('Дочернее действие');
    expect(actionMarkup).not.toContain('Решение с действием');
  });

  it('показывает loading конкретного DROP и явный retry для технической ошибки', () => {
    const cycle = createResolvingCycle();
    const snapshot = createSnapshot({
      cycle,
      openLoops: createOpenLoops(cycle, [openLoop('dropping', 'Отказ с повтором')]),
    });
    const markup = renderPanel(snapshot, {
      embedded: true,
      isSubmitting: true,
      pendingResolution: {
        key: 'LIFE_ACTION:dropping',
        resolution: OPEN_LOOP_RESOLUTION.drop,
      },
      resolutionFeedback: createTechnicalResolutionFeedback(),
    });

    expect(markup).toContain('Сохраняем отказ…');
    expect(markup).toContain('Не удалось сохранить результат разбора.');
    expect(markup).toContain('Повторить');
    expect(markup).toContain('disabled=""');
  });

  it('не проглатывает application/persistence error и переводит его в retryable UI-state', () => {
    const feedback = createResolutionFeedback(
      new DomainError(
        'open_loop.persistence_failed',
        'Не удалось атомарно сохранить результат разбора.',
      ),
    );

    expect(feedback).toEqual({
      kind: 'technical',
      message: 'Не удалось атомарно сохранить результат разбора.',
    });
  });

  it('блокирует повторный resolution ещё до React-render', () => {
    const gate = { current: false };

    expect(tryBeginOpenLoopResolution(gate)).toBe(true);
    expect(tryBeginOpenLoopResolution(gate)).toBe(false);
  });

  it('E9.2 показывает завершённый empty state вместо нулевой панели', () => {
    const cycle = createResolvingCycle();
    const markup = renderPanel(createSnapshot({ cycle, openLoops: createOpenLoops(cycle, []) }), {
      embedded: true,
    });

    expect(markup).toContain('Сегодня закрыто');
    expect(markup).toContain('Ничего важного не осталось без решения.');
    expect(markup).toContain('Продолжить →');
    expect(markup).not.toContain('0 элементов');
  });

  it('E9.2 выделяет активную Сессию действия отдельной карточкой', () => {
    const cycle = createResolvingCycle();
    const action = markLifeActionInProgress(createReadyLifeAction('active-e9', TODAY));
    const session = ActionSession.start({
      id: id('active-e9-session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-05T19:00:00.000+09:00'),
      eventId: id('active-e9-session-started'),
    });
    const sessionLoop: OpenLoopItem = {
      entityType: OPEN_LOOP_ENTITY_TYPE.actionSession,
      entityId: session.id.toString(),
      title: 'Рабочая сессия',
      requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
      status: session.status,
      resolution: null,
      resolvedAt: null,
      allowedResolutions: Object.values(OPEN_LOOP_RESOLUTION),
    };
    const markup = renderPanel(
      createSnapshot({
        cycle,
        lifeActions: [action],
        unfinishedSession: session,
        openLoops: createOpenLoops(cycle, [sessionLoop]),
      }),
      { embedded: true },
    );

    expect(markup).toContain('Работа ещё идёт');
    expect(markup).toContain('Действие active-e9');
    expect(markup).toContain('Завершить сессию');
    expect(markup).toContain('Вернуться к работе');
  });

  it.each([EVENING_CYCLE_MODE.quick, EVENING_CYCLE_MODE.emergency])(
    'E9.2 сохраняет компактную сцену Сегодня в режиме %s',
    (mode) => {
      const cycle = createResolvingCycle();
      cycle.switchMode(
        mode,
        EVENING_MODE_REASON.userSelected,
        new Date('2026-08-05T20:01:00.000+09:00'),
      );
      const markup = renderPanel(
        createSnapshot({
          cycle,
          openLoops: createOpenLoops(cycle, [openLoop('mode', 'Один элемент')]),
        }),
        { embedded: true },
      );

      expect(markup).toContain('Остался 1 элемент, который требует решения');
      expect(markup).toContain('Один элемент');
    },
  );

  it.each([
    REFLECTION_QUESTION_TYPE.singleChoice,
    REFLECTION_QUESTION_TYPE.multiChoice,
    REFLECTION_QUESTION_TYPE.yesNo,
    REFLECTION_QUESTION_TYPE.shortCapture,
    REFLECTION_QUESTION_TYPE.shortText,
    REFLECTION_QUESTION_TYPE.optionalText,
  ] as const)('E9.2 отображает существующий тип ответа %s без внутренней терминологии', (type) => {
    const question = createReflectionQuestion(type);
    const cycle = createEveningCycle();
    cycle.initializeReflection([question], new Date('2026-08-05T20:05:00.000+09:00'));
    const session: ReflectionSession = {
      cycle,
      questions: [question],
      currentQuestion: question,
      processed: 0,
      total: 1,
      complete: false,
    };
    const markup = renderPanel(createSnapshot({ cycle }), {
      embedded: true,
      reflectionSession: session,
      reflectionText:
        type === REFLECTION_QUESTION_TYPE.singleChoice
          ? REFLECTION_FAILURE_REASON.scopeTooLarge
          : '',
      reflectionChoices:
        type === REFLECTION_QUESTION_TYPE.multiChoice
          ? [REFLECTION_FAILURE_REASON.scopeTooLarge]
          : [],
      reflectionYesNo: type === REFLECTION_QUESTION_TYPE.yesNo ? false : null,
    });

    expect(markup).toContain('Главное Решение переносится третий день подряд.');
    expect(markup).toContain('Что мешает продвижению?');
    expect(markup).toContain('Инсайт');
    expect(markup).toContain('Рекомендация');
    expect(markup).not.toContain('FAILURE');
    expect(markup).not.toContain('ReflectionResult');
    expect(markup).not.toContain('sourceEntityId');
    if (type === REFLECTION_QUESTION_TYPE.optionalText) expect(markup).toContain('Пропустить');
    if (
      type === REFLECTION_QUESTION_TYPE.shortText ||
      type === REFLECTION_QUESTION_TYPE.shortCapture ||
      type === REFLECTION_QUESTION_TYPE.optionalText
    ) {
      expect(markup).toContain('Записать короткий вывод…');
    }
  });

  it('E9.2 восстанавливает частично пройденное Осмысление и предлагает необязательную корректировку', () => {
    const question = createReflectionQuestion(REFLECTION_QUESTION_TYPE.shortText);
    const cycle = createEveningCycle();
    cycle.initializeReflection([question], new Date('2026-08-05T20:05:00.000+09:00'));
    const session: ReflectionSession = {
      cycle,
      questions: [question],
      currentQuestion: question,
      processed: 2,
      total: 3,
      complete: false,
    };
    const markup = renderPanel(createSnapshot({ cycle }), {
      embedded: true,
      reflectionSession: session,
      reflectionText: 'Сохранить ясный первый шаг.',
      lastAnsweredQuestionId: 'previous-question',
      correctionAction: 'Убрать телефон со стола.',
    });

    expect(markup).toContain('3 из 3');
    expect(markup).toContain('Вывод сохранён');
    expect(markup).toContain('Использовать этот вывод завтра?');
    expect(markup).toContain('Убрать телефон со стола.');
  });
});

function createEveningCycleRepository(): EveningCycleRepository {
  const cycles = new Map<string, EveningCycle>();
  return {
    findById: async (id) => cycles.get(id.toString()) ?? null,
    findByDayId: async (dayId) =>
      [...cycles.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null,
    findByDateKey: async (dateKey) =>
      [...cycles.values()].find((cycle) => cycle.dateKey.equals(dateKey)) ?? null,
    createIfAbsent: async (cycle) => {
      const existing = cycles.get(cycle.id.toString());
      if (existing !== undefined) return existing;
      cycles.set(cycle.id.toString(), cycle);
      return cycle;
    },
    saveIfVersionMatches: async (cycle, expectedVersion) => {
      const stored = cycles.get(cycle.id.toString());
      if (stored === undefined || stored.version !== expectedVersion) return false;
      cycles.set(cycle.id.toString(), cycle);
      return true;
    },
  };
}

function createSnapshot(overrides: Partial<EveningReviewSnapshot> = {}): EveningReviewSnapshot {
  return {
    cycle: overrides.cycle ?? createEveningCycle(),
    day: overrides.day ?? createOpenDay(),
    currentDate: TODAY,
    tomorrowDate: TOMORROW,
    isRecoveryReview: overrides.isRecoveryReview ?? false,
    decisions: overrides.decisions ?? [],
    lifeActions: overrides.lifeActions ?? [],
    actionSessions: overrides.actionSessions ?? [],
    unfinishedSession: overrides.unfinishedSession ?? null,
    tomorrowDecisions: overrides.tomorrowDecisions ?? [],
    ...(overrides.openLoops === undefined ? {} : { openLoops: overrides.openLoops }),
  };
}

function createEveningCycle(): EveningCycle {
  const occurredAt = new Date('2026-08-05T20:00:00.000+09:00');
  const cycle = EveningCycle.create({
    id: id('evening-cycle'),
    dayId: id('evening-day'),
    dateKey: TODAY,
    occurredAt,
  });
  cycle.start(occurredAt);
  cycle.beginResolving(occurredAt);
  cycle.completeResolving(occurredAt);
  return cycle;
}

function createEmergencyPreparingCycle(): EveningCycle {
  const cycle = createEveningCycle();
  const occurredAt = new Date('2026-08-05T20:05:00.000+09:00');
  cycle.switchMode(EVENING_CYCLE_MODE.emergency, EVENING_MODE_REASON.userSelected, occurredAt);
  cycle.skipReflection(occurredAt);
  cycle.completeTomorrowPlanning(occurredAt);
  return cycle;
}

function createResolvingCycle(): EveningCycle {
  const occurredAt = new Date('2026-08-05T20:00:00.000+09:00');
  const cycle = EveningCycle.create({
    id: id('evening-resolving-cycle'),
    dayId: id('evening-day'),
    dateKey: TODAY,
    occurredAt,
  });
  cycle.start(occurredAt);
  cycle.beginResolving(occurredAt);
  return cycle;
}

function openLoop(entityId: string, title: string): OpenLoopItem {
  return {
    entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
    entityId,
    title,
    requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
    status: 'ready',
    resolution: null,
    resolvedAt: null,
    allowedResolutions: Object.values(OPEN_LOOP_RESOLUTION),
  };
}

function createOpenLoops(
  cycle: EveningCycle,
  items: readonly OpenLoopItem[],
  resolved = 0,
): NonNullable<EveningReviewSnapshot['openLoops']> {
  const total = items.length;
  return {
    cycle,
    total,
    resolved,
    remaining: total - resolved,
    items,
  };
}

function createReflectionQuestion(type: ReflectionQuestionType): ReflectionQuestion {
  const choice =
    type === REFLECTION_QUESTION_TYPE.singleChoice || type === REFLECTION_QUESTION_TYPE.multiChoice;
  return ReflectionQuestion.create({
    id: `question-${type.toLowerCase()}`,
    kind: REFLECTION_QUESTION_KIND.repeatedFriction,
    signal: REFLECTION_DAY_SIGNAL.friction,
    type,
    prompt: 'Что мешает продвижению?',
    context: 'Главное Решение переносится третий день подряд.',
    required: type !== REFLECTION_QUESTION_TYPE.optionalText,
    sourceEntityIds: [id('reflection-source')],
    ...(choice
      ? {
          options: [
            {
              value: REFLECTION_FAILURE_REASON.scopeTooLarge,
              label: 'Объём оказался слишком большим',
            },
            { value: REFLECTION_FAILURE_REASON.timeInsufficient, label: 'Не хватило времени' },
          ],
        }
      : {}),
  });
}

function createOpenDay(): Day {
  const day = Day.openCurrent({
    id: id('evening-day'),
    currentDate: TODAY,
    occurredAt: new Date('2026-08-05T08:00:00.000+09:00'),
    createdEventId: id('evening-day-created'),
    openedEventId: id('evening-day-opened'),
  });
  expect(day.status).toBe(DAY_STATUS.open);
  return day;
}

function createCompletedSession(lifeAction: LifeAction): ActionSession {
  const session = ActionSession.start({
    id: id(`session-${lifeAction.id.toString()}`),
    lifeActionId: lifeAction.id,
    startedAt: new Date('2026-08-05T18:00:00.000+09:00'),
    eventId: id(`session-${lifeAction.id.toString()}-started`),
  });
  session.complete({
    completedAt: new Date('2026-08-05T19:00:00.000+09:00'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: id(`session-${lifeAction.id.toString()}-completed`),
  });
  return session;
}

function mainTomorrowForm(): TomorrowDecisionForm {
  return {
    formId: 'tomorrow-main-form',
    kind: DECISION_KIND.main,
    title: 'Главное решение на завтра',
    expectedResult: 'Проверяемый результат',
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
