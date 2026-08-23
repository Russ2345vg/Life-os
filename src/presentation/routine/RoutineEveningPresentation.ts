import { EVENING_CYCLE_STATE, type EveningCycleState } from '../../domain';

export type EveningBlockStatus = 'notStarted' | 'inProgress' | 'completed';

export function eveningBlockStatus(state: EveningCycleState | null): EveningBlockStatus {
  if (state === EVENING_CYCLE_STATE.completed) return 'completed';
  if (state === null || state === EVENING_CYCLE_STATE.notStarted) return 'notStarted';
  return 'inProgress';
}

export function eveningBlockStatusLabel(status: EveningBlockStatus): string {
  if (status === 'completed') return 'Завершён';
  if (status === 'inProgress') return 'В процессе';
  return 'Не начат';
}
