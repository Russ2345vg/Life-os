import { removeSpan, type TemporalExtraction } from './TemporalExtraction';

const hours = [
  'ноль',
  'час',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
  'двадцать',
  'двадцать один',
  'двадцать два',
  'двадцать три',
];
const words = [...hours].sort((a, b) => b.length - a.length).join('|');
const pattern = new RegExp(
  `(?:^|\\s)(?:или\\s+)?в\\s+(\\d{1,2}(?::\\d{2})?|${words})(?:\\s+(утра|дня|вечера|ночи))?(?=\\s|$|[,!?])`,
  'giu',
);
export function parseRussianCommandTime(text: string): TemporalExtraction {
  const malformed = new RegExp(
    `(?:^|\\s)(?:или\\s+)?в\\s+(?:\\d{1,2}:\\d+(?=\\s|$)|(?:${words})\\s+(?:тридцать|сорок|пятьдесят)(?:\\s+минут)?(?=\\s|$))`,
    'giu',
  );
  const unclear = [...text.matchAll(malformed)].filter(
    (match) => !/^\s*(?:или\s+)?в \d{1,2}:\d{2}$/iu.test(match[0]),
  );
  if (unclear.length) {
    let title = text;
    for (const match of [...unclear].reverse())
      title = removeSpan(title, match.index, match[0].length);
    return { title, issue: 'Не удалось определить точное время. Укажите его в формате «в 10:30».' };
  }
  const matches = [...text.matchAll(pattern)];
  const vague = [
    ...text.matchAll(/(?:^|\s)(?:или\s+)?(утром|днём|днем|вечером|ночью)(?=\s|$|[,!?])/giu),
  ];
  const all = [...matches, ...vague].sort((a, b) => b.index - a.index);
  let title = text;
  for (const match of all) title = removeSpan(title, match.index, match[0].length);
  if (all.length > 1)
    return { title, issue: 'Названо несколько вариантов времени. Укажите одно время.' };
  if (vague.length)
    return {
      title,
      issue: 'Укажите точное время, например «в 11 утра». Время суток не задаёт точный час.',
    };
  if (!matches.length) return { title };
  const match = matches[0]!;
  const raw = match[1]!.toLocaleLowerCase('ru-RU');
  let hour = /^\d/u.test(raw) ? Number(raw.split(':')[0]) : hours.indexOf(raw);
  const minute = raw.includes(':') ? Number(raw.split(':')[1]) : 0;
  const period = match[2]?.toLocaleLowerCase('ru-RU');
  if (hour > 23 || minute > 59 || (period && (hour < 1 || hour > 12)))
    return { title, issue: 'Некорректное время. Укажите часы от 0 до 23 и минуты от 00 до 59.' };
  if (period === 'вечера' || period === 'дня') hour = (hour % 12) + 12;
  if ((period === 'утра' || period === 'ночи') && hour === 12) hour = 0;
  return { title, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}
