import type { ChangeEvent, FormEvent } from 'react';
import type { DecisionActionOverview } from '../../application';
import {
  ACTION_SESSION_STATUS,
  DECISION_KIND,
  DECISION_PRIORITY,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type DayDate,
  type DecisionKind,
  type DecisionPriority,
  type DecisionStatus,
  type LifeAction,
  type LifeActionStatus,
} from '../../domain';
import type {
  DecisionDetailsState,
  DecisionEditFormState,
  DecisionEditTextField,
  DecisionRescheduleFormState,
  LifeActionFormState,
} from '../pages/TodayPageState';
import { isLifeActionActivationKey } from '../pages/TodayPageState';
import {
  createDecisionOverviewPresentation,
  decisionOutcomeLabel,
  type DecisionActionPresentation,
} from '../decisionOverviewPresentation';
import { decisionPriorityLabel } from '../entityPresentation';
import { formatHistoryDuration } from '../historyPresentation';

interface DecisionDetailsPanelProps {
  readonly details: DecisionDetailsState;
  readonly currentDate: DayDate;
  readonly readOnly: boolean;
  readonly now: Date;
  readonly isFormOpen: boolean;
  readonly isSaving: boolean;
  readonly form: LifeActionFormState;
  readonly formError: string | null;
  readonly isConfirmationFormOpen: boolean;
  readonly isConfirming: boolean;
  readonly confirmationActualResult: string;
  readonly confirmationError: string | null;
  readonly isEditFormOpen: boolean;
  readonly isEditing: boolean;
  readonly editForm: DecisionEditFormState;
  readonly editError: string | null;
  readonly isCancellationOpen: boolean;
  readonly isCancelling: boolean;
  readonly cancellationError: string | null;
  readonly isRescheduleFormOpen: boolean;
  readonly isRescheduling: boolean;
  readonly rescheduleForm: DecisionRescheduleFormState;
  readonly rescheduleError: string | null;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onOpenForm: () => void;
  readonly onCloseForm: () => void;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onDescriptionChange: (description: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenConfirmationForm: () => void;
  readonly onCloseConfirmationForm: () => void;
  readonly onConfirmationActualResultChange: (actualResult: string) => void;
  readonly onConfirmationSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenEditForm: () => void;
  readonly onCloseEditForm: () => void;
  readonly onEditTextChange: (field: DecisionEditTextField, value: string) => void;
  readonly onEditKindChange: (kind: DecisionKind) => void;
  readonly onEditPriorityChange: (priority: DecisionPriority) => void;
  readonly onEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenCancellation: () => void;
  readonly onCloseCancellation: () => void;
  readonly onConfirmCancellation: () => void;
  readonly onOpenRescheduleForm: () => void;
  readonly onCloseRescheduleForm: () => void;
  readonly onRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onRescheduleReasonChange: (reason: string) => void;
  readonly onRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
}

export function DecisionDetailsPanel({
  details,
  currentDate,
  readOnly,
  now,
  isFormOpen,
  isSaving,
  form,
  formError,
  isConfirmationFormOpen,
  isConfirming,
  confirmationActualResult,
  confirmationError,
  isEditFormOpen,
  isEditing,
  editForm,
  editError,
  isCancellationOpen,
  isCancelling,
  cancellationError,
  isRescheduleFormOpen,
  isRescheduling,
  rescheduleForm,
  rescheduleError,
  onClose,
  onRetry,
  onOpenForm,
  onCloseForm,
  onTitleChange,
  onExpectedResultChange,
  onDescriptionChange,
  onSubmit,
  onOpenConfirmationForm,
  onCloseConfirmationForm,
  onConfirmationActualResultChange,
  onConfirmationSubmit,
  onOpenEditForm,
  onCloseEditForm,
  onEditTextChange,
  onEditKindChange,
  onEditPriorityChange,
  onEditSubmit,
  onOpenCancellation,
  onCloseCancellation,
  onConfirmCancellation,
  onOpenRescheduleForm,
  onCloseRescheduleForm,
  onRescheduleDateChange,
  onRescheduleReasonChange,
  onRescheduleSubmit,
  onOpenLifeAction,
}: DecisionDetailsPanelProps) {
  if (details.status === 'closed') {
    return null;
  }

  const lifeActions = details.status === 'ready' ? details.lifeActions : [];
  const actionOverviews: readonly DecisionActionOverview[] =
    details.status === 'ready'
      ? (details.actionOverviews ?? lifeActions.map((lifeAction) => ({ lifeAction, sessions: [] })))
      : [];
  const overview =
    details.status === 'ready'
      ? createDecisionOverviewPresentation(
          { decision: details.decision, actions: actionOverviews },
          now,
        )
      : null;
  const completedActions = lifeActions.filter(
    (lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.completed,
  );
  const unfinishedActions = lifeActions.filter(
    (lifeAction) =>
      lifeAction.status === LIFE_ACTION_STATUS.draft ||
      lifeAction.status === LIFE_ACTION_STATUS.ready ||
      lifeAction.status === LIFE_ACTION_STATUS.inProgress,
  );
  const cancelledActions = lifeActions.filter(
    (lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.cancelled,
  );
  const movableActions = lifeActions.filter(
    (lifeAction) =>
      lifeAction.status === LIFE_ACTION_STATUS.ready ||
      lifeAction.status === LIFE_ACTION_STATUS.inProgress,
  );
  const draftActions = lifeActions.filter(
    (lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.draft,
  );
  const hasBlockingSession = actionOverviews.some((entry) =>
    entry.sessions.some(
      (session) =>
        session.status === ACTION_SESSION_STATUS.running ||
        session.status === ACTION_SESSION_STATUS.paused,
    ),
  );

  return (
    <div className="decision-details-backdrop">
      <aside
        className="decision-details-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-details-title"
      >
        <button
          className="decision-details-close"
          type="button"
          aria-label="Закрыть карточку решения"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>

        {details.status === 'loading' ? (
          <p className="details-message" role="status">
            Загружаем решение…
          </p>
        ) : null}

        {details.status === 'error' ? (
          <section className="details-message details-error" role="alert">
            <h2 id="decision-details-title">Не удалось открыть решение</h2>
            <button className="secondary-button" type="button" onClick={onRetry}>
              Повторить
            </button>
          </section>
        ) : null}

        {details.status === 'ready' ? (
          <div className="decision-details-content">
            <header className="decision-details-header">
              <p className="section-kicker gold">
                {details.decision.kind === DECISION_KIND.main
                  ? 'Главное решение'
                  : 'Дополнительное решение'}
              </p>
              <h2 id="decision-details-title">{details.decision.title.toString()}</h2>
            </header>

            {details.decision.isDeleted() ? (
              <section className="decision-deleted-banner" role="status">
                <strong>Решение находится в корзине</strong>
                <span>Удалено: {formatDateTime(details.decision.deletedAt!)}</span>
                <p>Связанные действия, сессии и результаты сохранены без изменений.</p>
              </section>
            ) : null}

            {overview === null ? null : (
              <section className="decision-overview" aria-label="Сводка решения">
                <dl className="decision-overview-metrics">
                  <div>
                    <dt>Связанных действий</dt>
                    <dd>{overview.actionCount}</dd>
                  </div>
                  <div>
                    <dt>Завершено действий</dt>
                    <dd>{overview.completedActionCount}</dd>
                  </div>
                  <div>
                    <dt>Рабочих сессий</dt>
                    <dd>{overview.sessionCount}</dd>
                  </div>
                  <div>
                    <dt>Затрачено времени</dt>
                    <dd>{formatHistoryDuration(overview.workedDurationMs)}</dd>
                  </div>
                </dl>

                <dl className="decision-details-list">
                  <div>
                    <dt>Статус</dt>
                    <dd>{decisionStatusLabel(details.decision.status)}</dd>
                  </div>
                  <div>
                    <dt>Дата решения</dt>
                    <dd>{formatPlannedDate(details.decision.plannedDate)}</dd>
                  </div>
                  <div>
                    <dt>Причина</dt>
                    <dd>{details.decision.reason ?? 'Не указана'}</dd>
                  </div>
                  <div>
                    <dt>Ожидаемый результат</dt>
                    <dd>{details.decision.expectedResult?.toString() ?? 'Не указан'}</dd>
                  </div>
                  <div>
                    <dt>Сфера</dt>
                    <dd>{details.decision.sphere ?? 'Не указана'}</dd>
                  </div>
                  <div>
                    <dt>Приоритет</dt>
                    <dd>{decisionPriorityLabel(details.decision.priority)}</dd>
                  </div>
                  <div>
                    <dt>Цена решения</dt>
                    <dd>{details.decision.price ?? 'Не указана'}</dd>
                  </div>
                  <div>
                    <dt>Жертвы</dt>
                    <dd>{details.decision.sacrifices ?? 'Не указаны'}</dd>
                  </div>
                  <div>
                    <dt>Связь с проектом</dt>
                    <dd>{details.decision.projectReference ?? 'Не указана'}</dd>
                  </div>
                  <div>
                    <dt>Создано</dt>
                    <dd>{formatDateTime(details.decision.createdAt)}</dd>
                  </div>
                  {details.decision.kind === DECISION_KIND.main ? (
                    <div>
                      <dt>Позиция среди главных</dt>
                      <dd>{details.decision.order ?? 'Не указана'}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Количество переносов</dt>
                    <dd>{details.decision.rescheduleCount}</dd>
                  </div>
                </dl>
              </section>
            )}

            {!details.decision.isArchived() &&
            !details.decision.isDeleted() &&
            (details.decision.status === DECISION_STATUS.planned ||
              details.decision.status === DECISION_STATUS.inProgress) ? (
              <section className="decision-management" aria-label="Управление решением">
                {isEditFormOpen ? (
                  <DecisionEditForm
                    decision={details.decision}
                    form={editForm}
                    isSaving={isEditing}
                    error={editError}
                    onTextChange={onEditTextChange}
                    onKindChange={onEditKindChange}
                    onPriorityChange={onEditPriorityChange}
                    onClose={onCloseEditForm}
                    onSubmit={onEditSubmit}
                  />
                ) : null}

                {isCancellationOpen ? (
                  <DecisionCancellationConfirmation
                    isSaving={isCancelling}
                    error={cancellationError}
                    onBack={onCloseCancellation}
                    onConfirm={onConfirmCancellation}
                  />
                ) : null}

                {isRescheduleFormOpen ? (
                  <DecisionRescheduleForm
                    decision={details.decision}
                    currentDate={currentDate}
                    lifeActions={lifeActions}
                    movableCount={movableActions.length}
                    draftCount={draftActions.length}
                    completedCount={completedActions.length}
                    cancelledCount={cancelledActions.length}
                    hasBlockingSession={hasBlockingSession}
                    form={rescheduleForm}
                    isSaving={isRescheduling}
                    error={rescheduleError}
                    onDateChange={onRescheduleDateChange}
                    onReasonChange={onRescheduleReasonChange}
                    onClose={onCloseRescheduleForm}
                    onSubmit={onRescheduleSubmit}
                  />
                ) : null}

                {!isEditFormOpen && !isCancellationOpen && !isRescheduleFormOpen ? (
                  <div className="decision-management-actions">
                    {readOnly ? null : (
                      <button className="secondary-button" type="button" onClick={onOpenEditForm}>
                        {details.decision.status === DECISION_STATUS.inProgress
                          ? 'Уточнить решение'
                          : 'Редактировать'}
                      </button>
                    )}
                    {details.decision.status === DECISION_STATUS.planned ||
                    details.decision.status === DECISION_STATUS.inProgress ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={onOpenRescheduleForm}
                      >
                        Перенести
                      </button>
                    ) : null}
                    <button
                      className="secondary-button decision-cancel-button"
                      type="button"
                      onClick={onOpenCancellation}
                    >
                      Отменить решение
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {details.decision.status === DECISION_STATUS.cancelled ? (
              <section className="cancelled-decision-result" role="status">
                <p>Решение отменено</p>
              </section>
            ) : null}

            <section className="decision-result-section" aria-labelledby="decision-result-title">
              <div className="section-heading decision-result-heading">
                <div>
                  <p className="section-kicker gold">Проверка результата</p>
                  <h3 id="decision-result-title">Результат решения</h3>
                </div>
              </div>

              <div className="decision-outcome-summary" role="status">
                <span>Зафиксированный итог</span>
                <strong>{decisionOutcomeLabel(details.decision)}</strong>
              </div>

              {completedActions.some((lifeAction) => lifeAction.actualResult !== null) ? (
                <div className="decision-action-results">
                  <h4>Фактические результаты действий</h4>
                  <ul>
                    {completedActions.map((lifeAction) =>
                      lifeAction.actualResult === null ? null : (
                        <li key={lifeAction.id.toString()}>
                          <strong>{lifeAction.title.toString()}</strong>
                          <span>{lifeAction.actualResult.toString()}</span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ) : null}

              <dl className="decision-action-totals">
                <div>
                  <dt>Завершено</dt>
                  <dd>{completedActions.length}</dd>
                </div>
                <div>
                  <dt>Не завершено</dt>
                  <dd>{unfinishedActions.length}</dd>
                </div>
                <div>
                  <dt>Отменено</dt>
                  <dd>{cancelledActions.length}</dd>
                </div>
              </dl>

              {details.decision.status === DECISION_STATUS.confirmed ? (
                <ConfirmedDecisionResult
                  decision={details.decision}
                  completedActions={completedActions}
                />
              ) : null}

              {(details.decision.status === DECISION_STATUS.planned ||
                details.decision.status === DECISION_STATUS.inProgress) &&
              !details.decision.isArchived() &&
              !details.decision.isDeleted() ? (
                <>
                  {unfinishedActions.length > 0 ? (
                    <p className="decision-confirmation-note">
                      Решение остаётся активным: завершите все текущие действия, прежде чем
                      подтверждать общий результат.
                    </p>
                  ) : completedActions.length === 0 ? (
                    <p className="decision-confirmation-note">
                      Решение остаётся активным: для подтверждения нужен хотя бы один проверенный
                      результат завершённого действия.
                    </p>
                  ) : (
                    <p
                      className="decision-confirmation-note decision-confirmation-ready"
                      role="status"
                    >
                      Все связанные действия обработаны. Результаты готовы стать подтверждением
                      решения после вашей итоговой проверки.
                    </p>
                  )}

                  {isConfirmationFormOpen ? (
                    <DecisionConfirmationForm
                      actualResult={confirmationActualResult}
                      isSaving={isConfirming}
                      error={confirmationError}
                      onActualResultChange={onConfirmationActualResultChange}
                      onClose={onCloseConfirmationForm}
                      onSubmit={onConfirmationSubmit}
                    />
                  ) : (
                    <button
                      className="primary-button decision-confirm-button"
                      type="button"
                      disabled={completedActions.length === 0 || unfinishedActions.length > 0}
                      onClick={onOpenConfirmationForm}
                    >
                      Подтвердить решение результатами действий
                    </button>
                  )}
                </>
              ) : null}
            </section>

            {overview === null ? null : (
              <section
                className="decision-lifecycle-section"
                aria-labelledby="decision-lifecycle-title"
              >
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Хронология</p>
                    <h3 id="decision-lifecycle-title">История состояния</h3>
                  </div>
                </div>
                <ol className="decision-lifecycle-list">
                  {overview.lifecycle.map((entry) => (
                    <li key={entry.key}>
                      <span className="decision-lifecycle-marker" aria-hidden="true" />
                      <div>
                        <strong>{entry.label}</strong>
                        <time dateTime={entry.occurredAt.toISOString()}>
                          {formatDateTime(entry.occurredAt)}
                        </time>
                        {entry.detail === null ? null : <p>{entry.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                {details.decision.rescheduleHistory.length > 0 ? (
                  <div className="decision-reschedule-history">
                    <h4>История переносов</h4>
                    <ol>
                      {details.decision.rescheduleHistory.map((entry) => (
                        <li key={`${entry.sequence}-${entry.occurredAt.toISOString()}`}>
                          <strong>Перенос №{entry.sequence}</strong>
                          <span>
                            {formatPlannedDate(entry.previousPlannedDate)} →{' '}
                            {formatPlannedDate(entry.newPlannedDate)}
                          </span>
                          <p>{entry.reason}</p>
                          <time dateTime={entry.occurredAt.toISOString()}>
                            {formatDateTime(entry.occurredAt)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : details.decision.rescheduleCount > 0 ? (
                  <p className="decision-lifecycle-note">
                    Переносов решения: {details.decision.rescheduleCount}. Старые записи были
                    созданы до появления подробной истории причин.
                  </p>
                ) : null}
              </section>
            )}

            <section className="linked-actions-section" aria-labelledby="linked-actions-title">
              <div className="section-heading linked-actions-heading">
                <div>
                  <p className="section-kicker">Следующий шаг</p>
                  <h3 id="linked-actions-title">Действия по решению</h3>
                </div>
                {isFormOpen ||
                readOnly ||
                details.decision.isArchived() ||
                details.decision.isDeleted() ||
                (details.decision.status !== DECISION_STATUS.draft &&
                  details.decision.status !== DECISION_STATUS.planned &&
                  details.decision.status !== DECISION_STATUS.inProgress) ? null : (
                  <button className="primary-button" type="button" onClick={onOpenForm}>
                    Создать действие
                  </button>
                )}
              </div>

              {isFormOpen && !readOnly ? (
                <LifeActionForm
                  form={form}
                  isSaving={isSaving}
                  error={formError}
                  onTitleChange={onTitleChange}
                  onExpectedResultChange={onExpectedResultChange}
                  onDescriptionChange={onDescriptionChange}
                  onClose={onCloseForm}
                  onSubmit={onSubmit}
                />
              ) : null}

              {overview === null || overview.actions.length === 0 ? (
                <p className="empty-linked-actions">Для этого решения пока нет действий</p>
              ) : (
                <div className="linked-actions-list">
                  {overview.actions.map((action) => (
                    <LifeActionSummary
                      key={action.lifeAction.id.toString()}
                      action={action}
                      onOpen={onOpenLifeAction}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

interface DecisionRescheduleFormProps {
  readonly decision: Extract<DecisionDetailsState, { readonly status: 'ready' }>['decision'];
  readonly currentDate: DayDate;
  readonly lifeActions: readonly LifeAction[];
  readonly movableCount: number;
  readonly draftCount: number;
  readonly completedCount: number;
  readonly cancelledCount: number;
  readonly hasBlockingSession: boolean;
  readonly form: DecisionRescheduleFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onDateChange: (newPlannedDate: string) => void;
  readonly onReasonChange: (reason: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function DecisionRescheduleForm({
  decision,
  currentDate,
  lifeActions,
  movableCount,
  draftCount,
  completedCount,
  cancelledCount,
  hasBlockingSession,
  form,
  isSaving,
  error,
  onDateChange,
  onReasonChange,
  onClose,
  onSubmit,
}: DecisionRescheduleFormProps) {
  return (
    <form className="decision-reschedule-form" onSubmit={onSubmit} noValidate>
      <h3>Перенос решения</h3>
      <p>
        Текущая дата решения: <strong>{formatPlannedDate(decision.plannedDate)}</strong>
      </p>
      {decision.kind === DECISION_KIND.main ? (
        <p>
          Текущая позиция: <strong>{decision.order}</strong>
        </p>
      ) : null}
      <label>
        <span>Новая дата</span>
        <input
          type="date"
          value={form.newPlannedDate}
          min={addDays(decision.plannedDate ?? currentDate, 1)}
          disabled={isSaving}
          aria-required="true"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onDateChange(event.target.value)}
        />
      </label>
      <div className="decision-reschedule-quick-options" aria-label="Быстрый выбор даты">
        <button
          className="secondary-button"
          type="button"
          disabled={isSaving}
          onClick={() => onDateChange(addDays(decision.plannedDate ?? currentDate, 1))}
        >
          Следующий день
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={isSaving}
          onClick={() => onDateChange(addDays(decision.plannedDate ?? currentDate, 7))}
        >
          Через неделю
        </button>
      </div>
      <label>
        <span>Причина переноса</span>
        <textarea
          value={form.reason}
          maxLength={500}
          rows={3}
          disabled={isSaving}
          aria-required="true"
          placeholder="Почему решение переносится и что изменится на новой дате"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onReasonChange(event.target.value)}
        />
        <small>{form.reason.trim().length} из 500 символов</small>
      </label>
      {decision.kind === DECISION_KIND.main ? (
        <p className="decision-reschedule-position-note">
          На новой дате решение займёт свободную позицию автоматически
        </p>
      ) : null}
      {lifeActions.length > 0 ? (
        <div className="decision-reschedule-actions-note">
          <p>Незавершённая работа переносится вместе с решением одной операцией</p>
          <dl>
            <div>
              <dt>Будет перенесено</dt>
              <dd>{movableCount}</dd>
            </div>
            <div>
              <dt>Черновики останутся связаны</dt>
              <dd>{draftCount}</dd>
            </div>
            <div>
              <dt>Завершено в истории</dt>
              <dd>{completedCount}</dd>
            </div>
            <div>
              <dt>Отменено</dt>
              <dd>{cancelledCount}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      {hasBlockingSession ? (
        <p className="decision-reschedule-blocked" role="alert">
          Сначала завершите активную или приостановленную рабочую сессию
        </p>
      ) : null}
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving || hasBlockingSession}>
          {isSaving ? 'Переносим…' : 'Перенести'}
        </button>
        <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

interface DecisionConfirmationFormProps {
  readonly actualResult: string;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onActualResultChange: (actualResult: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface DecisionEditFormProps {
  readonly decision: Extract<DecisionDetailsState, { readonly status: 'ready' }>['decision'];
  readonly form: DecisionEditFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onTextChange: (field: DecisionEditTextField, value: string) => void;
  readonly onKindChange: (kind: DecisionKind) => void;
  readonly onPriorityChange: (priority: DecisionPriority) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function DecisionEditForm({
  decision,
  form,
  isSaving,
  error,
  onTextChange,
  onKindChange,
  onPriorityChange,
  onClose,
  onSubmit,
}: DecisionEditFormProps) {
  const started = decision.status === DECISION_STATUS.inProgress;
  const kind = form.kind ?? decision.kind;
  const priority = form.priority ?? decision.priority;
  const titleError = error === 'Введите название решения' ? error : null;
  const expectedResultError = error === 'Укажите ожидаемый результат' ? error : null;
  const generalError = titleError !== null || expectedResultError !== null ? null : error;

  return (
    <form className="decision-edit-form" onSubmit={onSubmit} noValidate>
      <div className="decision-edit-form-heading">
        <div>
          <h3>{started ? 'Уточнение решения' : 'Редактирование решения'}</h3>
          <p>
            Дата решения: <strong>{formatPlannedDate(decision.plannedDate)}</strong>. Перенос
            выполняется отдельной командой.
          </p>
        </div>
        <span className="decision-edit-version">
          Версия {form.expectedVersion ?? decision.version}
        </span>
      </div>

      {started ? (
        <p className="decision-edit-policy-note" role="status">
          День уже начат. Формулировка, вид, сфера, приоритет и проект зафиксированы. Можно уточнить
          причину, ожидаемый результат, цену и жертвы.
        </p>
      ) : (
        <p className="decision-edit-policy-note">
          До начала дня можно изменить плановые сведения. Дата меняется только через перенос.
        </p>
      )}

      <div className="decision-edit-grid">
        <label>
          <span>Вид решения</span>
          <select
            value={kind}
            disabled={isSaving || started}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onKindChange(event.target.value as DecisionKind)
            }
          >
            <option value={DECISION_KIND.main}>Главное</option>
            <option value={DECISION_KIND.additional}>Дополнительное</option>
          </select>
        </label>

        <label>
          <span>Приоритет</span>
          <select
            value={priority}
            disabled={isSaving || started}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onPriorityChange(event.target.value as DecisionPriority)
            }
          >
            <option value={DECISION_PRIORITY.high}>Высокий</option>
            <option value={DECISION_PRIORITY.normal}>Обычный</option>
            <option value={DECISION_PRIORITY.low}>Низкий</option>
          </select>
        </label>
      </div>

      <label>
        <span>Формулировка решения *</span>
        <input
          value={form.title}
          disabled={isSaving || started}
          maxLength={200}
          aria-required="true"
          aria-invalid={titleError !== null}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onTextChange('title', event.target.value)
          }
        />
        {titleError === null ? null : <small className="field-error">{titleError}</small>}
      </label>

      <label>
        <span>Причина</span>
        <textarea
          value={form.reason ?? ''}
          disabled={isSaving}
          maxLength={1000}
          rows={3}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onTextChange('reason', event.target.value)
          }
        />
      </label>

      <label>
        <span>Ожидаемый результат{kind === DECISION_KIND.main ? ' *' : ''}</span>
        <textarea
          value={form.expectedResult}
          disabled={isSaving}
          maxLength={1000}
          rows={3}
          aria-required={kind === DECISION_KIND.main}
          aria-invalid={expectedResultError !== null}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onTextChange('expectedResult', event.target.value)
          }
        />
        {expectedResultError === null ? null : (
          <small className="field-error">{expectedResultError}</small>
        )}
      </label>

      <div className="decision-edit-grid">
        <label>
          <span>Сфера</span>
          <input
            value={form.sphere ?? ''}
            disabled={isSaving || started}
            maxLength={120}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onTextChange('sphere', event.target.value)
            }
          />
        </label>
        <label>
          <span>Связь с проектом</span>
          <input
            value={form.projectReference ?? ''}
            disabled={isSaving || started}
            maxLength={200}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onTextChange('projectReference', event.target.value)
            }
          />
        </label>
      </div>

      <label>
        <span>Цена решения</span>
        <textarea
          value={form.price ?? ''}
          disabled={isSaving}
          maxLength={500}
          rows={2}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onTextChange('price', event.target.value)
          }
        />
      </label>

      <label>
        <span>Жертвы</span>
        <textarea
          value={form.sacrifices ?? ''}
          disabled={isSaving}
          maxLength={1000}
          rows={3}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onTextChange('sacrifices', event.target.value)
          }
        />
      </label>

      {generalError === null ? null : (
        <p className="form-error" role="alert">
          {generalError}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
        <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

interface DecisionCancellationConfirmationProps {
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
}

function DecisionCancellationConfirmation({
  isSaving,
  error,
  onBack,
  onConfirm,
}: DecisionCancellationConfirmationProps) {
  return (
    <div className="decision-cancellation-confirmation">
      <h3>Отменить это решение?</h3>
      <p>Решение останется в истории, но продолжить работу по нему будет нельзя</p>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="secondary-button decision-cancel-button"
          type="button"
          disabled={isSaving}
          onClick={onConfirm}
        >
          {isSaving ? 'Отменяем…' : 'Отменить решение'}
        </button>
        <button className="secondary-button" type="button" disabled={isSaving} onClick={onBack}>
          Назад
        </button>
      </div>
    </div>
  );
}

function DecisionConfirmationForm({
  actualResult,
  isSaving,
  error,
  onActualResultChange,
  onClose,
  onSubmit,
}: DecisionConfirmationFormProps) {
  return (
    <form className="decision-confirmation-form" onSubmit={onSubmit} noValidate>
      <h4>Подтверждение решения</h4>
      <label>
        <span>Фактический результат решения *</span>
        <textarea
          value={actualResult}
          disabled={isSaving}
          maxLength={2000}
          rows={4}
          aria-required="true"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onActualResultChange(event.target.value)
          }
        />
      </label>
      <p className="decision-confirmation-help">
        Проверьте общий итог. Завершённые действия будут зафиксированы как доказательства результата
        решения.
      </p>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Подтверждаем…' : 'Подтвердить'}
        </button>
        <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function ConfirmedDecisionResult({
  decision,
  completedActions,
}: {
  readonly decision: Extract<DecisionDetailsState, { readonly status: 'ready' }>['decision'];
  readonly completedActions: readonly LifeAction[];
}) {
  return (
    <div className="confirmed-decision-result">
      <p className="confirmed-result-title">Решение подтверждено</p>
      <p className="confirmed-result-text">{decision.actualResultSummary?.toString()}</p>
      <dl>
        <div>
          <dt>Действий в подтверждении</dt>
          <dd>{decision.evidenceIds.length}</dd>
        </div>
        {decision.confirmedAt === null ? null : (
          <div>
            <dt>Подтверждено</dt>
            <dd>{formatDateTime(decision.confirmedAt)}</dd>
          </div>
        )}
      </dl>
      {completedActions.length === 0 ? null : (
        <div className="confirmed-actions">
          <p>Завершённые действия</p>
          <ul>
            {completedActions.map((lifeAction) => (
              <li key={lifeAction.id.toString()}>{lifeAction.title.toString()}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface LifeActionFormProps {
  readonly form: LifeActionFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onDescriptionChange: (description: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function LifeActionForm({
  form,
  isSaving,
  error,
  onTitleChange,
  onExpectedResultChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: LifeActionFormProps) {
  return (
    <form className="life-action-form" onSubmit={onSubmit} noValidate>
      <label>
        <span>Название действия *</span>
        <input
          value={form.title}
          disabled={isSaving}
          maxLength={200}
          aria-required="true"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onTitleChange(event.target.value)}
        />
      </label>
      <label>
        <span>Ожидаемый результат *</span>
        <textarea
          value={form.expectedResult}
          disabled={isSaving}
          maxLength={1000}
          rows={3}
          aria-required="true"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onExpectedResultChange(event.target.value)
          }
        />
      </label>
      <label>
        <span>Описание</span>
        <textarea
          value={form.description}
          disabled={isSaving}
          rows={3}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onDescriptionChange(event.target.value)
          }
        />
      </label>

      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Создаём…' : 'Создать'}
        </button>
        <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function LifeActionSummary({
  action,
  onOpen,
}: {
  readonly action: DecisionActionPresentation;
  readonly onOpen: (lifeAction: LifeAction) => void;
}) {
  const { lifeAction } = action;

  return (
    <button
      className="linked-action-card linked-action-card-button linked-action-overview-card"
      type="button"
      aria-label={`Открыть действие «${lifeAction.title.toString()}»`}
      onClick={() => onOpen(lifeAction)}
      onKeyDown={(event) => {
        if (isLifeActionActivationKey(event.key)) {
          event.preventDefault();
          onOpen(lifeAction);
        }
      }}
    >
      <div className="linked-action-card-heading">
        <h4>{lifeAction.title.toString()}</h4>
        <span className={`action-status action-status-${lifeAction.status}`}>
          {lifeActionStatusLabel(lifeAction.status)}
        </span>
      </div>
      <p>{lifeAction.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}</p>
      {lifeAction.actualResult === null ? null : (
        <p className="linked-action-actual-result">
          <strong>Фактический результат:</strong> {lifeAction.actualResult.toString()}
        </p>
      )}
      <dl className="linked-action-metrics">
        <div>
          <dt>Сессий</dt>
          <dd>{action.sessionCount}</dd>
        </div>
        <div>
          <dt>Завершено сессий</dt>
          <dd>{action.completedSessionCount}</dd>
        </div>
        <div>
          <dt>Время</dt>
          <dd>{formatHistoryDuration(action.workedDurationMs)}</dd>
        </div>
      </dl>
      <time>{formatPlannedDate(lifeAction.plannedDate)}</time>
      <span className="decision-open-hint" aria-hidden="true">
        Открыть <span>→</span>
      </span>
    </button>
  );
}

function decisionStatusLabel(status: DecisionStatus): string {
  switch (status) {
    case DECISION_STATUS.draft:
      return 'Черновик';
    case DECISION_STATUS.planned:
      return 'Запланировано';
    case DECISION_STATUS.inProgress:
      return 'Выполняется';
    case DECISION_STATUS.confirmed:
      return 'Подтверждено';
    case DECISION_STATUS.cancelled:
      return 'Отменено';
  }
}

function lifeActionStatusLabel(status: LifeActionStatus): string {
  switch (status) {
    case LIFE_ACTION_STATUS.draft:
      return 'Черновик';
    case LIFE_ACTION_STATUS.ready:
      return 'Готово к выполнению';
    case LIFE_ACTION_STATUS.inProgress:
      return 'Выполняется';
    case LIFE_ACTION_STATUS.completed:
      return 'Завершено';
    case LIFE_ACTION_STATUS.cancelled:
      return 'Отменено';
  }
}

function formatPlannedDate(date: DayDate | null): string {
  if (date === null) {
    return 'Не запланировано';
  }

  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function addDays(date: DayDate, days: number): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`;
}
