import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DayDate,
  DECISION_KIND,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success } from '../../shared/result/Result';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { formatDuration, scheduleSessionTimer } from '../session/sessionTimer';
import { TodayPageView } from './TodayPage';
import {
  ACTION_COMPLETION_CHOICE,
  ACTION_COMPLETION_FAILED_MESSAGE,
  cancelLifeActionResult,
  completeSessionWorkflow,
  completeSessionErrorMessage,
  cancelDecisionResult,
  confirmDecisionResult,
  createDecisionAndReload,
  createLifeActionAndReload,
  decisionCancellationErrorMessage,
  decisionConfirmationErrorMessage,
  decisionEditErrorMessage,
  INITIAL_TODAY_PAGE_STATE,
  isDecisionActivationKey,
  isLifeActionActivationKey,
  lifeActionCancellationErrorMessage,
  lifeActionEditErrorMessage,
  pauseSessionErrorMessage,
  retryLifeActionCompletion,
  resumeSessionErrorMessage,
  startSessionErrorMessage,
  todayPageReducer,
  updateDecisionDetailsResult,
  updateLifeActionDetailsResult,
  validateDecisionForm,
  validateLifeActionForm,
  validateLifeActionEditForm,
  validateDecisionConfirmationForm,
  validateDecisionEditForm,
  validateSessionCompletionForm,
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

  it('показывает количества действий по состояниям', () => {
    const decision = createPlannedDecision('result-counts', DATE);
    const completed = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('completed-count', DATE, { decisionId: decision.id }),
      ),
    );
    const ready = createReadyLifeAction('ready-count', DATE, { decisionId: decision.id });
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-count', DATE, { decisionId: decision.id }),
    );
    const markup = renderView(createDetailsState(decision, [completed, ready, cancelled]));

    expect(markup).toContain('<dt>Завершено</dt><dd>1</dd>');
    expect(markup).toContain('<dt>Не завершено</dt><dd>1</dd>');
    expect(markup).toContain('<dt>Отменено</dt><dd>1</dd>');
  });

  it('без completed-действий блокирует подтверждение и объясняет причину', () => {
    const decision = createPlannedDecision('no-completed-ui', DATE);
    const markup = renderView(createDetailsState(decision));

    expect(markup).toContain('Чтобы подтвердить решение, завершите хотя бы одно действие');
    expect(markup).toContain('decision-confirm-button" type="button" disabled=""');
  });

  it('unfinished-действие блокирует подтверждение', () => {
    const decision = createPlannedDecision('unfinished-ui', DATE);
    const completed = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('done-ui', DATE, { decisionId: decision.id })),
    );
    const ready = createReadyLifeAction('ready-ui', DATE, { decisionId: decision.id });
    const markup = renderView(createDetailsState(decision, [completed, ready]));

    expect(markup).toContain('Сначала завершите текущие действия');
    expect(markup).toContain('decision-confirm-button" type="button" disabled=""');
  });

  it('completed-действие разрешает подтверждение, а cancelled его не блокирует', () => {
    const decision = createPlannedDecision('available-ui', DATE);
    const completed = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('done-available', DATE, { decisionId: decision.id }),
      ),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-available', DATE, { decisionId: decision.id }),
    );
    const markup = renderView(createDetailsState(decision, [completed, cancelled]));

    expect(markup).toContain('Подтвердить результат решения');
    expect(markup).not.toContain('decision-confirm-button" type="button" disabled=""');
    expect(markup).not.toContain('Сначала завершите текущие действия');
  });

  it('открывает и закрывает форму подтверждения', () => {
    const decision = createPlannedDecision('confirmation-form', DATE);
    const initial = createDetailsState(decision);
    const opened = todayPageReducer(initial, { type: 'decision_confirmation_form_opened' });
    const closed = todayPageReducer(opened, { type: 'decision_confirmation_form_closed' });

    expect(renderView(opened)).toContain('Подтверждение решения');
    expect(renderView(opened)).toContain('Фактический результат решения *');
    expect(renderView(opened)).toContain(
      'Завершённые действия будут использованы как подтверждение результата',
    );
    expect(closed.isDecisionConfirmationFormOpen).toBe(false);
  });

  it('проверяет обязательность actualResult', () => {
    expect(validateDecisionConfirmationForm({ actualResult: '   ' })).toBe(
      'Укажите фактический результат решения',
    );
    expect(validateDecisionConfirmationForm({ actualResult: 'Факт' })).toBeNull();
  });

  it('блокирует повторную отправку формы подтверждения', () => {
    const decision = createPlannedDecision('confirmation-saving', DATE);
    const state = {
      ...createDetailsState(decision),
      isDecisionConfirmationFormOpen: true,
      isDecisionConfirming: true,
      decisionConfirmationForm: { actualResult: 'Сохраняемый факт' },
    } satisfies TodayPageState;
    const markup = renderView(state);

    expect(markup).toContain('Подтверждаем…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('успешное подтверждение обновляет карточку без F5 и очищает форму', () => {
    const planned = createPlannedDecision('confirmation-success', DATE);
    const confirmed = confirmDecision(planned);
    const state = {
      ...createDetailsState(planned),
      isDecisionConfirmationFormOpen: true,
      decisionConfirmationForm: { actualResult: 'Введённый факт' },
      isLifeActionFormOpen: true,
    } satisfies TodayPageState;

    const succeeded = todayPageReducer(state, {
      type: 'decision_confirmation_succeeded',
      decision: confirmed,
    });

    expect(succeeded.details.status).toBe('ready');
    if (succeeded.details.status === 'ready') {
      expect(succeeded.details.decision).toBe(confirmed);
    }
    expect(succeeded.isDecisionConfirmationFormOpen).toBe(false);
    expect(succeeded.decisionConfirmationForm.actualResult).toBe('');
    expect(succeeded.isLifeActionFormOpen).toBe(false);
  });

  it('показывает итог подтверждённого решения без внутренних evidenceIds', () => {
    const decision = confirmDecision(createPlannedDecision('confirmed-ui', DATE));
    const completed = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('confirmed-action', DATE, { decisionId: decision.id }),
      ),
    );
    const markup = renderView(createDetailsState(decision, [completed]));

    expect(markup).toContain('Решение подтверждено');
    expect(markup).toContain('Результат подтверждён');
    expect(markup).toContain('Действий в подтверждении');
    expect(markup).toContain('Завершённые действия');
    expect(markup).toContain('Действие confirmed-action');
    expect(markup).not.toContain('confirmed-ui-evidence');
  });

  it('после confirmed скрывает создание действия и повторное подтверждение', () => {
    const decision = confirmDecision(createPlannedDecision('final-ui', DATE));
    const markup = renderView(createDetailsState(decision));

    expect(markup).not.toContain('Создать действие');
    expect(markup).not.toContain('Подтвердить результат решения');
  });

  it('при ошибке сохраняет введённый actualResult и не показывает внутренний код', () => {
    const decision = createPlannedDecision('failed-confirmation', DATE);
    const filled = {
      ...createDetailsState(decision),
      isDecisionConfirmationFormOpen: true,
      decisionConfirmationForm: { actualResult: 'Текст должен остаться' },
    } satisfies TodayPageState;
    const failed = todayPageReducer(filled, {
      type: 'decision_confirmation_failed',
      message: decisionConfirmationErrorMessage('decision.actions_unfinished'),
    });
    const markup = renderView(failed);

    expect(failed.decisionConfirmationForm.actualResult).toBe('Текст должен остаться');
    expect(markup).toContain('Сначала завершите текущие действия');
    expect(markup).not.toContain('decision.actions_unfinished');
  });

  it('вызывает ConfirmDecisionFromActions и возвращает сущность команды', async () => {
    const decision = confirmDecision(createPlannedDecision('workflow-confirmation', DATE));
    const execute = vi.fn().mockResolvedValue(success(decision));

    const result = await confirmDecisionResult({
      decisionId: decision.id,
      form: { actualResult: 'Фактический итог' },
      confirmDecisionFromActions: { execute },
    });

    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({
      decisionId: decision.id,
      actualResult: 'Фактический итог',
    });
  });

  it('показывает редактирование только для planned и безопасную отмену для активных решений', () => {
    const planned = createPlannedDecision('management-planned', DATE);
    const inProgress = markDecisionInProgress(createPlannedDecision('management-progress', DATE));
    const confirmed = confirmDecision(createPlannedDecision('management-confirmed', DATE));

    const plannedMarkup = renderView(createDetailsState(planned));
    const progressMarkup = renderView(createDetailsState(inProgress));
    const confirmedMarkup = renderView(createDetailsState(confirmed));

    expect(plannedMarkup).toContain('Редактировать');
    expect(plannedMarkup).toContain('Отменить решение');
    expect(progressMarkup).not.toContain('Редактировать');
    expect(progressMarkup).toContain('Отменить решение');
    expect(confirmedMarkup).not.toContain('Редактировать');
    expect(confirmedMarkup).not.toContain('Отменить решение');
  });

  it('открывает предзаполненную форму редактирования и проверяет обязательные поля', () => {
    const decision = createPlannedDecision('edit-form', DATE);
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_edit_form_opened',
    });
    const markup = renderView(opened);

    expect(markup).toContain('Редактирование решения');
    expect(markup).toContain('value="Решение edit-form"');
    expect(markup).toContain('Результат edit-form');
    expect(markup).toContain('Ожидаемый результат *');
    expect(
      validateDecisionEditForm({ title: ' ', expectedResult: 'Результат' }, decision.kind),
    ).toBe('Введите название решения');
    expect(validateDecisionEditForm({ title: 'Решение', expectedResult: ' ' }, decision.kind)).toBe(
      'Укажите ожидаемый результат',
    );
    expect(
      validateDecisionEditForm({ title: 'Решение', expectedResult: '' }, DECISION_KIND.additional),
    ).toBeNull();
  });

  it('сохраняет введённые данные при ошибке редактирования и блокирует повторную отправку', () => {
    const decision = createPlannedDecision('edit-failure', DATE);
    const state = {
      ...createDetailsState(decision),
      isDecisionEditFormOpen: true,
      isDecisionEditing: true,
      decisionEditForm: { title: 'Текст остаётся', expectedResult: 'Результат остаётся' },
      decisionEditError: decisionEditErrorMessage('decision.cannot_edit'),
    } satisfies TodayPageState;
    const markup = renderView(state);

    expect(markup).toContain('Текст остаётся');
    expect(markup).toContain('Результат остаётся');
    expect(markup).toContain('Это решение уже нельзя редактировать');
    expect(markup).not.toContain('decision.cannot_edit');
    expect(markup).toContain('Сохраняем…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('обновляет решение после редактирования без F5 и вызывает прикладную команду', async () => {
    const decision = createPlannedDecision('edit-workflow', DATE);
    decision.updateDetails({
      title: decision.title,
      expectedResult: decision.expectedResult,
      occurredAt: new Date('2026-08-02T11:00:00.000+09:00'),
      eventId: EntityId.create('unused-edit-event'),
    });
    const execute = vi.fn().mockResolvedValue(success(decision));

    const result = await updateDecisionDetailsResult({
      decisionId: decision.id,
      form: { title: 'Новое название', expectedResult: 'Новый результат' },
      updateDecisionDetails: { execute },
    });
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_edit_form_opened',
    });
    const succeeded = todayPageReducer(opened, {
      type: 'decision_edit_succeeded',
      decision,
    });

    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({
      decisionId: decision.id,
      title: 'Новое название',
      expectedResult: 'Новый результат',
    });
    expect(succeeded.isDecisionEditFormOpen).toBe(false);
    expect(succeeded.decisionEditForm).toEqual({ title: '', expectedResult: '' });
  });

  it('подтверждает отмену отдельно и объясняет блокировку незавершёнными действиями', async () => {
    const decision = createPlannedDecision('cancel-workflow', DATE);
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_cancellation_opened',
    });
    const failed = todayPageReducer(opened, {
      type: 'decision_cancellation_failed',
      message: decisionCancellationErrorMessage('decision.actions_unfinished'),
    });
    const openedMarkup = renderView(opened);
    const failedMarkup = renderView(failed);
    const execute = vi.fn().mockResolvedValue(success(cancelDecision(decision)));
    const result = await cancelDecisionResult({
      decisionId: decision.id,
      cancelDecisionSafely: { execute },
    });
    const succeeded = todayPageReducer(failed, {
      type: 'decision_cancellation_succeeded',
      decision,
    });

    expect(openedMarkup).toContain('Отменить это решение?');
    expect(failedMarkup).toContain('Сначала завершите или отмените незавершённые действия');
    expect(failedMarkup).not.toContain('decision.actions_unfinished');
    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({ decisionId: decision.id });
    expect(renderView(succeeded)).toContain('Решение отменено');
    expect(renderView(succeeded)).not.toContain('Редактировать');
  });

  it('показывает редактирование только для ready-действия и заполняет форму текущими значениями', () => {
    const decision = createPlannedDecision('action-edit-visible', DATE);
    const ready = createReadyLifeAction('action-edit-ready', DATE, {
      decisionId: decision.id,
      description: 'Текущее описание',
    });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('action-edit-progress', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('action-edit-completed', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('action-edit-cancelled', DATE, { decisionId: decision.id }),
    );

    const readyMarkup = renderView(createActionDetailsState(decision, ready));
    const opened = todayPageReducer(createActionDetailsState(decision, ready), {
      type: 'life_action_edit_form_opened',
    });
    const openedMarkup = renderView(opened);
    const closed = todayPageReducer(opened, { type: 'life_action_edit_form_closed' });

    expect(readyMarkup).toContain('Редактировать');
    expect(openedMarkup).toContain('Редактирование действия');
    expect(openedMarkup).toContain('Действие action-edit-ready');
    expect(openedMarkup).toContain('Текущее описание');
    expect(openedMarkup).toContain('Результат action-edit-ready');
    expect(renderView(closed)).not.toContain('Редактирование действия');
    for (const action of [inProgress, completed, cancelled]) {
      expect(renderView(createActionDetailsState(decision, action))).not.toContain(
        '>Редактировать<',
      );
    }
  });

  it('проверяет поля редактирования и обновляет панель и список действия без F5', async () => {
    const decision = createPlannedDecision('action-edit-success', DATE);
    const current = createReadyLifeAction('action-edit-success', DATE, { decisionId: decision.id });
    const updated = createReadyLifeAction('action-edit-success', DATE, {
      decisionId: decision.id,
      description: 'Новое описание',
    });
    updated.updateDetails({
      title: current.title,
      description: 'Новое описание',
      expectedResult: current.expectedResult!,
      occurredAt: new Date('2026-08-02T12:00:00.000+09:00'),
      eventId: EntityId.create('ui-details-event'),
    });
    const execute = vi.fn().mockResolvedValue(success(updated));
    const form = {
      title: updated.title.toString(),
      description: 'Новое описание',
      expectedResult: updated.expectedResult!.toString(),
    };

    expect(validateLifeActionEditForm({ ...form, title: ' ' })).toBe('Введите название действия');
    expect(validateLifeActionEditForm({ ...form, expectedResult: ' ' })).toBe(
      'Укажите ожидаемый результат',
    );
    const result = await updateLifeActionDetailsResult({
      lifeActionId: current.id,
      form,
      updateLifeActionDetails: { execute },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected updated LifeAction');
    }
    const succeeded = todayPageReducer(
      {
        ...createActionDetailsState(decision, current),
        isLifeActionEditFormOpen: true,
        lifeActionEditForm: form,
      },
      { type: 'life_action_edit_succeeded', lifeAction: result.lifeAction },
    );

    expect(succeeded.isLifeActionEditFormOpen).toBe(false);
    expect(succeeded.actionDetails.status === 'ready' && succeeded.actionDetails.lifeAction).toBe(
      updated,
    );
    expect(succeeded.details.status === 'ready' && succeeded.details.lifeActions[0]).toBe(updated);
    expect(renderView(succeeded)).toContain('Новое описание');
    expect(execute).toHaveBeenCalledOnce();
  });

  it('блокирует повторное сохранение и сохраняет введённые значения после понятной ошибки', () => {
    const decision = createPlannedDecision('action-edit-failed', DATE);
    const action = createReadyLifeAction('action-edit-failed', DATE, { decisionId: decision.id });
    const form = {
      title: 'Введённое название',
      description: 'Введённое описание',
      expectedResult: 'Введённый результат',
    };
    const pending = {
      ...createActionDetailsState(decision, action),
      isLifeActionEditFormOpen: true,
      isLifeActionEditing: true,
      lifeActionEditForm: form,
    } satisfies TodayPageState;
    const failed = todayPageReducer(pending, {
      type: 'life_action_edit_failed',
      message: lifeActionEditErrorMessage('action.cannot_edit'),
    });

    expect(renderView(pending).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
    expect(failed.lifeActionEditForm).toBe(form);
    expect(renderView(failed)).toContain('Введённое описание');
    expect(renderView(failed)).toContain('Это действие уже нельзя редактировать');
    expect(renderView(failed)).not.toContain('action.cannot_edit');
  });

  it('показывает спокойное подтверждение отмены только для ready и in_progress', () => {
    const decision = createPlannedDecision('action-cancel-visible', DATE);
    const ready = createReadyLifeAction('action-cancel-ready', DATE, { decisionId: decision.id });
    const progress = markLifeActionInProgress(
      createReadyLifeAction('action-cancel-progress', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('action-cancel-completed', DATE, { decisionId: decision.id }),
    );
    const initial = createActionDetailsState(decision, ready);
    const opened = todayPageReducer(initial, { type: 'life_action_cancellation_opened' });
    const backed = todayPageReducer(opened, { type: 'life_action_cancellation_closed' });
    const markup = renderView(opened);

    expect(renderView(initial)).toContain('Отменить действие');
    expect(renderView(createActionDetailsState(decision, progress))).toContain('Отменить действие');
    expect(renderView(createActionDetailsState(decision, completed))).not.toContain(
      'Отменить действие',
    );
    expect(markup).toContain('Отменить это действие?');
    expect(markup).toContain(
      'Действие останется в истории, но продолжить его выполнение будет нельзя',
    );
    expect(markup).toContain('Назад');
    expect(backed.actionDetails.status === 'ready' && backed.actionDetails.lifeAction).toBe(ready);
  });

  it('показывает блокировку активной сессией без внутренних кодов', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('active-cancel', DATE));
    const execute = vi
      .fn()
      .mockResolvedValue(
        failure(new DomainError('action.session_unfinished', 'internal session error')),
      );
    const result = await cancelLifeActionResult({
      lifeActionId: action.id,
      cancelLifeActionSafely: { execute },
    });

    expect(result).toEqual({ ok: false, message: 'Сначала завершите текущую сессию' });
    expect(lifeActionCancellationErrorMessage('action.session_unfinished')).toBe(
      'Сначала завершите текущую сессию',
    );
  });

  it('после отмены обновляет карточки, скрывает управление и сохраняет историю сессий', () => {
    const decision = createPlannedDecision('action-cancel-success', DATE);
    const current = markLifeActionInProgress(
      createReadyLifeAction('action-cancel-success', DATE, { decisionId: decision.id }),
    );
    const completedSession = completeSession(createSession('before-cancel', current.id));
    const cancelled = cancelLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('action-cancel-success', DATE, { decisionId: decision.id }),
      ),
    );
    const state = todayPageReducer(
      {
        ...createActionDetailsState(decision, current, [completedSession], null),
        isLifeActionCancellationOpen: true,
      },
      { type: 'life_action_cancellation_succeeded', lifeAction: cancelled },
    );
    const markup = renderView(state);

    expect(markup).toContain('Отменено');
    expect(markup).toContain('Действие отменено');
    expect(markup).toContain('Завершённые сессии');
    expect(markup).toContain('Результат рабочей сессии');
    expect(markup).not.toContain('Начать выполнение');
    expect(markup).not.toContain('Продолжить новой сессией');
    expect(markup).not.toContain('>Редактировать<');
    expect(markup).not.toContain('Отменить это действие?');
    expect(state.details.status === 'ready' && state.details.lifeActions[0]).toBe(cancelled);
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

    expect(emptyMarkup).toContain('Завершённых сессий пока нет');
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
    expect(pausedMarkup).toContain('Завершить');
    expect(renderView(resumedState)).toContain('Выполняется');
    expect(renderView(resumedState)).toContain('Пауза');
    expect(renderView(resumedState)).toContain('Завершить');
  });

  it('opens and cancels the completion form with the required defaults', () => {
    const decision = createPlannedDecision('completion-form', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('completion-form-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('completion-form-session', action.id);
    const initial = createActionDetailsState(decision, action, [running], running);
    const opened = todayPageReducer(initial, { type: 'session_completion_form_opened' });
    const markup = renderView(opened);

    expect(markup).toContain('Завершение работы');
    expect(markup).toContain('Что сделано за эту сессию');
    expect(markup).toContain('Сессия завершена');
    expect(markup).toContain('Работа прервана');
    expect(markup).toContain('Продолжить действие позже');
    expect(markup).toContain('Завершить действие полностью');
    expect(markup).not.toContain('Фактический результат *');
    expect(opened.sessionCompletionForm.completionKind).toBe(SESSION_COMPLETION_KIND.completed);
    expect(opened.sessionCompletionForm.actionChoice).toBe(ACTION_COMPLETION_CHOICE.continueLater);
    expect(validateSessionCompletionForm(opened.sessionCompletionForm)).toBeNull();

    const cancelled = todayPageReducer(opened, { type: 'session_completion_form_closed' });
    expect(cancelled.isSessionCompletionFormOpen).toBe(false);
    expect(renderView(cancelled)).not.toContain('Завершение работы');
  });

  it('supports interrupted completion and requires an actual result only for the whole action', () => {
    const decision = createPlannedDecision('completion-fields', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('completion-fields-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('completion-fields-session', action.id);
    let state = todayPageReducer(createActionDetailsState(decision, action, [running], running), {
      type: 'session_completion_form_opened',
    });
    state = todayPageReducer(state, {
      type: 'session_completion_kind_changed',
      completionKind: SESSION_COMPLETION_KIND.interrupted,
    });
    state = todayPageReducer(state, {
      type: 'action_completion_choice_changed',
      actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
    });

    expect(renderView(state)).toContain('Фактический результат *');
    expect(validateSessionCompletionForm(state.sessionCompletionForm)).toBe(
      'Укажите фактический результат',
    );

    state = todayPageReducer(state, {
      type: 'action_actual_result_changed',
      actualResult: 'Получен проверенный результат',
    });
    expect(validateSessionCompletionForm(state.sessionCompletionForm)).toBeNull();
    expect(state.sessionCompletionForm.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
  });

  it('completes only the session and leaves the action in progress', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('session-only', DATE));
    const running = createSession('session-only-running', action.id);
    const completed = completeSession(createSession('session-only-running', action.id));
    const completeSessionExecute = vi.fn().mockResolvedValue(success(completed));
    const completeActionExecute = vi.fn();

    const result = await completeSessionWorkflow({
      session: running,
      lifeAction: action,
      form: {
        resultNote: '',
        completionKind: SESSION_COMPLETION_KIND.completed,
        actionChoice: ACTION_COMPLETION_CHOICE.continueLater,
        actualResult: '',
      },
      completeActionSession: { execute: completeSessionExecute },
      completeLifeAction: { execute: completeActionExecute },
    });

    expect(result.status).toBe('session_completed');
    expect(completeSessionExecute).toHaveBeenCalledWith({
      sessionId: running.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
    });
    expect(completeActionExecute).not.toHaveBeenCalled();
    expect(action.status).toBe('in_progress');
  });

  it('completes the session and action in order and renders the final summary', async () => {
    const decision = createPlannedDecision('full-completion', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('full-completion-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('full-completion-session', action.id);
    const completedSession = completeSession(createSession('full-completion-session', action.id));
    const completedAction = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('full-completion-action', DATE, { decisionId: decision.id }),
      ),
    );
    const callOrder: string[] = [];
    const completeSessionExecute = vi.fn().mockImplementation(async () => {
      callOrder.push('session');
      return success(completedSession);
    });
    const completeActionExecute = vi.fn().mockImplementation(async () => {
      callOrder.push('action');
      return success(completedAction);
    });

    const result = await completeSessionWorkflow({
      session: running,
      lifeAction: action,
      form: {
        resultNote: 'Итог сессии',
        completionKind: SESSION_COMPLETION_KIND.completed,
        actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
        actualResult: 'Фактический итог',
      },
      completeActionSession: { execute: completeSessionExecute },
      completeLifeAction: { execute: completeActionExecute },
    });

    expect(callOrder).toEqual(['session', 'action']);
    expect(completeActionExecute.mock.calls[0]?.[0].actualResult.toString()).toBe(
      'Фактический итог',
    );
    expect(result.status).toBe('action_completed');
    if (result.status !== 'action_completed') {
      throw new Error('Expected complete action result');
    }
    const state = todayPageReducer(createActionDetailsState(decision, action, [running], running), {
      type: 'life_action_completed',
      lifeAction: result.lifeAction,
      session: result.session,
    });
    const markup = renderView(state);

    expect(markup).toContain('Действие завершено');
    expect(markup).toContain('Действие выполнено');
    expect(markup).toContain('Завершённых сессий');
    expect(markup).not.toContain('Начать выполнение');
    expect(markup).not.toContain('Продолжить новой сессией');
    expect(markup).not.toContain('Пауза');
  });

  it('keeps the completed session and retries only action completion after a partial failure', async () => {
    const decision = createPlannedDecision('partial-failure', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('partial-failure-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('partial-failure-session', action.id);
    const completedSession = completeSession(createSession('partial-failure-session', action.id));
    const completedAction = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('partial-failure-action', DATE, { decisionId: decision.id }),
      ),
    );
    const completeSessionExecute = vi.fn().mockResolvedValue(success(completedSession));
    const completeActionExecute = vi
      .fn()
      .mockResolvedValueOnce(
        failure(new DomainError('action.persistence_failed', 'internal failure')),
      )
      .mockResolvedValueOnce(success(completedAction));
    const form = {
      resultNote: 'Сессия сохранена',
      completionKind: SESSION_COMPLETION_KIND.completed,
      actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
      actualResult: 'Результат не должен потеряться',
    } as const;

    const workflow = await completeSessionWorkflow({
      session: running,
      lifeAction: action,
      form,
      completeActionSession: { execute: completeSessionExecute },
      completeLifeAction: { execute: completeActionExecute },
    });
    expect(workflow.status).toBe('action_failed');
    if (workflow.status !== 'action_failed') {
      throw new Error('Expected partial failure');
    }
    const failedState = todayPageReducer(
      {
        ...createActionDetailsState(decision, action, [running], running),
        sessionCompletionForm: form,
        isSessionCompletionFormOpen: true,
      },
      {
        type: 'session_completed_action_failed',
        session: workflow.session,
        message: workflow.message,
      },
    );
    const failedMarkup = renderView(failedState);

    expect(
      failedState.actionDetails.status === 'ready' && failedState.actionDetails.unfinishedSession,
    ).toBeNull();
    expect(failedState.sessionCompletionForm.actualResult).toBe('Результат не должен потеряться');
    expect(failedMarkup).toContain(ACTION_COMPLETION_FAILED_MESSAGE);
    expect(failedMarkup).toContain('Повторить завершение действия');
    expect(failedMarkup).not.toContain('Продолжить новой сессией');

    const retry = await retryLifeActionCompletion({
      lifeAction: action,
      actualResult: failedState.sessionCompletionForm.actualResult,
      completeLifeAction: { execute: completeActionExecute },
    });

    expect(retry.ok).toBe(true);
    expect(completeSessionExecute).toHaveBeenCalledOnce();
    expect(completeActionExecute).toHaveBeenCalledTimes(2);
  });

  it('blocks repeated completion submission and preserves entered data after an error', () => {
    const decision = createPlannedDecision('completion-pending', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('completion-pending-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('completion-pending-session', action.id);
    const form = {
      resultNote: 'Введённый итог',
      completionKind: SESSION_COMPLETION_KIND.interrupted,
      actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
      actualResult: 'Введённый фактический результат',
    } as const;
    const pending = {
      ...createActionDetailsState(decision, action, [running], running),
      isSessionMutating: true,
      isSessionCompletionFormOpen: true,
      sessionCompletionForm: form,
    } satisfies TodayPageState;
    const failed = todayPageReducer(pending, {
      type: 'session_operation_failed',
      message: 'Не удалось завершить сессию',
    });

    expect(renderView(pending).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(8);
    expect(failed.sessionCompletionForm).toBe(form);
    expect(renderView(failed)).toContain('Введённый фактический результат');
    expect(renderView(failed)).not.toContain('session.not_found');
  });

  it('shows interrupted session duration, pause time, and newest-first history', () => {
    const decision = createPlannedDecision('history-details', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('history-details-action', DATE, { decisionId: decision.id }),
    );
    const older = completeSession(createSession('older-session', action.id));
    const newer = completeSession(
      pauseSession(
        createSession('newer-session', action.id, new Date('2026-08-02T09:00:00.000+09:00')),
      ),
      SESSION_COMPLETION_KIND.interrupted,
    );
    const markup = renderView(createActionDetailsState(decision, action, [older, newer], null));

    expect(markup).toContain('Прервана');
    expect(markup).toContain('01:00');
    expect(markup).toContain('04:00');
    expect(markup.indexOf('newer-session')).toBe(-1);
    expect(markup.indexOf('09:00')).toBeLessThan(markup.indexOf('08:00'));
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
    expect(completeSessionErrorMessage('session.not_found')).toBe('Сессия больше недоступна');
    expect(completeSessionErrorMessage('unknown')).toBe('Не удалось завершить сессию');
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

function createSession(
  id: string,
  lifeActionId: EntityId,
  startedAt = new Date('2026-08-02T08:00:00.000+09:00'),
): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt,
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

function completeSession(
  session: ActionSession,
  completionKind: 'completed' | 'interrupted' = 'completed',
): ActionSession {
  session.complete({
    completedAt: new Date(session.startedAt.getTime() + 300_000),
    completionKind,
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
      onOpenDecisionConfirmationForm: NOOP,
      onCloseDecisionConfirmationForm: NOOP,
      onDecisionActualResultChange: NOOP,
      onDecisionConfirmationSubmit: NOOP,
      onOpenDecisionEditForm: NOOP,
      onCloseDecisionEditForm: NOOP,
      onDecisionEditTitleChange: NOOP,
      onDecisionEditExpectedResultChange: NOOP,
      onDecisionEditSubmit: NOOP,
      onOpenDecisionCancellation: NOOP,
      onCloseDecisionCancellation: NOOP,
      onConfirmDecisionCancellation: NOOP,
      onOpenLifeAction: NOOP,
      onBackToDecision: NOOP,
      onRetryLifeAction: NOOP,
      onStartSession: NOOP,
      onPauseSession: NOOP,
      onResumeSession: NOOP,
      onOpenSessionCompletionForm: NOOP,
      onCloseSessionCompletionForm: NOOP,
      onSessionResultNoteChange: NOOP,
      onSessionCompletionKindChange: NOOP,
      onActionCompletionChoiceChange: NOOP,
      onActionActualResultChange: NOOP,
      onCompleteSession: NOOP,
      onRetryLifeActionCompletion: NOOP,
      onOpenLifeActionEditForm: NOOP,
      onCloseLifeActionEditForm: NOOP,
      onLifeActionEditTitleChange: NOOP,
      onLifeActionEditDescriptionChange: NOOP,
      onLifeActionEditExpectedResultChange: NOOP,
      onLifeActionEditSubmit: NOOP,
      onOpenLifeActionCancellation: NOOP,
      onCloseLifeActionCancellation: NOOP,
      onConfirmLifeActionCancellation: NOOP,
    }),
  );
}
