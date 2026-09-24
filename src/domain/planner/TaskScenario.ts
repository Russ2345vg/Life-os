import { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export interface TaskScenario {
  readonly id: string;
  readonly title: string;
  readonly actionIds: readonly string[];
  readonly date: string | null;
  readonly archived: boolean;
  readonly updatedAt: string;
  readonly version: number;
  readonly schemaVersion: 1;
}

export function taskScenario(value: TaskScenario): TaskScenario {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.trim().length > 100 ||
    !Array.isArray(value.actionIds) ||
    value.actionIds.length > 3 ||
    value.actionIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(value.actionIds).size !== value.actionIds.length ||
    typeof value.archived !== 'boolean' ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    value.schemaVersion !== 1 ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    (value.date !== null && typeof value.date !== 'string')
  )
    throw new DomainError(
      'scenario.invalid',
      'Укажите название до 100 символов и не больше трёх разных задач.',
    );
  if (value.date !== null) DayDate.create(value.date);
  return { ...value, title: value.title.trim(), actionIds: [...value.actionIds] };
}

export function addScenarioAction(current: TaskScenario, id: string, now: string): TaskScenario {
  if (current.actionIds.includes(id)) return current;
  if (current.actionIds.length >= 3)
    throw new DomainError(
      'scenario.full',
      'В сценарии может быть не больше трёх задач. Сначала уберите одну.',
    );
  return taskScenario({
    ...current,
    actionIds: [...current.actionIds, id],
    updatedAt: now,
    version: current.version + 1,
  });
}

export function removeScenarioAction(current: TaskScenario, id: string, now: string): TaskScenario {
  if (!current.actionIds.includes(id)) return current;
  return taskScenario({
    ...current,
    actionIds: current.actionIds.filter((value) => value !== id),
    updatedAt: now,
    version: current.version + 1,
  });
}
