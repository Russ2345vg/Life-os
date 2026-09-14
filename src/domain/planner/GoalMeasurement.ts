import { DomainError } from '../../shared/errors/DomainError';
import { automaticPeriod, addDays, type DateRange } from './PlanningPeriod';
export interface GoalMeasurement {
  readonly mode: 'numeric' | 'count' | 'recurring';
  readonly target: number;
  readonly unit: string;
  readonly start: number | null;
  readonly direction: 'at_least' | 'at_most' | 'exact';
  readonly cycle: 'week' | 'month' | null;
}
export function validateMeasurement(value: GoalMeasurement | null): GoalMeasurement | null {
  if (value === null) return null;
  if (
    !value ||
    !['numeric', 'count', 'recurring'].includes(value.mode) ||
    !Number.isFinite(value.target) ||
    typeof value.unit !== 'string' ||
    !value.unit.trim() ||
    value.unit.length > 40 ||
    (value.start !== null && !Number.isFinite(value.start)) ||
    !['at_least', 'at_most', 'exact'].includes(value.direction) ||
    (value.mode === 'recurring'
      ? !['week', 'month'].includes(value.cycle ?? '')
      : value.cycle !== null) ||
    (value.mode !== 'numeric' && value.target <= 0)
  )
    throw new DomainError(
      'goal.invalid_measurement',
      'Проверьте целевое значение, единицу и цикл.',
    );
  return Object.freeze({ ...value, unit: value.unit.trim() });
}
export function measurementCycle(measurement: GoalMeasurement, date: string): DateRange | null {
  if (measurement.mode !== 'recurring') return null;
  if (measurement.cycle === 'week') return automaticPeriod('week', date);
  const startDate = `${date.slice(0, 7)}-01`;
  let next = addDays(startDate, 32);
  next = `${next.slice(0, 7)}-01`;
  return { startDate, endDate: addDays(next, -1) };
}
export function measureProgress(measurement: GoalMeasurement | null, current: number) {
  if (measurement === null) return null;
  const { target, direction, start } = measurement;
  const reached =
    direction === 'at_least'
      ? current >= target
      : direction === 'at_most'
        ? current <= target
        : Math.abs(current - target) < 1e-9;
  const remaining =
    direction === 'at_least'
      ? Math.max(0, target - current)
      : direction === 'at_most'
        ? Math.max(0, current - target)
        : Math.abs(current - target);
  const base = measurement.mode === 'numeric' ? start : 0;
  const percent =
    base === null || target === base
      ? null
      : Math.max(0, Math.min(100, ((current - base) / (target - base)) * 100));
  return { current, target, unit: measurement.unit, remaining, reached, percent };
}
