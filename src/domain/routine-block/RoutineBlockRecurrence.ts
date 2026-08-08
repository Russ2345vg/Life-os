import type { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export const ROUTINE_BLOCK_RECURRENCE = {
  none: 'none',
  daily: 'daily',
  weekdays: 'weekdays',
  weekends: 'weekends',
  selectedWeekdays: 'selectedWeekdays',
} as const;

export type RoutineBlockRecurrenceKind =
  (typeof ROUTINE_BLOCK_RECURRENCE)[keyof typeof ROUTINE_BLOCK_RECURRENCE];
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isRoutineBlockRecurrenceKind(value: string): value is RoutineBlockRecurrenceKind {
  return Object.values(ROUTINE_BLOCK_RECURRENCE).some((kind) => kind === value);
}

export interface RoutineBlockRecurrenceData {
  readonly kind: RoutineBlockRecurrenceKind;
  readonly selectedWeekdays: readonly IsoWeekday[];
}

export class RoutineBlockRecurrence {
  public readonly kind: RoutineBlockRecurrenceKind;
  public readonly selectedWeekdays: readonly IsoWeekday[];

  private constructor(data: RoutineBlockRecurrenceData) {
    this.kind = data.kind;
    this.selectedWeekdays = [...data.selectedWeekdays];
  }

  public static create(
    kind: RoutineBlockRecurrenceKind,
    selectedWeekdays: readonly number[] = [],
  ): RoutineBlockRecurrence {
    if (!isRoutineBlockRecurrenceKind(kind)) {
      throw new DomainError(
        'routine_block.invalid_recurrence',
        'Режим повторения блока указан неверно.',
      );
    }
    const unique = [...new Set(selectedWeekdays)].sort((left, right) => left - right);
    if (unique.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
      throw new DomainError(
        'routine_block.invalid_weekday',
        'День недели должен быть целым числом от 1 до 7.',
      );
    }

    if (kind === ROUTINE_BLOCK_RECURRENCE.selectedWeekdays && unique.length === 0) {
      throw new DomainError(
        'routine_block.weekdays_required',
        'Выберите хотя бы один день недели.',
      );
    }

    if (kind !== ROUTINE_BLOCK_RECURRENCE.selectedWeekdays && unique.length > 0) {
      throw new DomainError(
        'routine_block.unexpected_weekdays',
        'Выбранные дни допустимы только для режима «Выбранные дни недели».',
      );
    }

    return new RoutineBlockRecurrence({ kind, selectedWeekdays: unique as IsoWeekday[] });
  }

  public occursOn(anchorDate: DayDate, date: DayDate): boolean {
    if (date.isBefore(anchorDate)) {
      return false;
    }

    if (this.kind === ROUTINE_BLOCK_RECURRENCE.none) {
      return date.equals(anchorDate);
    }

    if (this.kind === ROUTINE_BLOCK_RECURRENCE.daily) {
      return true;
    }

    const weekday = isoWeekday(date);
    if (this.kind === ROUTINE_BLOCK_RECURRENCE.weekdays) {
      return weekday <= 5;
    }
    if (this.kind === ROUTINE_BLOCK_RECURRENCE.weekends) {
      return weekday >= 6;
    }

    return this.selectedWeekdays.includes(weekday);
  }
}

function isoWeekday(date: DayDate): IsoWeekday {
  const [yearText, monthText, dayText] = date.toString().split('-');
  const weekday = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  ).getUTCDay();
  return (weekday === 0 ? 7 : weekday) as IsoWeekday;
}
