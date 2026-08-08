import { ACTION_LIST_GROUP, type ActionListItem } from '../application';

export type ActionListPrimaryCommand = 'open' | 'start' | 'resume';

export interface ActionListPrimaryAction {
  readonly command: ActionListPrimaryCommand;
  readonly label: string;
}

export function resolveActionListPrimaryAction(
  item: ActionListItem,
  canManageSessions: boolean,
): ActionListPrimaryAction {
  if (!canManageSessions) {
    return { command: 'open', label: 'Открыть карточку' };
  }

  switch (item.group) {
    case ACTION_LIST_GROUP.paused:
      return item.unfinishedSession === null
        ? { command: 'open', label: 'Открыть карточку' }
        : { command: 'resume', label: 'Продолжить' };
    case ACTION_LIST_GROUP.ready:
      return { command: 'start', label: 'Начать сессию' };
    case ACTION_LIST_GROUP.active:
      return item.unfinishedSession?.isRunning() === true
        ? { command: 'open', label: 'Открыть сессию' }
        : { command: 'start', label: 'Начать новую сессию' };
    case ACTION_LIST_GROUP.completed:
      return { command: 'open', label: 'Открыть результат' };
    case ACTION_LIST_GROUP.cancelled:
      return { command: 'open', label: 'Открыть историю' };
  }
}

export function formatActionDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
}
