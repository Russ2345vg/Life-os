import { useEffect, useState, type FormEvent } from 'react';
import type { Clock, SpheresSnapshot } from '../../application';
import {
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type ActionSession,
  type DayDate,
  type LifeActionStatus,
  type Project,
  type SessionCompletionKind,
} from '../../domain';
import {
  ACTION_COMPLETION_CHOICE,
  type ActionCompletionChoice,
  type LifeActionDetailsState,
  type LifeActionEditFormState,
  type LifeActionRescheduleFormState,
  type SessionCompletionFormState,
} from '../pages/TodayPageState';
import { ActionSessionOverviewPanel } from './ActionSessionOverviewPanel';
import { SphereBadge, SphereSelect } from './SphereReference';
import {
  formatDuration,
  resolveSafeSessionNow,
  scheduleSessionTimer,
} from '../session/sessionTimer';

interface LifeActionDetailsPanelProps {
  readonly details: LifeActionDetailsState;
  readonly currentDate: DayDate;
  readonly readOnly: boolean;
  readonly spheres: SpheresSnapshot;
  readonly sessionRecoveryMode?: boolean;
  readonly decisionTitle: string | null;
  readonly decisionPlannedDate: DayDate | null;
  readonly project?: Project | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly isCompletionFormOpen: boolean;
  readonly completionForm: SessionCompletionFormState;
  readonly hasPendingActionCompletion: boolean;
  readonly backLabel?: string;
  readonly onClose: () => void;
  readonly onBack: () => void;
  readonly onRetry: () => void;
  readonly onOpenProject?: (projectId: string) => void;
  readonly onStart: () => void;
  readonly onPause: (session: ActionSession) => void;
  readonly onResume: (session: ActionSession) => void;
  readonly onOpenCompletionForm: () => void;
  readonly onCloseCompletionForm: () => void;
  readonly onResultNoteChange: (resultNote: string) => void;
  readonly onCompletionKindChange: (completionKind: SessionCompletionKind) => void;
  readonly onActionChoiceChange: (choice: ActionCompletionChoice) => void;
  readonly onActualResultChange: (actualResult: string) => void;
  readonly onComplete: (session: ActionSession) => void;
  readonly onRetryActionCompletion: () => void;
  readonly isEditFormOpen: boolean;
  readonly isEditing: boolean;
  readonly editForm: LifeActionEditFormState;
  readonly editError: string | null;
  readonly isCancellationOpen: boolean;
  readonly isCancelling: boolean;
  readonly cancellationError: string | null;
  readonly onOpenEditForm: () => void;
  readonly onCloseEditForm: () => void;
  readonly onEditTitleChange: (title: string) => void;
  readonly onEditDescriptionChange: (description: string) => void;
  readonly onEditExpectedResultChange: (expectedResult: string) => void;
  readonly onEditSphereChange: (sphereId: string) => void;
  readonly onEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenCancellation: () => void;
  readonly onCloseCancellation: () => void;
  readonly onConfirmCancellation: () => void;
  readonly isRescheduleFormOpen: boolean;
  readonly isRescheduling: boolean;
  readonly rescheduleForm: LifeActionRescheduleFormState;
  readonly rescheduleError: string | null;
  readonly onOpenRescheduleForm: () => void;
  readonly onCloseRescheduleForm: () => void;
  readonly onRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LifeActionDetailsPanel({
  details,
  currentDate,
  readOnly,
  spheres,
  sessionRecoveryMode = false,
  decisionTitle,
  decisionPlannedDate,
  project = null,
  clock,
  isMutating,
  error,
  isCompletionFormOpen,
  completionForm,
  hasPendingActionCompletion,
  backLabel = 'Назад к решению',
  onClose,
  onBack,
  onRetry,
  onOpenProject = () => undefined,
  onStart,
  onPause,
  onResume,
  onOpenCompletionForm,
  onCloseCompletionForm,
  onResultNoteChange,
  onCompletionKindChange,
  onActionChoiceChange,
  onActualResultChange,
  onComplete,
  onRetryActionCompletion,
  isEditFormOpen,
  isEditing,
  editForm,
  editError,
  isCancellationOpen,
  isCancelling,
  cancellationError,
  onOpenEditForm,
  onCloseEditForm,
  onEditTitleChange,
  onEditDescriptionChange,
  onEditExpectedResultChange,
  onEditSphereChange,
  onEditSubmit,
  onOpenCancellation,
  onCloseCancellation,
  onConfirmCancellation,
  isRescheduleFormOpen,
  isRescheduling,
  rescheduleForm,
  rescheduleError,
  onOpenRescheduleForm,
  onCloseRescheduleForm,
  onRescheduleDateChange,
  onRescheduleSubmit,
}: LifeActionDetailsPanelProps) {
  const timerNow = useSessionTimer(details, clock);

  if (details.status === 'closed') {
    return null;
  }

  return (
    <div className="decision-details-backdrop">
      <aside
        className="decision-details-panel life-action-details-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="life-action-details-title"
      >
        <div className="life-action-panel-navigation">
          <button className="back-button" type="button" onClick={onBack}>
            <span aria-hidden="true">←</span> {backLabel}
          </button>
          <button
            className="decision-details-close"
            type="button"
            aria-label="Закрыть карточку действия"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {details.status === 'loading' ? (
          <p className="details-message" role="status">
            Загружаем выполнение…
          </p>
        ) : null}

        {details.status === 'error' ? (
          <section className="details-message details-error" role="alert">
            <h2 id="life-action-details-title">Не удалось загрузить выполнение</h2>
            <button className="secondary-button" type="button" onClick={onRetry}>
              Повторить
            </button>
          </section>
        ) : null}

        {details.status === 'ready' ? (
          <div className="decision-details-content life-action-details-content">
            <header className="decision-details-header life-action-details-header">
              <p className="section-kicker action-kicker">Действие</p>
              <h2 id="life-action-details-title">{details.lifeAction.title.toString()}</h2>
              <span className={`action-status action-status-${details.lifeAction.status}`}>
                {lifeActionStatusLabel(details.lifeAction.status)}
              </span>
            </header>

            <dl className="decision-details-list action-details-list">
              {details.lifeAction.description === null ? null : (
                <div>
                  <dt>Описание</dt>
                  <dd>{details.lifeAction.description}</dd>
                </div>
              )}
              <div>
                <dt>Ожидаемый результат</dt>
                <dd>{details.lifeAction.expectedResult?.toString() ?? 'Не указан'}</dd>
              </div>
              <div>
                <dt>Запланировано</dt>
                <dd>{formatPlannedDate(details.lifeAction.plannedDate)}</dd>
              </div>
              <div>
                <dt>Связь</dt>
                <dd>
                  {decisionTitle === null ? 'Без связанного решения' : `Решение «${decisionTitle}»`}
                </dd>
              </div>
              <ActionProjectReference project={project} onOpenProject={onOpenProject} />
              <div>
                <dt>Сфера</dt>
                <dd>
                  <SphereBadge
                    sphereId={details.lifeAction.sphereId?.toString() ?? null}
                    snapshot={spheres}
                  />
                </dd>
              </div>
            </dl>

            {readOnly ? (
              <p className="life-action-read-only-note" role="status">
                {sessionRecoveryMode
                  ? 'Прошлый день остаётся только для просмотра. Разрешено лишь завершить незавершённую рабочую сессию.'
                  : 'Прошедший день доступен только для просмотра'}
              </p>
            ) : null}

            <LifeActionManagement
              details={details}
              readOnly={readOnly}
              isEditFormOpen={isEditFormOpen}
              isEditing={isEditing}
              editForm={editForm}
              spheres={spheres}
              editError={editError}
              isCancellationOpen={isCancellationOpen}
              isCancelling={isCancelling}
              isSessionMutating={isMutating}
              cancellationError={cancellationError}
              currentDate={currentDate}
              decisionPlannedDate={decisionPlannedDate}
              isRescheduleFormOpen={isRescheduleFormOpen}
              isRescheduling={isRescheduling}
              rescheduleForm={rescheduleForm}
              rescheduleError={rescheduleError}
              onOpenEditForm={onOpenEditForm}
              onCloseEditForm={onCloseEditForm}
              onEditTitleChange={onEditTitleChange}
              onEditDescriptionChange={onEditDescriptionChange}
              onEditExpectedResultChange={onEditExpectedResultChange}
              onEditSphereChange={onEditSphereChange}
              onEditSubmit={onEditSubmit}
              onOpenCancellation={onOpenCancellation}
              onCloseCancellation={onCloseCancellation}
              onConfirmCancellation={onConfirmCancellation}
              onOpenRescheduleForm={onOpenRescheduleForm}
              onCloseRescheduleForm={onCloseRescheduleForm}
              onRescheduleDateChange={onRescheduleDateChange}
              onRescheduleSubmit={onRescheduleSubmit}
            />

            {details.lifeAction.status === LIFE_ACTION_STATUS.completed ? (
              <CompletedActionSummary details={details} />
            ) : details.lifeAction.status === LIFE_ACTION_STATUS.cancelled ? (
              <CancelledActionSummary details={details} />
            ) : readOnly &&
              !(
                sessionRecoveryMode &&
                details.unfinishedSession !== null &&
                details.unfinishedSession.lifeActionId.equals(details.lifeAction.id)
              ) ? null : (
              <SessionControls
                details={details}
                now={timerNow}
                isMutating={
                  isMutating ||
                  isEditFormOpen ||
                  isEditing ||
                  isCancellationOpen ||
                  isCancelling ||
                  isRescheduleFormOpen ||
                  isRescheduling
                }
                error={error}
                isCompletionFormOpen={isCompletionFormOpen}
                completionForm={completionForm}
                hasPendingActionCompletion={hasPendingActionCompletion}
                onStart={onStart}
                onPause={onPause}
                onResume={onResume}
                onOpenCompletionForm={onOpenCompletionForm}
                onCloseCompletionForm={onCloseCompletionForm}
                onResultNoteChange={onResultNoteChange}
                onCompletionKindChange={onCompletionKindChange}
                onActionChoiceChange={onActionChoiceChange}
                onActualResultChange={onActualResultChange}
                onComplete={onComplete}
                onRetryActionCompletion={onRetryActionCompletion}
              />
            )}

            <ActionSessionOverviewPanel sessions={details.sessions} now={timerNow} />
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function ActionProjectReference(props: {
  readonly project: Project | null;
  readonly onOpenProject: (projectId: string) => void;
}) {
  const project = props.project;
  if (project === null) return null;
  return (
    <div>
      <dt>Проект</dt>
      <dd>
        <button
          className="action-project-link"
          type="button"
          onClick={() => props.onOpenProject(project.id.toString())}
        >
          {project.title} →
        </button>
      </dd>
    </div>
  );
}

function LifeActionManagement({
  details,
  readOnly,
  isEditFormOpen,
  isEditing,
  editForm,
  spheres,
  editError,
  isCancellationOpen,
  isCancelling,
  isSessionMutating,
  cancellationError,
  currentDate,
  decisionPlannedDate,
  isRescheduleFormOpen,
  isRescheduling,
  rescheduleForm,
  rescheduleError,
  onOpenEditForm,
  onCloseEditForm,
  onEditTitleChange,
  onEditDescriptionChange,
  onEditExpectedResultChange,
  onEditSphereChange,
  onEditSubmit,
  onOpenCancellation,
  onCloseCancellation,
  onConfirmCancellation,
  onOpenRescheduleForm,
  onCloseRescheduleForm,
  onRescheduleDateChange,
  onRescheduleSubmit,
}: {
  readonly details: Extract<LifeActionDetailsState, { readonly status: 'ready' }>;
  readonly readOnly: boolean;
  readonly isEditFormOpen: boolean;
  readonly isEditing: boolean;
  readonly editForm: LifeActionEditFormState;
  readonly spheres: SpheresSnapshot;
  readonly editError: string | null;
  readonly isCancellationOpen: boolean;
  readonly isCancelling: boolean;
  readonly isSessionMutating: boolean;
  readonly cancellationError: string | null;
  readonly currentDate: DayDate;
  readonly decisionPlannedDate: DayDate | null;
  readonly isRescheduleFormOpen: boolean;
  readonly isRescheduling: boolean;
  readonly rescheduleForm: LifeActionRescheduleFormState;
  readonly rescheduleError: string | null;
  readonly onOpenEditForm: () => void;
  readonly onCloseEditForm: () => void;
  readonly onEditTitleChange: (title: string) => void;
  readonly onEditDescriptionChange: (description: string) => void;
  readonly onEditExpectedResultChange: (expectedResult: string) => void;
  readonly onEditSphereChange: (sphereId: string) => void;
  readonly onEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenCancellation: () => void;
  readonly onCloseCancellation: () => void;
  readonly onConfirmCancellation: () => void;
  readonly onOpenRescheduleForm: () => void;
  readonly onCloseRescheduleForm: () => void;
  readonly onRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const canEdit = details.lifeAction.status === LIFE_ACTION_STATUS.ready;
  const canCancel =
    details.lifeAction.status === LIFE_ACTION_STATUS.ready ||
    details.lifeAction.status === LIFE_ACTION_STATUS.inProgress;

  if (readOnly || (!canEdit && !canCancel)) {
    return null;
  }

  return (
    <section className="life-action-management" aria-label="Управление действием">
      {!isEditFormOpen && !isCancellationOpen && !isRescheduleFormOpen ? (
        <div className="life-action-management-actions">
          {canEdit ? (
            <button
              className="secondary-button"
              type="button"
              disabled={isSessionMutating}
              onClick={onOpenEditForm}
            >
              Редактировать
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="secondary-button"
              type="button"
              disabled={isSessionMutating}
              onClick={onOpenRescheduleForm}
            >
              Перенести
            </button>
          ) : null}
          {canCancel ? (
            <button
              className="secondary-button life-action-cancel-button"
              type="button"
              disabled={isSessionMutating}
              onClick={onOpenCancellation}
            >
              Отменить действие
            </button>
          ) : null}
        </div>
      ) : null}

      {isRescheduleFormOpen ? (
        <form className="life-action-reschedule-form" onSubmit={onRescheduleSubmit} noValidate>
          <h3>Перенос действия</h3>
          <p className="life-action-current-date">
            Текущая дата действия:{' '}
            <strong>{formatPlannedDate(details.lifeAction.plannedDate)}</strong>
          </p>
          <label>
            <span>Новая дата</span>
            <input
              type="date"
              value={rescheduleForm.newPlannedDate}
              min={currentDate.toString()}
              disabled={isRescheduling}
              aria-required="true"
              onChange={(event) => onRescheduleDateChange(event.target.value)}
            />
          </label>
          <div className="life-action-reschedule-quick-options" aria-label="Быстрый выбор даты">
            <button
              className="secondary-button"
              type="button"
              disabled={isRescheduling}
              onClick={() => onRescheduleDateChange(addDays(currentDate, 1))}
            >
              Завтра
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isRescheduling}
              onClick={() => onRescheduleDateChange(addDays(currentDate, 7))}
            >
              Через неделю
            </button>
          </div>
          {decisionPlannedDate !== null &&
          rescheduleForm.newPlannedDate.length > 0 &&
          rescheduleForm.newPlannedDate !== decisionPlannedDate.toString() ? (
            <p className="life-action-date-warning" role="status">
              Дата действия будет отличаться от даты решения
            </p>
          ) : null}
          {rescheduleError === null ? null : (
            <p className="form-error" role="alert">
              {rescheduleError}
            </p>
          )}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={isRescheduling}>
              {isRescheduling ? 'Переносим…' : 'Перенести'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isRescheduling}
              onClick={onCloseRescheduleForm}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}

      {isEditFormOpen ? (
        <form className="life-action-edit-form" onSubmit={onEditSubmit} noValidate>
          <h3>Редактирование действия</h3>
          <label>
            <span>Название действия *</span>
            <input
              value={editForm.title}
              maxLength={200}
              disabled={isEditing}
              aria-required="true"
              onChange={(event) => onEditTitleChange(event.target.value)}
            />
          </label>
          <label>
            <span>Описание</span>
            <textarea
              value={editForm.description}
              rows={3}
              disabled={isEditing}
              onChange={(event) => onEditDescriptionChange(event.target.value)}
            />
          </label>
          <label>
            <span>Ожидаемый результат *</span>
            <textarea
              value={editForm.expectedResult}
              rows={3}
              maxLength={1000}
              disabled={isEditing}
              aria-required="true"
              onChange={(event) => onEditExpectedResultChange(event.target.value)}
            />
          </label>
          <label>
            <span>Сфера</span>
            <SphereSelect
              value={editForm.sphereId || null}
              snapshot={spheres}
              disabled={isEditing}
              onChange={(sphereId) => onEditSphereChange(sphereId ?? '')}
            />
          </label>
          {editError === null ? null : (
            <p className="form-error" role="alert">
              {editError}
            </p>
          )}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={isEditing}>
              {isEditing ? 'Сохраняем…' : 'Сохранить изменения'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isEditing}
              onClick={onCloseEditForm}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}

      {isCancellationOpen ? (
        <div className="life-action-cancellation-confirmation">
          <h3>Отменить это действие?</h3>
          <p>Действие останется в истории, но продолжить его выполнение будет нельзя</p>
          {cancellationError === null ? null : (
            <p className="form-error" role="alert">
              {cancellationError}
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary-button life-action-cancel-button"
              type="button"
              disabled={isCancelling}
              onClick={onConfirmCancellation}
            >
              {isCancelling ? 'Отменяем…' : 'Отменить действие'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isCancelling}
              onClick={onCloseCancellation}
            >
              Назад
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SessionControls({
  details,
  now,
  isMutating,
  error,
  isCompletionFormOpen,
  completionForm,
  hasPendingActionCompletion,
  onStart,
  onPause,
  onResume,
  onOpenCompletionForm,
  onCloseCompletionForm,
  onResultNoteChange,
  onCompletionKindChange,
  onActionChoiceChange,
  onActualResultChange,
  onComplete,
  onRetryActionCompletion,
}: {
  readonly details: Extract<LifeActionDetailsState, { readonly status: 'ready' }>;
  readonly now: Date;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly isCompletionFormOpen: boolean;
  readonly completionForm: SessionCompletionFormState;
  readonly hasPendingActionCompletion: boolean;
  readonly onStart: () => void;
  readonly onPause: (session: ActionSession) => void;
  readonly onResume: (session: ActionSession) => void;
  readonly onOpenCompletionForm: () => void;
  readonly onCloseCompletionForm: () => void;
  readonly onResultNoteChange: (resultNote: string) => void;
  readonly onCompletionKindChange: (completionKind: SessionCompletionKind) => void;
  readonly onActionChoiceChange: (choice: ActionCompletionChoice) => void;
  readonly onActualResultChange: (actualResult: string) => void;
  readonly onComplete: (session: ActionSession) => void;
  readonly onRetryActionCompletion: () => void;
}) {
  const unfinishedSession = details.unfinishedSession;
  const activeSession =
    unfinishedSession !== null && unfinishedSession.lifeActionId.equals(details.lifeAction.id)
      ? unfinishedSession
      : null;
  const hasForeignSession = unfinishedSession !== null && activeSession === null;
  const canStart =
    details.lifeAction.status === LIFE_ACTION_STATUS.ready ||
    details.lifeAction.status === LIFE_ACTION_STATUS.inProgress;

  return (
    <section className="session-controls-section" aria-labelledby="session-controls-title">
      {activeSession === null ? (
        <div className="session-start-block">
          <div>
            <p className="section-kicker">Выполнение</p>
            <h3 id="session-controls-title">Рабочая сессия</h3>
          </div>
          {canStart && !hasPendingActionCompletion ? (
            <button
              className="primary-button session-primary-button"
              type="button"
              disabled={isMutating || hasForeignSession}
              onClick={onStart}
            >
              {details.lifeAction.status === LIFE_ACTION_STATUS.ready
                ? 'Начать выполнение'
                : 'Продолжить новой сессией'}
            </button>
          ) : null}
        </div>
      ) : (
        <ActiveSession
          session={activeSession}
          expectedResult={details.lifeAction.expectedResult?.toString() ?? 'Не указан'}
          now={now}
          isMutating={isMutating}
          onPause={onPause}
          onResume={onResume}
          isCompletionFormOpen={isCompletionFormOpen}
          completionForm={completionForm}
          onOpenCompletionForm={onOpenCompletionForm}
          onCloseCompletionForm={onCloseCompletionForm}
          onResultNoteChange={onResultNoteChange}
          onCompletionKindChange={onCompletionKindChange}
          onActionChoiceChange={onActionChoiceChange}
          onActualResultChange={onActualResultChange}
          onComplete={onComplete}
        />
      )}

      {hasPendingActionCompletion ? (
        <div className="action-completion-retry" role="alert">
          <p>Сессия завершена, но результат действия не удалось подтвердить</p>
          <button
            className="primary-button"
            type="button"
            disabled={isMutating}
            onClick={onRetryActionCompletion}
          >
            Повторить подтверждение результата
          </button>
        </div>
      ) : null}

      {hasForeignSession ? (
        <p className="session-conflict" role="status">
          Сначала завершите или приостановите текущую работу
        </p>
      ) : null}

      {error === null || hasPendingActionCompletion ? null : (
        <p className="form-error session-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ActiveSession({
  session,
  expectedResult,
  now,
  isMutating,
  onPause,
  onResume,
  isCompletionFormOpen,
  completionForm,
  onOpenCompletionForm,
  onCloseCompletionForm,
  onResultNoteChange,
  onCompletionKindChange,
  onActionChoiceChange,
  onActualResultChange,
  onComplete,
}: {
  readonly session: ActionSession;
  readonly expectedResult: string;
  readonly now: Date;
  readonly isMutating: boolean;
  readonly onPause: (session: ActionSession) => void;
  readonly onResume: (session: ActionSession) => void;
  readonly isCompletionFormOpen: boolean;
  readonly completionForm: SessionCompletionFormState;
  readonly onOpenCompletionForm: () => void;
  readonly onCloseCompletionForm: () => void;
  readonly onResultNoteChange: (resultNote: string) => void;
  readonly onCompletionKindChange: (completionKind: SessionCompletionKind) => void;
  readonly onActionChoiceChange: (choice: ActionCompletionChoice) => void;
  readonly onActualResultChange: (actualResult: string) => void;
  readonly onComplete: (session: ActionSession) => void;
}) {
  return (
    <div className={`active-session-card active-session-${session.status}`}>
      <div className="active-session-heading">
        <div>
          <p className="section-kicker">Текущая сессия</p>
          <h3 id="session-controls-title">{session.isRunning() ? 'Выполняется' : 'На паузе'}</h3>
        </div>
        <span className={`session-state session-state-${session.status}`}>
          {session.isRunning() ? 'Выполняется' : 'На паузе'}
        </span>
      </div>

      <p className="session-timer" aria-label="Фактически отработанное время">
        {formatDuration(session.workedDurationAt(now))}
      </p>

      <dl className="active-session-facts">
        <div>
          <dt>Начало</dt>
          <dd>{formatSessionStart(session.startedAt)}</dd>
        </div>
        <div>
          <dt>Всего пауз</dt>
          <dd>{formatDuration(session.pausedDurationAt(now))}</dd>
        </div>
      </dl>

      <div className="session-control-actions">
        {session.isRunning() ? (
          <button
            className="secondary-button session-control-button"
            type="button"
            disabled={isMutating}
            onClick={() => onPause(session)}
          >
            Пауза
          </button>
        ) : (
          <button
            className="primary-button session-control-button"
            type="button"
            disabled={isMutating}
            onClick={() => onResume(session)}
          >
            Продолжить
          </button>
        )}
        <button
          className="secondary-button session-control-button"
          type="button"
          disabled={isMutating}
          onClick={onOpenCompletionForm}
        >
          Завершить
        </button>
      </div>

      {isCompletionFormOpen ? (
        <SessionCompletionForm
          session={session}
          expectedResult={expectedResult}
          form={completionForm}
          isSaving={isMutating}
          onClose={onCloseCompletionForm}
          onResultNoteChange={onResultNoteChange}
          onCompletionKindChange={onCompletionKindChange}
          onActionChoiceChange={onActionChoiceChange}
          onActualResultChange={onActualResultChange}
          onComplete={onComplete}
        />
      ) : null}
    </div>
  );
}

function SessionCompletionForm({
  session,
  expectedResult,
  form,
  isSaving,
  onClose,
  onResultNoteChange,
  onCompletionKindChange,
  onActionChoiceChange,
  onActualResultChange,
  onComplete,
}: {
  readonly session: ActionSession;
  readonly expectedResult: string;
  readonly form: SessionCompletionFormState;
  readonly isSaving: boolean;
  readonly onClose: () => void;
  readonly onResultNoteChange: (resultNote: string) => void;
  readonly onCompletionKindChange: (completionKind: SessionCompletionKind) => void;
  readonly onActionChoiceChange: (choice: ActionCompletionChoice) => void;
  readonly onActualResultChange: (actualResult: string) => void;
  readonly onComplete: (session: ActionSession) => void;
}) {
  const completesAction = form.actionChoice === ACTION_COMPLETION_CHOICE.completeAction;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onComplete(session);
  }

  return (
    <form className="session-completion-form" onSubmit={handleSubmit} noValidate>
      <h4>Завершение работы</h4>

      <label>
        <span>Что сделано за эту сессию</span>
        <textarea
          value={form.resultNote}
          rows={3}
          maxLength={1000}
          disabled={isSaving}
          onChange={(event) => onResultNoteChange(event.target.value)}
        />
      </label>

      <fieldset>
        <legend>Характер завершения</legend>
        <label>
          <input
            type="radio"
            name="completion-kind"
            checked={form.completionKind === SESSION_COMPLETION_KIND.completed}
            disabled={isSaving}
            onChange={() => onCompletionKindChange(SESSION_COMPLETION_KIND.completed)}
          />
          <span>Сессия завершена</span>
        </label>
        <label>
          <input
            type="radio"
            name="completion-kind"
            checked={form.completionKind === SESSION_COMPLETION_KIND.interrupted}
            disabled={isSaving}
            onChange={() => onCompletionKindChange(SESSION_COMPLETION_KIND.interrupted)}
          />
          <span>Работа прервана</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Что делать с действием</legend>
        <label>
          <input
            type="radio"
            name="action-choice"
            checked={form.actionChoice === ACTION_COMPLETION_CHOICE.continueLater}
            disabled={isSaving}
            onChange={() => onActionChoiceChange(ACTION_COMPLETION_CHOICE.continueLater)}
          />
          <span>Продолжить действие позже</span>
        </label>
        <label>
          <input
            type="radio"
            name="action-choice"
            checked={completesAction}
            disabled={isSaving}
            onChange={() => onActionChoiceChange(ACTION_COMPLETION_CHOICE.completeAction)}
          />
          <span>Подтвердить результат и завершить действие</span>
        </label>
      </fieldset>

      {completesAction ? (
        <div className="action-result-verification">
          <div className="action-result-verification-criterion" role="status">
            <span>Критерий проверки</span>
            <strong>Сравните фактический результат с ожидаемым</strong>
            <p>{expectedResult}</p>
          </div>
          <label>
            <span>Фактический результат действия *</span>
            <textarea
              value={form.actualResult}
              rows={4}
              maxLength={2000}
              aria-required="true"
              disabled={isSaving}
              onChange={(event) => onActualResultChange(event.target.value)}
            />
          </label>
          <p className="action-result-verification-help">
            Подтверждение завершит действие. Связанное решение подтверждается отдельно только после
            проверки всех его действий.
          </p>
        </div>
      ) : null}

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Сохраняем…' : completesAction ? 'Подтвердить результат' : 'Сохранить сессию'}
        </button>
        <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function CompletedActionSummary({
  details,
}: {
  readonly details: Extract<LifeActionDetailsState, { readonly status: 'ready' }>;
}) {
  const completedSessions = details.sessions.filter((session) => session.isCompleted());
  const totalWorkedDuration = completedSessions.reduce(
    (total, session) => total + session.workedDurationAt(completionTime(session)),
    0,
  );
  const totalPausedDuration = completedSessions.reduce(
    (total, session) => total + session.pausedDurationAt(completionTime(session)),
    0,
  );

  return (
    <section className="completed-action-summary" aria-labelledby="completed-action-title">
      <p className="section-kicker action-kicker">Проверка результата</p>
      <h3 id="completed-action-title">Результат действия подтверждён</h3>
      <p className="completed-action-result">{details.lifeAction.actualResult?.toString()}</p>
      <p className="completed-action-verification-note">
        Подтверждено пользователем на основании завершённой рабочей сессии с записанным результатом.
      </p>
      <dl>
        <div>
          <dt>Завершённых сессий</dt>
          <dd>{completedSessions.length}</dd>
        </div>
        <div>
          <dt>Отработано</dt>
          <dd>{formatDuration(totalWorkedDuration)}</dd>
        </div>
        <div>
          <dt>Время пауз</dt>
          <dd>{formatDuration(totalPausedDuration)}</dd>
        </div>
      </dl>
    </section>
  );
}

function CancelledActionSummary({
  details,
}: {
  readonly details: Extract<LifeActionDetailsState, { readonly status: 'ready' }>;
}) {
  const completedSessions = details.sessions.filter((session) => session.isCompleted());
  const totalWorkedDuration = completedSessions.reduce(
    (total, session) => total + session.workedDurationAt(completionTime(session)),
    0,
  );

  return (
    <section className="cancelled-action-summary" aria-labelledby="cancelled-action-title">
      <p className="section-kicker">Итог</p>
      <h3 id="cancelled-action-title">Действие отменено</h3>
      {completedSessions.length === 0 ? (
        <p>Выполненных до отмены рабочих сессий нет.</p>
      ) : (
        <dl>
          <div>
            <dt>Завершённых сессий</dt>
            <dd>{completedSessions.length}</dd>
          </div>
          <div>
            <dt>Отработано до отмены</dt>
            <dd>{formatDuration(totalWorkedDuration)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function completionTime(session: ActionSession): Date {
  return session.completedAt ?? session.startedAt;
}

function useSessionTimer(details: LifeActionDetailsState, clock: Pick<Clock, 'now'>): Date {
  const [now, setNow] = useState(() => clock.now());
  const runningSession =
    details.status === 'ready' && details.unfinishedSession?.isRunning()
      ? details.unfinishedSession
      : null;

  useEffect(() => {
    if (runningSession === null) {
      return undefined;
    }

    return scheduleSessionTimer(() => setNow(clock.now()));
  }, [clock, runningSession]);

  const currentClockTime = clock.now();

  if (runningSession === null) {
    return currentClockTime;
  }

  return resolveSafeSessionNow(runningSession, now, currentClockTime);
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

function addDays(date: DayDate, days: number): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`;
}

function formatSessionStart(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
