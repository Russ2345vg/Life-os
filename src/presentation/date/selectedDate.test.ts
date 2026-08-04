import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import {
  addDays,
  compareDayDates,
  formatSelectedDateTitle,
  formatSelectedDateWeekday,
  isPastDate,
  isToday,
  isTomorrow,
  isYesterday,
} from './selectedDate';

const TODAY = DayDate.create('2026-08-04');

describe('selected date helpers', () => {
  it('moves to the previous and next calendar day', () => {
    expect(addDays(TODAY, -1).toString()).toBe('2026-08-03');
    expect(addDays(TODAY, 1).toString()).toBe('2026-08-05');
  });

  it('moves across month and year boundaries', () => {
    expect(addDays(DayDate.create('2026-08-31'), 1).toString()).toBe('2026-09-01');
    expect(addDays(DayDate.create('2026-01-01'), -1).toString()).toBe('2025-12-31');
    expect(addDays(DayDate.create('2026-12-31'), 1).toString()).toBe('2027-01-01');
  });

  it('handles leap years', () => {
    expect(addDays(DayDate.create('2024-02-28'), 1).toString()).toBe('2024-02-29');
    expect(addDays(DayDate.create('2024-02-29'), 1).toString()).toBe('2024-03-01');
  });

  it('compares past, current and future dates', () => {
    const yesterday = DayDate.create('2026-08-03');
    const tomorrow = DayDate.create('2026-08-05');

    expect(compareDayDates(yesterday, TODAY)).toBe(-1);
    expect(compareDayDates(TODAY, TODAY)).toBe(0);
    expect(compareDayDates(tomorrow, TODAY)).toBe(1);
    expect(isPastDate(yesterday, TODAY)).toBe(true);
    expect(isPastDate(tomorrow, TODAY)).toBe(false);
    expect(isToday(TODAY, TODAY)).toBe(true);
    expect(isTomorrow(tomorrow, TODAY)).toBe(true);
    expect(isYesterday(yesterday, TODAY)).toBe(true);
  });

  it('formats relative and other dates explicitly in Russian', () => {
    expect(formatSelectedDateTitle(TODAY, TODAY)).toBe('Сегодня');
    expect(formatSelectedDateTitle(DayDate.create('2026-08-05'), TODAY)).toBe('Завтра');
    expect(formatSelectedDateTitle(DayDate.create('2026-08-03'), TODAY)).toBe('Вчера');
    expect(formatSelectedDateTitle(DayDate.create('2026-08-08'), TODAY)).toBe('8 августа 2026');
    expect(formatSelectedDateWeekday(DayDate.create('2026-08-08'))).toBe('Суббота');
  });
});
