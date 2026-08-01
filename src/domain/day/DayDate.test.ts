import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from './DayDate';

describe('DayDate', () => {
  it('создаёт календарную дату в формате YYYY-MM-DD', () => {
    const date = DayDate.create('2026-08-01');

    expect(date.toString()).toBe('2026-08-01');
    expect(DayDate.fromParts(2026, 8, 1).toString()).toBe('2026-08-01');
  });

  it.each(['2026-8-01', '01-08-2026', '2026/08/01', ' 2026-08-01', '2026-08-01 '])(
    'отклоняет неправильный формат: %s',
    (value) => {
      expect(() => DayDate.create(value)).toThrow(DomainError);
    },
  );

  it('отклоняет несуществующий календарный день', () => {
    expect(() => DayDate.create('2026-02-30')).toThrowError(
      expect.objectContaining({ code: 'day_date.invalid_value' }),
    );
    expect(() => DayDate.fromParts(2026, 13, 1)).toThrow(DomainError);
  });

  it('корректно обрабатывает високосные годы', () => {
    expect(DayDate.create('2024-02-29').toString()).toBe('2024-02-29');
    expect(DayDate.create('2000-02-29').toString()).toBe('2000-02-29');
    expect(() => DayDate.create('2100-02-29')).toThrow(DomainError);
  });

  it('сравнивает даты в календарном порядке', () => {
    const earlier = DayDate.create('2026-07-31');
    const later = DayDate.create('2026-08-01');

    expect(earlier.isBefore(later)).toBe(true);
    expect(later.isAfter(earlier)).toBe(true);
    expect(earlier.isAfter(later)).toBe(false);
  });

  it('сравнивает даты по значению', () => {
    expect(DayDate.create('2026-08-01').equals(DayDate.fromParts(2026, 8, 1))).toBe(true);
    expect(DayDate.create('2026-08-01').equals(DayDate.create('2026-08-02'))).toBe(false);
  });
});
