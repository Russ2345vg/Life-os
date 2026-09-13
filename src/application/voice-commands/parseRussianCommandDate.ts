import { DayDate } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

const months = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const ordinals: Readonly<Record<string, number>> = {
  первого: 1,
  второго: 2,
  третьего: 3,
  четвертого: 4,
  пятого: 5,
  шестого: 6,
  седьмого: 7,
  восьмого: 8,
  девятого: 9,
  десятого: 10,
  одиннадцатого: 11,
  двенадцатого: 12,
  тринадцатого: 13,
  четырнадцатого: 14,
  пятнадцатого: 15,
  шестнадцатого: 16,
  семнадцатого: 17,
  восемнадцатого: 18,
  девятнадцатого: 19,
  двадцатого: 20,
  тридцатого: 30,
};

import { removeSpan, type TemporalExtraction } from './TemporalExtraction';
function dayNumber(value: string): number {
  if (/^\d{1,2}$/.test(value)) return Number(value);
  if (Object.hasOwn(ordinals, value)) return ordinals[value]!;
  const match =
    /^(двадцать|тридцать) (первого|второго|третьего|четвертого|пятого|шестого|седьмого|восьмого|девятого)$/.exec(
      value,
    );
  if (match) return (match[1] === 'двадцать' ? 20 : 30) + ordinals[match[2]!]!;
  throw new DomainError('voice_command.date_unclear', 'Укажите дату числом и месяцем.');
}

const weekdays = [
  'понедельник',
  'вторник',
  'среду',
  'четверг',
  'пятницу',
  'субботу',
  'воскресенье',
];
const dayWords = `(?:двадцать |тридцать )?(?:\\d{1,2}|${Object.keys(ordinals).join('|')})`;
const datePattern = new RegExp(
  `(?:^|\\s)(?:или\\s+)?(?:(?:на|до|к|в|во)\\s+)?(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\.\\d{1,2}(?:\\.\\d{4})?|(?:${dayWords}) (?:${months.join('|')})(?: \\d{4}(?: года)?)?|сегодня|завтра|послезавтра|вчера|позавчера|через (?:\\d+ (?:дня|день|дней)|неделю)|(?:(?:в|во) )?(?:следующую |следующий )?(?:${weekdays.join('|')}))(?=\\s|$|[,!?])`,
  'giu',
);

function calendar(today: DayDate): Date {
  const [y, m, d] = today.toString().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}
function offset(today: DayDate, days: number): string {
  const date = calendar(today);
  date.setUTCDate(date.getUTCDate() + days);
  return DayDate.fromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  ).toString();
}
function resolve(raw: string, today: DayDate): string {
  if (raw === 'сегодня') return today.toString();
  if (raw === 'завтра') return offset(today, 1);
  if (raw === 'послезавтра') return offset(today, 2);
  if (raw === 'вчера') return offset(today, -1);
  if (raw === 'позавчера') return offset(today, -2);
  if (raw.startsWith('через ')) {
    const days = raw === 'через неделю' ? 7 : Number(raw.split(' ')[1]);
    if (!Number.isSafeInteger(days) || days < 1 || days > 3660) throw new Error('Invalid interval');
    return offset(today, days);
  }
  const weekday = weekdays.findIndex((day) => raw.endsWith(day));
  if (weekday >= 0) {
    const current = (calendar(today).getUTCDay() + 6) % 7;
    return offset(
      today,
      raw.includes('следующ') ? 7 - current + weekday : (weekday - current + 7) % 7,
    );
  }
  if (/^\d{4}-/u.test(raw)) return DayDate.create(raw).toString();
  const numeric = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/u.exec(raw);
  if (numeric)
    return DayDate.fromParts(
      Number(numeric[3] ?? today.toString().slice(0, 4)),
      Number(numeric[2]),
      Number(numeric[1]),
    ).toString();
  const word = new RegExp(
    `^(${dayWords}) (${months.join('|')})(?: (\\d{4})(?: года)?)?$`,
    'u',
  ).exec(raw);
  if (!word) throw new Error('Invalid date');
  return DayDate.fromParts(
    Number(word[3] ?? today.toString().slice(0, 4)),
    months.indexOf(word[2]!) + 1,
    dayNumber(word[1]!),
  ).toString();
}

export function extractRussianCommandDate(body: string, today: DayDate): TemporalExtraction {
  const normalized = body.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
  const matches = [...normalized.matchAll(datePattern)];
  let title = body;
  for (const match of [...matches].reverse())
    title = removeSpan(title, match.index, match[0].length);
  if (matches.length > 1) return { title, issue: 'Названо несколько дат. Укажите одну дату.' };
  if (matches.length) {
    try {
      return { title, value: resolve(matches[0]![1]!, today) };
    } catch {
      return { title, issue: 'Некорректная дата. Укажите существующий день и месяц.' };
    }
  }
  if (
    /(?:^|\s)(?:через|на следующ|в следующ|в выходн)|\d[./-]\d/u.test(normalized) ||
    months.some((month) => normalized.includes(month))
  )
    return {
      title,
      issue: 'Не удалось определить дату. Укажите день и месяц или относительную дату.',
    };
  return { title };
}

/** Compatibility entry point for consumers needing a complete date. */
export function parseRussianCommandDate(
  body: string,
  today: DayDate,
): { readonly title: string; readonly date?: string } {
  const parsed = extractRussianCommandDate(body, today);
  if (parsed.issue) throw new DomainError('voice_command.date_unclear', parsed.issue);
  return { title: parsed.title, ...(parsed.value ? { date: parsed.value } : {}) };
}
