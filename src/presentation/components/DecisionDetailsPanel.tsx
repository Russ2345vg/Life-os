import type { ChangeEvent, FormEvent } from 'react';
import {
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type DayDate,
  type DecisionStatus,
  type LifeAction,
  type LifeActionStatus,
} from '../../domain';
import type {
  DecisionDetailsState,
  DecisionEditFormState,
  DecisionRescheduleFormState,
  LifeActionFormState,
} from '../pages/TodayPageState';
import { isLifeActionActivationKey } from '../pages/TodayPageState';

interface DecisionDetailsPanelProps {
  readonly details: DecisionDetailsState;
  readonly currentDate: DayDate;
  readonly readOnly: boolean;
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
  readonly onEditTitleChange: (title: string) => void;
  readonly onEditExpectedResultChange: (expectedResult: string) => void;
  readonly onEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenCancellation: () => void;
  readonly onCloseCancellation: () => void;
  readonly onConfirmCancellation: () => void;
  readonly onOpenRescheduleForm: () => void;
  readonly onCloseRescheduleForm: () => void;
  readonly onRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
}

export function DecisionDetailsPanel({
  details,
  currentDate,
  readOnly,
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
  onEditTitleChange,
  onEditExpectedResultChange,
  onEditSubmit,
  onOpenCancellation,
  onCloseCancellation,
  onConfirmCancellation,
  onOpenRescheduleForm,
  onCloseRescheduleForm,
  onRescheduleDateChange,
  onRescheduleSubmit,
  onOpenLifeAction,
}: DecisionDetailsPanelProps) {
  if (details.status === 'closed') {
    return null;
  }

  const lifeActions = details.status === 'ready' ? details.lifeActions : [];
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
  const readyActions = lifeActions.filter(
    (lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.ready,
  );
  const rescheduleBlockingActions = lifeActions.filter(
    (lifeAction) =>
      lifeAction.status === LIFE_ACTION_STATUS.draft ||
      lifeAction.status === LIFE_ACTION_STATUS.inProgress,
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

            <dl className="decision-details-list">
              <div>
                <dt>Ожидаемый результат</dt>
                <dd>{details.decision.expectedResult?.toString() ?? 'Не указан'}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>{decisionStatusLabel(details.decision.status)}</dd>
              </div>
              <div>
                <dt>Запланировано</dt>
                <dd>{formatPlannedDate(details.decision.plannedDate)}</dd>
              </div>
              {details.decision.kind === DECISION_KIND.main ? (
                <div>
                  <dt>Позиция</dt>
                  <dd>{details.decision.order ?? 'Не указана'}</dd>
                </div>
              ) : null}
            </dl>

            {!details.decision.isArchived() &&
            (details.decision.status === DECISION_STATUS.planned ||
              details.decision.status === DECISION_STATUS.inProgress) ? (
              <section className="decision-management" aria-label="Управление решением">
                {isEditFormOpen ? (
                  <DecisionEditForm
                    form={editForm}
                    isSaving={isEditing}
                    error={editError}
                    isExpectedResultRequired={details.decision.kind === DECISION_KIND.main}
                    onTitleChange={onEditTitleChange}
                    onExpectedResultChange={onEditExpectedResultChange}
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
                    readyCount={readyActions.length}
                    completedCount={completedActions.length}
                    cancelledCount={cancelledActions.length}
                    hasBlockingActions={rescheduleBlockingActions.length > 0}
                    form={rescheduleForm}
                    isSaving={isRescheduling}
                    error={rescheduleError}
                    onDateChange={onRescheduleDateChange}
                    onClose={onCloseRescheduleForm}
                    onSubmit={onRescheduleSubmit}
                  />
                ) : null}

                {!isEditFormOpen && !isCancellationOpen && !isRescheduleFormOpen ? (
                  <div className="decision-management-actions">
                    {details.decision.status === DECISION_STATUS.planned ? (
                      <>
                        {readOnly ? null : (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={onOpenEditForm}
                          >
                            Редактировать
                          </button>
                        )}
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={onOpenRescheduleForm}
                        >
                          Перенести
                        </button>
                      </>
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
              !details.decision.isArchived() ? (
                <>
                  {unfinishedActions.length > 0 ? (
                    <p className="decision-confirmation-note">Сначала завершите текущие действия</p>
                  ) : completedActions.length === 0 ? (
                    <p className="decision-confirmation-note">
                      Чтобы подтвердить решение, завершите хотя бы одно действие
                    </p>
                  ) : null}

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
                      Подтвердить результат решения
                    </button>
                  )}
                </>
              ) : null}
            </section>

            <section className="linked-actions-section" aria-labelledby="linked-actions-title">
              <div className="section-heading linked-actions-heading">
                <div>
                  <p className="section-kicker">Следующий шаг</p>
                  <h3 id="linked-actions-title">Действия по решению</h3>
                </div>
                {isFormOpen ||
                readOnly ||
                details.decision.isArchived() ||
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

              {details.lifeActions.length === 0 ? (
                <p className="empty-linked-actions">Для этого решения пока нет действий</p>
              ) : (
                <div className="linked-actions-list">
                  {details.lifeActions.map((lifeAction) => (
                    <LifeActionSummary
                      key={lifeAction.id.toString()}
                      lifeAction={lifeAction}
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
  readonly readyCount: number;
  readonly completedCount: number;
  readonly cancelledCount: number;
  readonly hasBlockingActions: boolean;
  readonly form: DecisionRescheduleFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onDateChange: (newPlannedDate: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function DecisionRescheduleForm({
  decision,
  currentDate,
  lifeActions,
  readyCount,
  completedCount,
  cancelledCount,
  hasBlockingActions,
  form,
  isSaving,
  error,
  onDateChange,
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
          min={currentDate.toString()}
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
          onClick={() => onDateChange(addDays(currentDate, 1))}
        >
          Завтра
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={isSaving}
          onClick={() => onDateChange(addDays(currentDate, 7))}
        >
          Через неделю
        </button>
      </div>
      {decision.kind === DECISION_KIND.main ? (
        <p className="decision-reschedule-position-note">
          На новой дате решение займёт свободную позицию автоматически
        </p>
      ) : null}
      {lifeActions.length > 0 ? (
        <div className="decision-reschedule-actions-note">
          <p>Связанные действия сохранят свои текущие даты</p>
          <dl>
            <div>
              <dt>Готово</dt>
              <dd>{readyCount}</dd>
            </div>
            <div>
              <dt>Завершено</dt>
              <dd>{completedCount}</dd>
            </div>
            <div>
              <dt>Отменено</dt>
              <dd>{cancelledCount}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      {hasBlockingActions ? (
        <p className="decision-reschedule-blocked" role="alert">
          Сначала завершите настройку или выполнение связанных действий
        </p>
      ) : null}
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving || hasBlockingActions}>
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
  readonly form: DecisionEditFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly isExpectedResultRequired: boolean;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function DecisionEditForm({
  form,
  isSaving,
  error,
  isExpectedResultRequired,
  onTitleChange,
  onExpectedResultChange,
  onClose,
  onSubmit,
}: DecisionEditFormProps) {
  return (
    <form className="decision-edit-form" onSubmit={onSubmit} noValidate>
      <h3>Редактирование решения</h3>
      <label>
        <span>Название решения *</span>
        <input
          value={form.title}
          disabled={isSaving}
          maxLength={200}
          aria-required="true"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onTitleChange(event.target.value)}
        />
      </label>
      <label>
        <span>Ожидаемый результат{isExpectedResultRequired ? ' *' : ''}</span>
        <textarea
          value={form.expectedResult}
          disabled={isSaving}
          maxLength={1000}
          rows={3}
          aria-required={isExpectedResultRequired}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onExpectedResultChange(event.target.value)
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
        Завершённые действия будут использованы как подтверждение результата
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
  lifeAction,
  onOpen,
}: {
  readonly lifeAction: LifeAction;
  readonly onOpen: (lifeAction: LifeAction) => void;
}) {
  return (
    <button
      className="linked-action-card linked-action-card-button"
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
