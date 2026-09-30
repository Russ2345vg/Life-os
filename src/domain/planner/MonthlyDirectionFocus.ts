import { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export interface MonthlyDirectionFocus {
  readonly id: string;
  readonly month: string;
  readonly directionId: string | null;
  readonly updatedAt: string;
  readonly version: number;
  readonly schemaVersion: 1;
}

export function monthlyDirectionFocusMonth(date: DayDate): string {
  return date.toString().slice(0, 7);
}

export function monthlyDirectionFocusId(month: string): string {
  assertMonth(month);
  return `monthly-direction-focus:${month}`;
}

export function validateMonthlyDirectionFocus(value: MonthlyDirectionFocus): MonthlyDirectionFocus {
  if (
    !value ||
    value.id !== monthlyDirectionFocusId(value.month) ||
    (value.directionId !== null &&
      (typeof value.directionId !== 'string' || value.directionId.trim() === '')) ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    value.schemaVersion !== 1
  )
    throw invalid();
  return Object.freeze({ ...value });
}

export function changeMonthlyDirectionFocus(
  current: MonthlyDirectionFocus | null,
  month: string,
  directionId: string | null,
  updatedAt: Date,
): MonthlyDirectionFocus {
  assertMonth(month);
  if (current !== null && current.month !== month) throw invalid();
  if (directionId !== null && directionId.trim() === '') throw invalid();
  if (current?.directionId === directionId) return current;
  return validateMonthlyDirectionFocus({
    id: monthlyDirectionFocusId(month),
    month,
    directionId,
    updatedAt: updatedAt.toISOString(),
    version: (current?.version ?? 0) + 1,
    schemaVersion: 1,
  });
}

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw invalid();
}

function invalid(): DomainError {
  return new DomainError(
    'monthly_direction_focus.invalid',
    'Главное направление месяца содержит некорректные данные.',
  );
}
