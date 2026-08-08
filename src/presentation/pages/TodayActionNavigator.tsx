import type { LifeAction } from '../../domain';

interface TodayActionNavigatorProps {
  readonly lifeActions: readonly LifeAction[];
  readonly currentLifeActionIndex: number;
  readonly isLockedBySession: boolean;
  readonly isMutating: boolean;
  readonly onSelect: (lifeAction: LifeAction) => void;
}

export function TodayActionNavigator({
  lifeActions,
  currentLifeActionIndex,
  isLockedBySession,
  isMutating,
  onSelect,
}: TodayActionNavigatorProps) {
  const previousLifeAction = lifeActions[currentLifeActionIndex - 1] ?? null;
  const nextLifeAction = lifeActions[currentLifeActionIndex + 1] ?? null;
  const currentLifeAction = lifeActions[currentLifeActionIndex] ?? null;
  const selectionLocked = isLockedBySession || isMutating;

  if (currentLifeAction === null) {
    return null;
  }

  return (
    <nav className="today-action-navigator" aria-label="Действия текущего дня">
      <div className="today-action-navigator-header">
        <div>
          <p className="section-kicker">Действия дня</p>
          <strong className="today-action-counter">
            {currentLifeActionIndex + 1} из {lifeActions.length}
          </strong>
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

      <div className="today-action-list" role="list" aria-label="Список доступных действий">
        {lifeActions.map((lifeAction, index) => {
          const isCurrent = index === currentLifeActionIndex;
          return (
            <button
              key={lifeAction.id.toString()}
              className={`today-action-list-item${isCurrent ? ' is-current' : ''}`}
              type="button"
              role="listitem"
              aria-current={isCurrent ? 'true' : undefined}
              disabled={selectionLocked && !isCurrent}
              onClick={() => onSelect(lifeAction)}
            >
              <span className="today-action-list-index">{index + 1}</span>
              <span className="today-action-list-title">{lifeAction.title.toString()}</span>
            </button>
          );
        })}
      </div>

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
