import { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export type FocusRole = 'primary' | 'supporting';
export interface FocusPeriod {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly goals: readonly { readonly goalId: string; readonly role: FocusRole }[];
  readonly updatedAt: string;
  readonly version: number;
  readonly schemaVersion: 1;
}
export function focusWeek(date: string): { startDate: string; endDate: string; id: string } {
  DayDate.create(date);
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const startDate = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 6);
  return { id: `focus:week:${startDate}`, startDate, endDate: day.toISOString().slice(0, 10) };
}
export function focusPeriod(value: FocusPeriod): FocusPeriod {
  const week = focusWeek(value.startDate);
  if (
    value.id !== week.id ||
    value.startDate !== week.startDate ||
    value.endDate !== week.endDate ||
    !Array.isArray(value.goals) ||
    value.goals.some(
      (g) =>
        !g ||
        typeof g.goalId !== 'string' ||
        !g.goalId ||
        !['primary', 'supporting'].includes(g.role),
    ) ||
    new Set(value.goals.map((g) => g.goalId)).size !== value.goals.length ||
    value.goals.filter((g) => g.role === 'primary').length > 1 ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    value.schemaVersion !== 1 ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    throw new DomainError(
      'focus.invalid_period',
      'В фокусе может быть одна главная цель; каждая цель участвует один раз.',
    );
  return Object.freeze({
    ...value,
    goals: Object.freeze(value.goals.map((g) => Object.freeze({ ...g }))),
  });
}
export function changeFocusRole(
  period: FocusPeriod,
  goalId: string,
  role: FocusRole | null,
  now: string,
): FocusPeriod {
  const previous = period.goals.find((g) => g.goalId === goalId);
  if ((previous?.role ?? null) === role) return period;
  const goals = period.goals
    .filter((g) => g.goalId !== goalId)
    .map((g) =>
      role === 'primary' && g.role === 'primary' ? { ...g, role: 'supporting' as const } : g,
    );
  if (role !== null) goals.push({ goalId, role });
  return focusPeriod({ ...period, goals, updatedAt: now, version: period.version + 1 });
}
