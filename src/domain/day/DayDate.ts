import { DomainError } from '../../shared/errors/DomainError';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DayDate {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): DayDate {
    const match = DATE_PATTERN.exec(value);

    if (match === null) {
      throw new DomainError(
        'day_date.invalid_format',
        'Дата дня должна соответствовать формату YYYY-MM-DD.',
      );
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    DayDate.assertValidParts(year, month, day);

    return new DayDate(value);
  }

  public static fromParts(year: number, month: number, day: number): DayDate {
    DayDate.assertValidParts(year, month, day);

    const value = `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    return new DayDate(value);
  }

  public equals(other: DayDate): boolean {
    return this.#value === other.#value;
  }

  public isBefore(other: DayDate): boolean {
    return this.#value < other.#value;
  }

  public isAfter(other: DayDate): boolean {
    return this.#value > other.#value;
  }

  public toString(): string {
    return this.#value;
  }

  private static assertValidParts(year: number, month: number, day: number): void {
    if (!Number.isInteger(year) || year < 1 || year > 9999) {
      throw new DomainError('day_date.invalid_value', 'Год должен быть целым числом от 1 до 9999.');
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new DomainError('day_date.invalid_value', 'Месяц должен быть целым числом от 1 до 12.');
    }

    const daysInMonth = DayDate.getDaysInMonth(year, month);

    if (!Number.isInteger(day) || day < 1 || day > daysInMonth) {
      throw new DomainError('day_date.invalid_value', 'День не существует в указанном месяце.');
    }
  }

  private static getDaysInMonth(year: number, month: number): number {
    const daysByMonth = [
      31,
      DayDate.isLeapYear(year) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    const days = daysByMonth[month - 1];

    if (days === undefined) {
      throw new DomainError('day_date.invalid_value', 'Неизвестный месяц.');
    }

    return days;
  }

  private static isLeapYear(year: number): boolean {
    return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  }
}
