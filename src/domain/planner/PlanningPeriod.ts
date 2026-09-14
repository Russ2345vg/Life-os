import { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export type PeriodKind = 'year' | 'quarter' | 'thirty_days' | 'week';
export interface PlanningRecord {
  readonly id: string;
  readonly version: number;
  readonly schemaVersion: 1;
  readonly updatedAt: string;
}
export interface DateRange {
  readonly startDate: string;
  readonly endDate: string;
}
export interface PlanningPeriod extends PlanningRecord, DateRange {
  readonly kind: PeriodKind;
  readonly outcome: string;
  readonly primaryGoalId: string | null;
  readonly legacyFocusVersion?: number | null;
}
export interface PeriodMembership extends PlanningRecord {
  readonly periodId: string;
  readonly entityType: 'goal' | 'action';
  readonly entityId: string;
  readonly focused: boolean;
  readonly removed: boolean;
  readonly legacyVersion?: number | null;
}
export interface PeriodDecision extends PlanningRecord {
  readonly periodId: string;
  readonly entityType: 'goal' | 'action';
  readonly entityId: string;
  readonly decision: 'continue' | 'unplanned' | 'stop' | 'achieved';
  readonly targetPeriodId: string | null;
  readonly statusAtDecision: string;
  readonly resultAtDecision?: {
    readonly title: string;
    readonly current: number | null;
    readonly target: number | null;
    readonly unit: string | null;
    readonly percent: number | null;
    readonly pending: number;
  };
}
export function addDays(date: string, count: number): string {
  DayDate.create(date);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function automaticPeriod(
  kind: Exclude<PeriodKind, 'thirty_days'>,
  date: string,
): PlanningPeriod {
  DayDate.create(date);
  const year = date.slice(0, 4);
  let startDate: string, endDate: string, id: string;
  if (kind === 'year') {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    id = `year:${year}`;
  } else if (kind === 'quarter') {
    const q = Math.floor((Number(date.slice(5, 7)) - 1) / 3);
    startDate = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    endDate =
      q === 3 ? `${year}-12-31` : addDays(`${year}-${String(q * 3 + 4).padStart(2, '0')}-01`, -1);
    id = `quarter:${year}-Q${q + 1}`;
  } else {
    startDate = addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
    endDate = addDays(startDate, 6);
    id = `week:${startDate}`;
  }
  return {
    id,
    kind,
    startDate,
    endDate,
    outcome: '',
    primaryGoalId: null,
    version: 1,
    schemaVersion: 1,
    updatedAt: `${startDate}T00:00:00.000Z`,
  };
}
export function thirtyDayPeriod(startDate: string): PlanningPeriod {
  return {
    ...automaticPeriod('week', startDate),
    id: `thirty_days:${startDate}`,
    kind: 'thirty_days',
    startDate,
    endDate: addDays(startDate, 29),
  };
}
export function nextSevenDays(date: string): DateRange {
  return { startDate: date, endDate: addDays(date, 6) };
}
export function membershipId(periodId: string, type: 'goal' | 'action', entityId: string): string {
  return `membership:${encodeURIComponent(periodId)}:${type}:${encodeURIComponent(entityId)}`;
}
export function focusWarning(kind: PeriodKind, count: number): string | null {
  const max = kind === 'year' ? 5 : 4;
  return count > max
    ? `В фокусе ${count} целей. Рекомендуем не больше ${max}; вы можете оставить все.`
    : null;
}
export function assertPlanningRecord(value: PlanningRecord): void {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    throw new DomainError('planning.invalid_record', 'Некорректная запись планирования.');
}
export function validatePeriod(value: PlanningPeriod): PlanningPeriod {
  assertPlanningRecord(value);
  if (!['year', 'quarter', 'thirty_days', 'week'].includes(value.kind))
    throw new DomainError('planning.invalid_period', 'Период указан неверно.');
  const expected =
    value.kind === 'thirty_days'
      ? thirtyDayPeriod(value.startDate)
      : automaticPeriod(value.kind, value.startDate);
  if (
    value.id !== expected.id ||
    value.startDate !== expected.startDate ||
    value.endDate !== expected.endDate ||
    typeof value.outcome !== 'string' ||
    value.outcome.length > 2000 ||
    (value.primaryGoalId !== null && typeof value.primaryGoalId !== 'string')
  )
    throw new DomainError('planning.invalid_period', 'Границы периода указаны неверно.');
  return Object.freeze({ ...value });
}

export function cycleAt(periods: readonly PlanningPeriod[], date: string): PlanningPeriod | null {
  return (
    periods
      .filter((p) => p.kind === 'thirty_days' && p.startDate <= date && p.endDate >= date)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))[0] ?? null
  );
}
