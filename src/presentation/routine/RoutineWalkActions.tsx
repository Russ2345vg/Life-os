interface RoutineWalkActionsProps {
  readonly linked: boolean;
  readonly notStarted: boolean;
  readonly canStart: boolean;
  readonly disabled: boolean;
  readonly onStart: () => void;
  readonly onReturn: () => void;
}

export function RoutineWalkActions(props: RoutineWalkActionsProps) {
  if (props.linked)
    return (
      <>
        <span className="routine-walk-active-label">Прогулка идёт</span>
        <button
          className="primary-button routine-primary-command"
          type="button"
          onClick={props.onReturn}
        >
          Вернуться к прогулке
        </button>
      </>
    );
  if (!props.notStarted || !props.canStart) return null;
  return (
    <button
      className="primary-button routine-primary-command"
      type="button"
      disabled={props.disabled}
      onClick={props.onStart}
    >
      Начать прогулку
    </button>
  );
}
