import { DayDate, EntityId, JournalEntry, type JournalMetadata } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { PlanningState } from '../ports/PlanningRepository';
export function localDate(now: Date): string {
  return DayDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()).toString();
}
export function requireGoal(s: PlanningState, id: string) {
  const goal = s.goals.find((g) => g.id.toString() === id);
  if (!goal) throw new DomainError('goal.not_found', 'Цель не найдена.');
  return goal;
}
export function requireAction(s: PlanningState, id: string) {
  const action = s.actions.find((a) => a.id.toString() === id);
  if (!action) throw new DomainError('life_action.not_found', 'Действие не найдено.');
  return action;
}
export function put<T extends { readonly id: string }>(list: T[], record: T): void {
  const index = list.findIndex((r) => r.id === record.id);
  if (index < 0) list.push(record);
  else list[index] = record;
}
export function planningJournal(
  id: string,
  subjectType: 'Goal' | 'LifeAction' | 'PlanningPeriod' | 'RecurrenceRule',
  subjectId: string,
  label: string,
  now: Date,
  metadata: JournalMetadata = {},
) {
  return JournalEntry.create({
    id: EntityId.create(id),
    type: 'planningChanged',
    subjectType,
    subjectId: EntityId.create(subjectId),
    labelAtEvent: label,
    occurredAt: now,
    createdAt: now,
    effectiveDate: DayDate.create(localDate(now)),
    metadata,
  });
}
