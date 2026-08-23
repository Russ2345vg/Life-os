import { useEffect, useState } from 'react';
import type { Clock } from '../../application';
import type { ActionSession, LifeAction, Project } from '../../domain';
import {
  formatDuration,
  resolveSafeSessionNow,
  scheduleSessionTimer,
} from '../session/sessionTimer';
import {
  CURRENT_ACTION_COMMAND,
  totalWorkedDurationAt,
  type CurrentActionCardState,
} from './CurrentActionCardState';

interface CurrentActionCardProps {
  readonly state: CurrentActionCardState;
  readonly clock: Pick<Clock, 'now'>;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly project?: Project | null;
  readonly onOpenProject?: (projectId: string) => void;
  readonly onStart: (lifeAction: LifeAction) => void;
  readonly onPause: (session: ActionSession) => void;
  readonly onResume: (session: ActionSession) => void;
  readonly onCompleteSession: (lifeAction: LifeAction) => void;
  readonly onOpen: (lifeAction: LifeAction) => void;
  readonly onReschedule: (lifeAction: LifeAction) => void;
  readonly onCancel: (lifeAction: LifeAction) => void;
}

export function CurrentActionCard({
  state,
  clock,
  isMutating,
  error,
  project = null,
  onOpenProject = () => undefined,
  onStart,
  onPause,
  onResume,
  onCompleteSession,
  onOpen,
  onReschedule,
  onCancel,
}: CurrentActionCardProps) {
  const now = useCardTimer(state, clock);
  const totalWorked = totalWorkedDurationAt(state.sessions, now);
  const currentSessionWorked =
    state.unfinishedSession === null ? null : state.unfinishedSession.workedDurationAt(now);
  const lastSession = state.sessions.reduce<ActionSession | null>(
    (latest, session) =>
      latest === null || session.startedAt.getTime() > latest.startedAt.getTime()
        ? session
        : latest,
    null,
  );

  function runPrimaryCommand(): void {
    switch (state.primaryCommand) {
      case CURRENT_ACTION_COMMAND.startSession:
        onStart(state.lifeAction);
        return;
      case CURRENT_ACTION_COMMAND.completeSession:
        onCompleteSession(state.lifeAction);
        return;
      case CURRENT_ACTION_COMMAND.resumeSession:
        if (state.unfinishedSession !== null) {
          onResume(state.unfinishedSession);
        }
    }
  }

  return (
    <section className="current-action-card" aria-labelledby="current-action-title">
      <div className="current-action-card-heading">
        <div>
          <p className="section-kicker green">Текущее действие</p>
          <h3 id="current-action-title">{state.lifeAction.title.toString()}</h3>
        </div>
        <div className="current-action-badges" aria-label="Тип и состояние действия">
          <span className="current-action-type">Действие</span>
          <span className="current-action-status">{state.statusLabel}</span>
        </div>
      </div>

      <dl className="current-action-facts">
        <div>
          <dt>Связанное решение</dt>
          <dd>
            <span>{state.decisionTitle ?? 'Без связанного решения'}</span>
            {project === null ? null : (
              <button
                className="today-project-link"
                type="button"
                onClick={() => onOpenProject(project.id.toString())}
              >
                {project.title} →
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>Ожидаемый результат</dt>
          <dd>{state.lifeAction.expectedResult?.toString() ?? 'Не указан'}</dd>
        </div>
        <div>
          <dt>Учтённое время</dt>
          <dd>{formatDuration(totalWorked)}</dd>
        </div>
        <div>
          <dt>{currentSessionWorked === null ? 'Последняя сессия' : 'Текущая сессия'}</dt>
          <dd className="current-action-timer">
            {currentSessionWorked === null
              ? lastSession === null
                ? 'Сессий пока нет'
                : formatDuration(lastSession.workedDurationAt(now))
              : formatDuration(currentSessionWorked)}
          </dd>
        </div>
      </dl>

      {error === null ? null : (
        <p className="form-error current-action-error" role="alert">
          {error}
        </p>
      )}

      <div className="current-action-primary-row">
        <button
          className="primary-button current-action-primary-button"
          type="button"
          disabled={isMutating}
          onClick={runPrimaryCommand}
        >
          {isMutating ? 'Сохраняем…' : state.primaryLabel}
        </button>
      </div>

      <div className="current-action-secondary-actions" aria-label="Дополнительные действия">
        <button className="secondary-button" type="button" onClick={() => onOpen(state.lifeAction)}>
          Открыть
        </button>
        {state.primaryCommand === CURRENT_ACTION_COMMAND.completeSession &&
        state.unfinishedSession !== null ? (
          <button
            className="secondary-button"
            type="button"
            disabled={isMutating}
            onClick={() => {
              if (state.unfinishedSession !== null) {
                onPause(state.unfinishedSession);
              }
            }}
          >
            Пауза
          </button>
        ) : null}
        <button
          className="secondary-button"
          type="button"
          disabled={isMutating || !state.canManageAction}
          onClick={() => onReschedule(state.lifeAction)}
        >
          Перенести
        </button>
        <button
          className="secondary-button danger-button"
          type="button"
          disabled={isMutating || !state.canManageAction}
          onClick={() => onCancel(state.lifeAction)}
        >
          Отменить
        </button>
      </div>
      {state.canManageAction ? null : (
        <p className="current-action-management-note">
          Перенос и отмена доступны после завершения текущей сессии.
        </p>
      )}
    </section>
  );
}

function useCardTimer(state: CurrentActionCardState, clock: Pick<Clock, 'now'>): Date {
  const [now, setNow] = useState(() => clock.now());

  useEffect(() => {
    if (state.primaryCommand !== CURRENT_ACTION_COMMAND.completeSession) {
      return;
    }

    return scheduleSessionTimer(() => setNow(clock.now()));
  }, [clock, state.primaryCommand]);

  const currentClockTime = clock.now();
  const candidateNow =
    state.primaryCommand === CURRENT_ACTION_COMMAND.completeSession ? now : currentClockTime;

  return resolveSafeSessionNow(state.unfinishedSession, candidateNow, currentClockTime);
}
