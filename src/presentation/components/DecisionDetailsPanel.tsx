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
import type { DecisionDetailsState, LifeActionFormState } from '../pages/TodayPageState';
import { isLifeActionActivationKey } from '../pages/TodayPageState';

interface DecisionDetailsPanelProps {
  readonly details: DecisionDetailsState;
  readonly isFormOpen: boolean;
  readonly isSaving: boolean;
  readonly form: LifeActionFormState;
  readonly formError: string | null;
  readonly isConfirmationFormOpen: boolean;
  readonly isConfirming: boolean;
  readonly confirmationActualResult: string;
  readonly confirmationError: string | null;
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
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
}

export function DecisionDetailsPanel({
  details,
  isFormOpen,
  isSaving,
  form,
  formError,
  isConfirmationFormOpen,
  isConfirming,
  confirmationActualResult,
  confirmationError,
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
                details.decision.isArchived() ||
                (details.decision.status !== DECISION_STATUS.draft &&
                  details.decision.status !== DECISION_STATUS.planned &&
                  details.decision.status !== DECISION_STATUS.inProgress) ? null : (
                  <button className="primary-button" type="button" onClick={onOpenForm}>
                    Создать действие
                  </button>
                )}
              </div>

              {isFormOpen ? (
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

interface DecisionConfirmationFormProps {
  readonly actualResult: string;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onActualResultChange: (actualResult: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
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
