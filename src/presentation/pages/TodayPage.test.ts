import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DayDate,
  DECISION_KIND,
  EntityId,
  SessionResultNote,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success } from '../../shared/result/Result';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { formatDuration, scheduleSessionTimer } from '../session/sessionTimer';
import { TodayPageView } from './TodayPage';
import {
  createDecisionAndReload,
  createLifeActionAndReload,
  INITIAL_TODAY_PAGE_STATE,
  isDecisionActivationKey,
  isLifeActionActivationKey,
  pauseSessionErrorMessage,
  resumeSessionErrorMessage,
  startSessionErrorMessage,
  todayPageReducer,
  validateDecisionForm,
  validateLifeActionForm,
  type TodayPageState,
} from './TodayPageState';

const DATE = DayDate.create('2026-08-02');
const NOOP = () => undefined;

describe('TodayPage view and workflow', () => {
  it('показывает текущую дату по-русски без старого технического экрана', () => {
    const markup = renderView(createReadyState([]));

    expect(markup).toContain('LifeOS');
    expect(markup).toContain('Сегодня');
    expect(markup).toContain('2 августа 2026 г.');
    expect(markup).toContain('Данные сохраняются на этом устройстве');
    expect(markup).not.toContain('Локальная система готова');
    expect(markup).not.toContain('IndexedDB');
    expect(markup).not.toContain('repository');
  });

  it('показывает загрузку и контролируемую ошибку чтения с повтором', () => {
    const loadingMarkup = renderView(INITIAL_TODAY_PAGE_STATE);
    const errorMarkup = renderView({
      ...INITIAL_TODAY_PAGE_STATE,
      decisions: { status: 'error' },
    });

    expect(loadingMarkup).toContain('Загружаем решения…');
    expect(errorMarkup).toContain('Не удалось загрузить решения');
    expect(errorMarkup).toContain('Повторить');
  });

  it('показывает ровно три позиции главных решений в правильном порядке', () => {
    const third = createPlannedDecision('третье', DATE, DECISION_KIND.main, 3);
    const first = createPlannedDecision('первое', DATE, DECISION_KIND.main, 1);
    const markup = renderView(createReadyState([third, first]));

    expect(markup).toContain('Главные решения');
    expect(markup.indexOf('Решение первое')).toBeLessThan(markup.indexOf('Место свободно'));
    expect(markup.indexOf('Место свободно')).toBeLessThan(markup.indexOf('Решение третье'));
    expect(markup.match(/decision-order/g)).toHaveLength(3);
    expect(markup).toContain('Запланировано');
  });

  it('показывает дополнительные решения и пустые состояния', () => {
    const emptyMarkup = renderView(createReadyState([]));
    const additional = createPlannedDecision('дополнительное', DATE, DECISION_KIND.additional);
    const filledMarkup = renderView(createReadyState([additional]));

    expect(emptyMarkup.match(/Место свободно/g)).toHaveLength(3);
    expect(emptyMarkup).toContain('Дополнительных решений пока нет');
    expect(filledMarkup).toContain('Дополнительные решения');
    expect(filledMarkup).toContain('Решение дополнительное');
  });

  it('открывает форму и переключает обязательность результата для main/additional', () => {
    const opened = todayPageReducer(createReadyState([]), { type: 'open_form' });
    const mainMarkup = renderView(opened);
    const additional = todayPageReducer(opened, {
      type: 'kind_changed',
      kind: DECISION_KIND.additional,
    });
    const additionalMarkup = renderView(additional);

    expect(mainMarkup).toContain('Новое намерение');
    expect(mainMarkup).toContain('Ожидаемый результат *');
    expect(mainMarkup).toContain('aria-required="true"');
    expect(additionalMarkup).not.toContain('Ожидаемый результат *');
    expect(additionalMarkup).toContain('aria-required="false"');
  });

  it('проверяет обязательные поля понятными сообщениями', () => {
    expect(
      validateDecisionForm({ kind: DECISION_KIND.main, title: ' ', expectedResult: 'Результат' }),
    ).toBe('Введите название решения');
    expect(
      validateDecisionForm({ kind: DECISION_KIND.main, title: 'Решение', expectedResult: ' ' }),
    ).toBe('Укажите ожидаемый результат');
    expect(
      validateDecisionForm({
        kind: DECISION_KIND.additional,
        title: 'Решение',
        expectedResult: '',
      }),
    ).toBeNull();
  });

  it('после успешного создания повторно загружает решения', async () => {
    const created = createPlannedDecision('новое', DATE, DECISION_KIND.main, 1);
    const createExecute = vi.fn().mockResolvedValue(success(created));
    const getExecute = vi.fn().mockResolvedValue([created]);

    const result = await createDecisionAndReload({
      currentDate: DATE,
      form: {
        kind: DECISION_KIND.main,
        title: 'Новое решение',
        expectedResult: 'Новый результат',
      },
      createDecisionForDate: { execute: createExecute },
      getDecisionsForDate: { execute: getExecute },
    });

    expect(result).toEqual({ ok: true, decisions: [created] });
    expect(createExecute).toHaveBeenCalledOnce();
    expect(createExecute).toHaveBeenCalledWith({
      title: 'Новое решение',
      kind: DECISION_KIND.main,
      plannedDate: DATE,
      expectedResult: 'Новый результат',
    });
    expect(getExecute).toHaveBeenCalledWith(DATE);
  });

  it('показывает сохранение и блокирует кнопки повторной отправки', () => {
    const state: TodayPageState = {
      ...createReadyState([]),
      isFormOpen: true,
      isSaving: true,
    };
    const markup = renderView(state);

    expect(markup).toContain('Сохраняем…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('показывает main_limit_reached и сохраняет введённые данные', async () => {
    const createExecute = vi
      .fn()
      .mockResolvedValue(
        failure(
          new DomainError(
            'decision.main_limit_reached',
            'На дату уже назначены три главных решения.',
          ),
        ),
      );
    const getExecute = vi.fn();
    const form = {
      kind: DECISION_KIND.main,
      title: 'Четвёртое решение',
      expectedResult: 'Результат остаётся',
    } as const;

    const result = await createDecisionAndReload({
      currentDate: DATE,
      form,
      createDecisionForDate: { execute: createExecute },
      getDecisionsForDate: { execute: getExecute },
    });
    const failedState = todayPageReducer(
      { ...createReadyState([]), isFormOpen: true, form },
      {
        type: 'save_failed',
        message: result.ok ? '' : result.message,
      },
    );

    expect(result).toEqual({
      ok: false,
      message: 'На сегодня уже назначены три главных решения',
    });
    expect(failedState.form).toBe(form);
    expect(renderView(failedState)).toContain('Результат остаётся');
    expect(getExecute).not.toHaveBeenCalled();
  });

  it('успех очищает форму, а отмена закрывает её', () => {
    const filled: TodayPageState = {
      ...createReadyState([]),
      isFormOpen: true,
      form: {
        kind: DECISION_KIND.additional,
        title: 'Введённое решение',
        expectedResult: 'Введённый результат',
      },
    };

    const succeeded = todayPageReducer(filled, { type: 'save_succeeded' });
    const cancelled = todayPageReducer(filled, { type: 'close_form' });

    expect(succeeded.isFormOpen).toBe(false);
    expect(succeeded.form).toEqual({ kind: DECISION_KIND.main, title: '', expectedResult: '' });
    expect(cancelled.isFormOpen).toBe(false);
  });

  it('renders main and additional decisions as native keyboard-accessible buttons', () => {
    const main = createPlannedDecision('main-open', DATE, DECISION_KIND.main, 1);
    const additional = createPlannedDecision('additional-open', DATE, DECISION_KIND.additional);

    const markup = renderView(createReadyState([main, additional]));

    expect(markup).toContain('decision-card-button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Открыть решение');
    expect(markup.match(/decision-open-hint/g)).toHaveLength(2);
    expect(isDecisionActivationKey('Enter')).toBe(true);
    expect(isDecisionActivationKey(' ')).toBe(true);
    expect(isDecisionActivationKey('Escape')).toBe(false);
  });

  it('shows decision details for both kinds and no internal identifiers', () => {
    const main = createPlannedDecision('main-details', DATE, DECISION_KIND.main, 2);
    const additional = createPlannedDecision('additional-details', DATE, DECISION_KIND.additional);
    const mainMarkup = renderView(createDetailsState(main));
    const additionalMarkup = renderView(createDetailsState(additional));

    expect(mainMarkup).toContain('Главное решение');
    expect(mainMarkup).toContain('Позиция');
    expect(mainMarkup).toContain('Запланировано');
    expect(additionalMarkup).toContain('Дополнительное решение');
    expect(additionalMarkup).not.toContain('<dt>Позиция</dt>');
    expect(mainMarkup).not.toContain('data-decision-id');
    expect(mainMarkup).not.toContain('main-details-draft-event');
    expect(mainMarkup).not.toContain('decision.not_found');
  });

  it('shows details loading, controlled error with retry, and closes the panel', () => {
    const decision = createPlannedDecision('details-state', DATE);
    const loading = todayPageReducer(createReadyState([decision]), {
      type: 'details_load_started',
      decisionId: decision.id,
    });
    const failed = todayPageReducer(loading, {
      type: 'details_load_failed',
      decisionId: decision.id,
    });
    const closed = todayPageReducer(failed, { type: 'details_closed' });

    expect(renderView(loading)).toContain('Загружаем решение…');
    expect(renderView(failed)).toContain('Не удалось открыть решение');
    expect(renderView(failed)).toContain('Повторить');
    expect(renderView(failed)).toContain('Закрыть карточку решения');
    expect(renderView(closed)).not.toContain('decision-details-backdrop');
  });

  it('shows an empty linked-action state and existing linked actions', () => {
    const decision = createPlannedDecision('linked-actions', DATE);
    const emptyMarkup = renderView(createDetailsState(decision));
    const lifeAction = createReadyLifeAction('linked-ready', DATE, {
      decisionId: decision.id,
    });
    const filledMarkup = renderView(createDetailsState(decision, [lifeAction]));

    expect(emptyMarkup).toContain('Для этого решения пока нет действий');
    expect(filledMarkup).toContain('Действия по решению');
    expect(filledMarkup).toContain('Готово к выполнению');
    expect(filledMarkup).toContain('Результат linked-ready');
  });

  it('opens the action form, validates required fields, and cancellation closes it', () => {
    const decision = createPlannedDecision('action-form', DATE);
    const details = createDetailsState(decision);
    const opened = todayPageReducer(details, { type: 'life_action_form_opened' });
    const closed = todayPageReducer(opened, { type: 'life_action_form_closed' });

    expect(renderView(opened)).toContain('Название действия *');
    expect(renderView(opened)).toContain('Ожидаемый результат *');
    expect(renderView(opened)).toContain('Описание');
    expect(
      validateLifeActionForm({ title: ' ', expectedResult: 'Результат', description: '' }),
    ).toBe('Введите название действия');
    expect(
      validateLifeActionForm({ title: 'Действие', expectedResult: ' ', description: '' }),
    ).toBe('Укажите ожидаемый результат');
    expect(closed.isLifeActionFormOpen).toBe(false);
  });

  it('creates a linked action and reloads the list for the same decision', async () => {
    const decision = createPlannedDecision('create-linked', DATE);
    const created = createReadyLifeAction('created-linked', DATE, {
      decisionId: decision.id,
    });
    const createExecute = vi.fn().mockResolvedValue(success(created));
    const getExecute = vi.fn().mockResolvedValue([created]);
    const form = {
      title: 'Новое действие',
      expectedResult: 'Новый результат',
      description: 'Подробности',
    } as const;

    const result = await createLifeActionAndReload({
      decisionId: decision.id,
      plannedDate: DATE,
      form,
      createLifeActionForDecision: { execute: createExecute },
      getLifeActionsForDecision: { execute: getExecute },
    });

    expect(result).toEqual({ ok: true, lifeActions: [created] });
    expect(createExecute).toHaveBeenCalledWith({
      decisionId: decision.id,
      title: 'Новое действие',
      expectedResult: 'Новый результат',
      plannedDate: DATE,
      description: 'Подробности',
    });
    expect(getExecute).toHaveBeenCalledWith(decision.id);
  });

  it('blocks repeated action submission and clears the form after success', () => {
    const decision = createPlannedDecision('saving-action', DATE);
    const filled = {
      ...createDetailsState(decision),
      isLifeActionFormOpen: true,
      isLifeActionSaving: true,
      lifeActionForm: {
        title: 'Введённое действие',
        expectedResult: 'Введённый результат',
        description: 'Описание остаётся',
      },
    } satisfies TodayPageState;
    const markup = renderView(filled);
    const succeeded = todayPageReducer(filled, {
      type: 'life_action_save_succeeded',
      decisionId: decision.id,
      lifeActions: [],
    });

    expect(markup).toContain('Создаём…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
    expect(succeeded.isLifeActionFormOpen).toBe(false);
    expect(succeeded.lifeActionForm).toEqual({ title: '', expectedResult: '', description: '' });
  });

  it('preserves entered action data and hides internal error codes after failure', async () => {
    const decision = createPlannedDecision('failed-action', DATE);
    const form = {
      title: 'Данные остаются',
      expectedResult: 'Результат остаётся',
      description: 'Описание остаётся',
    } as const;
    const createExecute = vi
      .fn()
      .mockResolvedValue(
        failure(
          new DomainError('action.decision_unavailable', 'Internal message that must not be shown'),
        ),
      );
    const result = await createLifeActionAndReload({
      decisionId: decision.id,
      plannedDate: DATE,
      form,
      createLifeActionForDecision: { execute: createExecute },
      getLifeActionsForDecision: { execute: vi.fn() },
    });
    const failed = todayPageReducer(
      { ...createDetailsState(decision), isLifeActionFormOpen: true, lifeActionForm: form },
      { type: 'life_action_save_failed', message: result.ok ? '' : result.message },
    );
    const markup = renderView(failed);

    expect(failed.lifeActionForm).toBe(form);
    expect(markup).toContain('Для этого решения больше нельзя создавать действия');
    expect(markup).not.toContain('action.decision_unavailable');
    expect(markup).not.toContain('Internal message');
  });

  it('renders linked actions as native buttons activated by Enter and Space', () => {
    const decision = createPlannedDecision('open-action', DATE);
    const action = createReadyLifeAction('keyboard-action', DATE, { decisionId: decision.id });
    const markup = renderView(createDetailsState(decision, [action]));

    expect(markup).toContain('linked-action-card-button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Открыть действие');
    expect(isLifeActionActivationKey('Enter')).toBe(true);
    expect(isLifeActionActivationKey(' ')).toBe(true);
    expect(isLifeActionActivationKey('Escape')).toBe(false);
  });

  it('shows action details, decision relation, and back navigation without internal fields', () => {
    const decision = createPlannedDecision('action-details', DATE);
    const action = createReadyLifeAction('details-action', DATE, {
      decisionId: decision.id,
      description: 'Короткое описание действия',
    });
    const markup = renderView(createActionDetailsState(decision, action));

    expect(markup).toContain('Назад к решению');
    expect(markup).toContain('Действие details-action');
    expect(markup).toContain('Короткое описание действия');
    expect(markup).toContain('Результат details-action');
    expect(markup).toContain('Готово к выполнению');
    expect(markup).toContain('Решение «Решение action-details»');
    expect(markup).not.toContain('details-action-ready-event');
    expect(markup).not.toContain('<dt>Version</dt>');
    expect(markup).not.toContain('session.unfinished_exists');
  });

  it('shows action-session loading, controlled error, retry, and back navigation', () => {
    const decision = createPlannedDecision('action-loading', DATE);
    const action = createReadyLifeAction('loading-action', DATE, { decisionId: decision.id });
    const loading = todayPageReducer(createDetailsState(decision, [action]), {
      type: 'action_details_load_started',
      lifeAction: action,
    });
    const failed = todayPageReducer(loading, {
      type: 'action_details_load_failed',
      lifeActionId: action.id,
    });
    const back = todayPageReducer(failed, { type: 'action_details_closed' });

    expect(renderView(loading)).toContain('Загружаем выполнение…');
    expect(renderView(failed)).toContain('Не удалось загрузить выполнение');
    expect(renderView(failed)).toContain('Повторить');
    expect(renderView(failed)).toContain('Назад к решению');
    expect(renderView(back)).toContain('Действия по решению');
  });

  it('shows an empty session history and a compact completed-session history', () => {
    const decision = createPlannedDecision('history', DATE);
    const action = createReadyLifeAction('history-action', DATE, { decisionId: decision.id });
    const emptyMarkup = renderView(createActionDetailsState(decision, action));
    const completed = completeSession(createSession('completed-history', action.id));
    const filledMarkup = renderView(createActionDetailsState(decision, action, [completed], null));

    expect(emptyMarkup).toContain('Работа по этому действию ещё не начиналась');
    expect(filledMarkup).toContain('Завершённые сессии');
    expect(filledMarkup).toContain('Завершена');
    expect(filledMarkup).toContain('05:00');
    expect(filledMarkup).toContain('Результат рабочей сессии');
  });

  it('shows start controls only for eligible actions without an active session', () => {
    const decision = createPlannedDecision('start-control', DATE);
    const ready = createReadyLifeAction('ready-start', DATE, { decisionId: decision.id });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('progress-start', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('completed-action', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-action', DATE, { decisionId: decision.id }),
    );

    expect(renderView(createActionDetailsState(decision, ready))).toContain('Начать выполнение');
    expect(renderView(createActionDetailsState(decision, inProgress))).toContain(
      'Продолжить новой сессией',
    );
    expect(renderView(createActionDetailsState(decision, completed))).not.toContain(
      'Начать выполнение',
    );
    expect(renderView(createActionDetailsState(decision, cancelled))).not.toContain(
      'Начать выполнение',
    );
  });

  it('updates the action and shows a running session after start without reloading', () => {
    const decision = createPlannedDecision('started-state', DATE);
    const action = createReadyLifeAction('started-action', DATE, { decisionId: decision.id });
    const initial = createActionDetailsState(decision, action);
    const updatedAction = markLifeActionInProgress(action);
    const running = createSession('running-after-start', action.id);
    const started = todayPageReducer(initial, {
      type: 'session_started',
      lifeAction: updatedAction,
      session: running,
    });
    const markup = renderView(started);

    expect(markup).toContain('Выполняется');
    expect(markup).toContain('Пауза');
    expect(markup).toContain('02:00:00');
    expect(markup).not.toContain('Начать выполнение');
    expect(started.details.status === 'ready' && started.details.lifeActions[0]?.status).toBe(
      'in_progress',
    );
  });

  it('blocks start for running and paused sessions that belong to another action', () => {
    const decision = createPlannedDecision('foreign-session', DATE);
    const action = createReadyLifeAction('blocked-action', DATE, { decisionId: decision.id });
    const foreignRunning = createSession('foreign-running', EntityId.create('foreign-action'));
    const foreignPaused = pauseSession(
      createSession('foreign-paused', EntityId.create('other-foreign-action')),
    );

    for (const unfinished of [foreignRunning, foreignPaused]) {
      const markup = renderView(createActionDetailsState(decision, action, [], unfinished));
      expect(markup).toContain('Сначала завершите или приостановите текущую работу');
      expect(markup).toContain('disabled=""');
    }
  });

  it('does not block start when another action has only a completed session', () => {
    const decision = createPlannedDecision('completed-foreign', DATE);
    const action = createReadyLifeAction('unblocked-action', DATE, { decisionId: decision.id });
    const completedForeign = completeSession(
      createSession('foreign-completed', EntityId.create('foreign-completed-action')),
    );
    const markup = renderView(createActionDetailsState(decision, action, [completedForeign], null));

    expect(markup).toContain('Начать выполнение');
    expect(markup).not.toContain('Сначала завершите или приостановите текущую работу');
  });

  it('switches the active session between running and paused controls', () => {
    const decision = createPlannedDecision('pause-resume', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('pause-resume-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('pause-resume-session', action.id);
    const initial = createActionDetailsState(decision, action, [running], running);
    const paused = pauseSession(running);
    const pausedState = todayPageReducer(initial, { type: 'session_updated', session: paused });
    const pausedMarkup = renderView(pausedState);
    const resumed = resumeSession(paused);
    const resumedState = todayPageReducer(pausedState, {
      type: 'session_updated',
      session: resumed,
    });

    expect(pausedMarkup).toContain('На паузе');
    expect(pausedMarkup).toContain('Продолжить');
    expect(renderView(resumedState)).toContain('Выполняется');
    expect(renderView(resumedState)).toContain('Пауза');
  });

  it('disables session controls while a command is pending', () => {
    const decision = createPlannedDecision('pending-session', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('pending-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('pending-running', action.id);
    const pending = todayPageReducer(
      createActionDetailsState(decision, action, [running], running),
      { type: 'session_operation_started' },
    );

    expect(renderView(pending)).toContain('disabled=""');
    expect(pending.isSessionMutating).toBe(true);
  });

  it('maps session errors to understandable text without exposing internal codes', () => {
    const decision = createPlannedDecision('session-errors', DATE);
    const action = createReadyLifeAction('error-action', DATE, { decisionId: decision.id });
    const failed = todayPageReducer(createActionDetailsState(decision, action), {
      type: 'session_operation_failed',
      message: startSessionErrorMessage('session.unfinished_exists'),
    });
    const markup = renderView(failed);

    expect(markup).toContain('Сначала завершите или приостановите текущую работу');
    expect(markup).not.toContain('session.unfinished_exists');
    expect(pauseSessionErrorMessage('session.not_found')).toBe('Сессия больше недоступна');
    expect(pauseSessionErrorMessage('unknown')).toBe('Не удалось поставить работу на паузу');
    expect(resumeSessionErrorMessage()).toBe('Не удалось продолжить работу');
  });

  it('formats timers as MM:SS and HH:MM:SS', () => {
    expect(formatDuration(59_999)).toBe('00:59');
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('ticks the running timer once per second with managed fake timers', () => {
    vi.useFakeTimers();
    try {
      const onTick = vi.fn();
      const cancel = scheduleSessionTimer(onTick);

      vi.advanceTimersByTime(3_100);
      expect(onTick).toHaveBeenCalledTimes(3);

      cancel();
      vi.advanceTimersByTime(2_000);
      expect(onTick).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

function createReadyState(
  decisions: readonly ReturnType<typeof createPlannedDecision>[],
): TodayPageState {
  return {
    ...INITIAL_TODAY_PAGE_STATE,
    decisions: { status: 'ready', decisions },
  };
}

function createDetailsState(
  decision: ReturnType<typeof createPlannedDecision>,
  lifeActions: readonly LifeAction[] = [],
): TodayPageState {
  return {
    ...createReadyState([decision]),
    details: {
      status: 'ready',
      decisionId: decision.id,
      decision,
      lifeActions,
    },
  };
}

function createActionDetailsState(
  decision: ReturnType<typeof createPlannedDecision>,
  lifeAction: LifeAction,
  sessions: readonly ActionSession[] = [],
  unfinishedSession: ActionSession | null = null,
): TodayPageState {
  return {
    ...createDetailsState(decision, [lifeAction]),
    actionDetails: {
      status: 'ready',
      lifeAction,
      sessions,
      unfinishedSession,
    },
  };
}

function createSession(id: string, lifeActionId: EntityId): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt: new Date('2026-08-02T08:00:00.000+09:00'),
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function pauseSession(session: ActionSession): ActionSession {
  session.pause(
    new Date(session.startedAt.getTime() + 60_000),
    EntityId.create(`${session.id.toString()}-pause-event`),
  );
  return session;
}

function resumeSession(session: ActionSession): ActionSession {
  session.resume(
    new Date(session.startedAt.getTime() + 120_000),
    EntityId.create(`${session.id.toString()}-resume-event`),
  );
  return session;
}

function completeSession(session: ActionSession): ActionSession {
  session.complete({
    completedAt: new Date(session.startedAt.getTime() + 300_000),
    completionKind: 'completed',
    resultNote: SessionResultNote.create('Результат рабочей сессии'),
    eventId: EntityId.create(`${session.id.toString()}-complete-event`),
  });
  return session;
}

function renderView(state: TodayPageState): string {
  return renderToStaticMarkup(
    TodayPageView({
      currentDate: DATE,
      clock: { now: () => new Date('2026-08-02T10:00:00.000+09:00') },
      state,
      onRetry: NOOP,
      onOpenForm: NOOP,
      onCloseForm: NOOP,
      onKindChange: NOOP,
      onTitleChange: NOOP,
      onExpectedResultChange: NOOP,
      onSubmit: NOOP,
      onOpenDecision: NOOP,
      onCloseDecision: NOOP,
      onRetryDecision: NOOP,
      onOpenLifeActionForm: NOOP,
      onCloseLifeActionForm: NOOP,
      onLifeActionTitleChange: NOOP,
      onLifeActionExpectedResultChange: NOOP,
      onLifeActionDescriptionChange: NOOP,
      onLifeActionSubmit: NOOP,
      onOpenLifeAction: NOOP,
      onBackToDecision: NOOP,
      onRetryLifeAction: NOOP,
      onStartSession: NOOP,
      onPauseSession: NOOP,
      onResumeSession: NOOP,
    }),
  );
}
