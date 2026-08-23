import {
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  type EveningCycleMode,
  type EveningCycleState,
  type PreparationItem,
} from '../../domain';

export function eveningModeProgress(
  mode: EveningCycleMode,
  state: EveningCycleState,
): Readonly<{ completed: number; total: number }> {
  const required =
    mode === EVENING_CYCLE_MODE.normal
      ? [
          EVENING_CYCLE_STATE.resolving,
          EVENING_CYCLE_STATE.reflecting,
          EVENING_CYCLE_STATE.planningTomorrow,
          EVENING_CYCLE_STATE.preparing,
          EVENING_CYCLE_STATE.shutdown,
        ]
      : mode === EVENING_CYCLE_MODE.quick
        ? [
            EVENING_CYCLE_STATE.resolving,
            EVENING_CYCLE_STATE.planningTomorrow,
            EVENING_CYCLE_STATE.preparing,
            EVENING_CYCLE_STATE.shutdown,
          ]
        : [
            EVENING_CYCLE_STATE.resolving,
            EVENING_CYCLE_STATE.planningTomorrow,
            EVENING_CYCLE_STATE.shutdown,
          ];
  const order = Object.values(EVENING_CYCLE_STATE);
  const stateIndex = order.indexOf(state);
  const completed = required.filter((stage) => stateIndex > order.indexOf(stage)).length;
  return Object.freeze({
    completed: state === EVENING_CYCLE_STATE.completed ? required.length : completed,
    total: required.length,
  });
}

export function visiblePreparationItemsForMode(
  items: readonly PreparationItem[],
  mode: EveningCycleMode,
): readonly PreparationItem[] {
  return mode === EVENING_CYCLE_MODE.quick ? items.filter((item) => item.required) : [...items];
}
