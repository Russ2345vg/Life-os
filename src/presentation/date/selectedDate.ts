import { DayDate } from '../../domain';

const RUSSIAN_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const RUSSIAN_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  timeZone: 'UTC',
});

export function addDays(date: DayDate, amount: number): DayDate {
  const value = toUtcDate(date);
  value.setUTCDate(value.getUTCDate() + amount);

  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

export function compareDayDates(left: DayDate, right: DayDate): number {
  return left.isBefore(right) ? -1 : left.isAfter(right) ? 1 : 0;
}

export function isPastDate(date: DayDate, currentDate: DayDate): boolean {
  return compareDayDates(date, currentDate) < 0;
}

export function isToday(date: DayDate, currentDate: DayDate): boolean {
  return compareDayDates(date, currentDate) === 0;
}

export function isTomorrow(date: DayDate, currentDate: DayDate): boolean {
  return date.equals(addDays(currentDate, 1));
}

export function isYesterday(date: DayDate, currentDate: DayDate): boolean {
  return date.equals(addDays(currentDate, -1));
}

export function formatSelectedDateTitle(date: DayDate, currentDate: DayDate): string {
  if (isToday(date, currentDate)) {
    return 'Сегодня';
  }

  if (isTomorrow(date, currentDate)) {
    return 'Завтра';
  }

  if (isYesterday(date, currentDate)) {
    return 'Вчера';
  }

  return RUSSIAN_DATE_FORMATTER.format(toUtcDate(date)).replace(/ г\.$/, '');
}

export function formatSelectedDateWeekday(date: DayDate): string {
  const weekday = RUSSIAN_WEEKDAY_FORMATTER.format(toUtcDate(date));
  return `${weekday.charAt(0).toLocaleUpperCase('ru-RU')}${weekday.slice(1)}`;
}

function toUtcDate(date: DayDate): Date {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}
