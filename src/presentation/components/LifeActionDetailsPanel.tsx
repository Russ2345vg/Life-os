import { useEffect, useState, type FormEvent } from 'react';
import type { Clock } from '../../application';
import {
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type ActionSession,
  type DayDate,
  type LifeActionStatus,
  type SessionCompletionKind,
} from '../../domain';
import {
  ACTION_COMPLETION_CHOICE,
  type ActionCompletionChoice,
  type LifeActionDetailsState,
  type SessionCompletionFormState,
} from '../pages/TodayPageState';
import { formatDuration, scheduleSessionTimer } from '../session/sessionTimer';

interface LifeActionDetailsPanelProps {
  readonly details: LifeActionDetailsState;
  readonly decisionTitle: string | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly isCompletionFormOpen: boolean;
  readonly completionForm: SessionCompletionFormState;
  readonly hasPendingActionCompletion: boolean;
  readonly onClose: () => void;
  readonly onBack: () => void;
  readonly onRetry: () => void;
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
}

export function LifeActionDetailsPanel({
  details,
  decisionTitle,
  clock,
  isMutating,
  error,
  isCompletionFormOpen,
  completionForm,
  hasPendingActionCompletion,
  onClose,
  onBack,
  onRetry,
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
            <span aria-hidden="true">←</span> Назад к решению
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
            </dl>

            {details.lifeAction.status === LIFE_ACTION_STATUS.completed ? (
              <CompletedActionSummary details={details} />
            ) : (
              <SessionControls
                details={details}
                now={timerNow}
                isMutating={isMutating}
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

            <SessionHistory sessions={details.sessions} />
          </div>
        ) : null}
      </aside>
    </div>
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
          <p>Сессия завершена, но действие не удалось завершить</p>
          <button
            className="primary-button"
            type="button"
            disabled={isMutating}
            onClick={onRetryActionCompletion}
          >
            Повторить завершение действия
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
          <span>Завершить действие полностью</span>
        </label>
      </fieldset>

      {completesAction ? (
        <label>
          <span>Фактический результат *</span>
          <textarea
            value={form.actualResult}
            rows={4}
            maxLength={2000}
            aria-required="true"
            disabled={isSaving}
            onChange={(event) => onActualResultChange(event.target.value)}
          />
        </label>
      ) : null}

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Сохраняем…' : 'Сохранить'}
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
      <p className="section-kicker action-kicker">Итог</p>
      <h3 id="completed-action-title">Действие завершено</h3>
      <p className="completed-action-result">{details.lifeAction.actualResult?.toString()}</p>
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

function SessionHistory({ sessions }: { readonly sessions: readonly ActionSession[] }) {
  const completedSessions = sessions
    .filter((session) => session.isCompleted())
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());

  return (
    <section className="session-history" aria-labelledby="session-history-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">История</p>
          <h3 id="session-history-title">Завершённые сессии</h3>
        </div>
      </div>

      {completedSessions.length === 0 ? (
        <p className="empty-session-history">Завершённых сессий пока нет</p>
      ) : (
        <div className="session-history-list">
          {completedSessions.map((session) => (
            <article
              className={`session-history-card${session.isInterrupted() ? ' session-history-interrupted' : ''}`}
              key={session.id.toString()}
            >
              <div>
                <time>{formatSessionStart(session.startedAt)}</time>
                <span>{session.isInterrupted() ? 'Прервана' : 'Завершена'}</span>
              </div>
              <dl className="session-history-durations">
                <div>
                  <dt>Работа</dt>
                  <dd>{formatDuration(session.workedDurationAt(completionTime(session)))}</dd>
                </div>
                <div>
                  <dt>Паузы</dt>
                  <dd>{formatDuration(session.pausedDurationAt(completionTime(session)))}</dd>
                </div>
              </dl>
              {session.resultNote === null ? null : <p>{session.resultNote.toString()}</p>}
            </article>
          ))}
        </div>
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

  if (runningSession === null) {
    return clock.now();
  }

  const lastResumeAt = runningSession.pauseIntervals.at(-1)?.endedAt ?? runningSession.startedAt;
  const safeTimestamp = Math.max(now.getTime(), clock.now().getTime(), lastResumeAt.getTime());
  return new Date(safeTimestamp);
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

function formatSessionStart(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
