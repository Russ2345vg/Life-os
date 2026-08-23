import { LIFE_ACTION_STATUS, type Decision, type LifeAction, type Project } from '../../domain';
import { findProjectForLifeAction } from '../management/projectReferenceModel';

interface TodayActionNavigatorProps {
  readonly lifeActions: readonly LifeAction[];
  readonly currentLifeActionIndex: number;
  readonly isLockedBySession: boolean;
  readonly isMutating: boolean;
  readonly decisions?: readonly Decision[];
  readonly projects?: readonly Project[];
  readonly onOpenProject?: (projectId: string) => void;
  readonly onSelect: (lifeAction: LifeAction) => void;
}

export function TodayActionNavigator({
  lifeActions,
  currentLifeActionIndex,
  isLockedBySession,
  isMutating,
  decisions = [],
  projects = [],
  onOpenProject = () => undefined,
  onSelect,
}: TodayActionNavigatorProps) {
  const previousLifeAction = lifeActions[currentLifeActionIndex - 1] ?? null;
  const nextLifeAction = lifeActions[currentLifeActionIndex + 1] ?? null;
  const currentLifeAction = lifeActions[currentLifeActionIndex] ?? null;
  const followingLifeActions = lifeActions.slice(currentLifeActionIndex + 1);
  const selectionLocked = isLockedBySession || isMutating;

  if (currentLifeAction === null) {
    return null;
  }

  return (
    <nav className="today-action-navigator" aria-label="Действия текущего дня">
      <div className="today-action-navigator-header">
        <div>
          <p className="section-kicker">Действия дня</p>
          <strong className="today-action-counter">Следующие Действия</strong>
          <span className="today-action-position">
            {currentLifeActionIndex + 1} из {lifeActions.length}
          </span>
        </div>
        <div className="today-action-arrow-group">
          <button
            className="today-action-arrow"
            type="button"
            aria-label="Показать предыдущее действие"
            disabled={selectionLocked || previousLifeAction === null}
            onClick={() => {
              if (previousLifeAction !== null) {
                onSelect(previousLifeAction);
              }
            }}
          >
            ←
          </button>
          <button
            className="today-action-arrow"
            type="button"
            aria-label="Показать следующее действие"
            disabled={selectionLocked || nextLifeAction === null}
            onClick={() => {
              if (nextLifeAction !== null) {
                onSelect(nextLifeAction);
              }
            }}
          >
            →
          </button>
        </div>
      </div>

      {followingLifeActions.length === 0 ? (
        <p className="today-action-empty">
          После текущего Действия продолжение пока не запланировано.
        </p>
      ) : (
        <div className="today-action-list" role="list" aria-label="Список следующих действий">
          {followingLifeActions.map((lifeAction, offset) => {
            const index = currentLifeActionIndex + offset + 1;
            const project = findProjectForLifeAction(projects, decisions, lifeAction);
            return (
              <div
                key={lifeAction.id.toString()}
                className="today-action-list-item"
                role="listitem"
              >
                <button
                  className="today-action-list-open"
                  type="button"
                  aria-label={`Выбрать действие «${lifeAction.title.toString()}»`}
                  disabled={selectionLocked}
                  onClick={() => onSelect(lifeAction)}
                />
                <span className="today-action-list-index">{index + 1}</span>
                <span className="today-action-list-copy">
                  <span className="today-action-list-title">{lifeAction.title.toString()}</span>
                  {project === null ? null : (
                    <button
                      className="today-project-link today-action-project-link"
                      type="button"
                      onClick={() => onOpenProject(project.id.toString())}
                    >
                      {project.title} →
                    </button>
                  )}
                </span>
                <span className="today-action-list-status">
                  {lifeAction.status === LIFE_ACTION_STATUS.inProgress ? 'В работе' : 'Готово'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {selectionLocked ? (
        <p className="today-action-lock-note" role="status">
          {isLockedBySession
            ? 'Выбор другого действия доступен после завершения текущей рабочей сессии.'
            : 'Дождитесь завершения текущей операции.'}
        </p>
      ) : null}
    </nav>
  );
}
