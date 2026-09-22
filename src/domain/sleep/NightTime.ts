export interface NightWindowInput {
  readonly cycleDate: string;
  readonly bedtime: string;
  readonly wakeTime: string;
  readonly timeZone: string;
}

export interface NightWindow {
  readonly plannedSleepAt: Date;
  readonly plannedWakeAt: Date;
}

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface CivilDateTime extends CivilDate {
  readonly hour: number;
  readonly minute: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MINUTE_MS = 60_000;

export function calculateNightWindow(input: NightWindowInput): NightWindow {
  const cycleDate = parseCivilDate(input.cycleDate);
  const bedtime = parseTime(input.bedtime);
  const wakeTime = parseTime(input.wakeTime);
  const sleepDayOffset = bedtime.totalMinutes < wakeTime.totalMinutes ? 1 : 0;

  return {
    plannedSleepAt: resolveLocalDateTime(
      {
        ...addCivilDays(cycleDate, sleepDayOffset),
        hour: bedtime.hour,
        minute: bedtime.minute,
      },
      input.timeZone,
    ),
    plannedWakeAt: resolveLocalDateTime(
      {
        ...addCivilDays(cycleDate, 1),
        hour: wakeTime.hour,
        minute: wakeTime.minute,
      },
      input.timeZone,
    ),
  };
}

export function resolveSleepCycleDate(now: Date, timeZone: string, wakeTime: string): string {
  if (Number.isNaN(now.getTime())) throw new TypeError('Текущее время некорректно.');
  const wake = parseTime(wakeTime);
  const local = formatLocal(now, createFormatter(timeZone));
  const date =
    local.hour * 60 + local.minute < wake.totalMinutes
      ? addCivilDays(local, -1)
      : { year: local.year, month: local.month, day: local.day };
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function parseCivilDate(value: string): CivilDate {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new TypeError('Дата ночного цикла должна иметь формат YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new TypeError('Дата ночного цикла не существует.');
  }
  return { year, month, day };
}

function parseTime(value: string): { hour: number; minute: number; totalMinutes: number } {
  const match = TIME_PATTERN.exec(value);
  if (match === null) throw new TypeError('Локальное время должно иметь формат HH:mm.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new TypeError('Локальное время не существует.');
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

function resolveLocalDateTime(target: CivilDateTime, timeZone: string): Date {
  const formatter = createFormatter(timeZone);
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  let firstExistingAfter: Date | null = null;

  for (let offsetMinutes = -18 * 60; offsetMinutes <= 42 * 60; offsetMinutes += 1) {
    const candidate = new Date(naiveUtc + offsetMinutes * MINUTE_MS);
    const local = formatLocal(candidate, formatter);
    const comparison = compareCivilDateTime(local, target);
    if (comparison === 0) return candidate;
    if (comparison > 0 && firstExistingAfter === null) firstExistingAfter = candidate;
  }

  if (firstExistingAfter !== null) return firstExistingAfter;
  throw new RangeError(`Не удалось разрешить локальное время в зоне ${timeZone}.`);
}

function createFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch (error: unknown) {
    throw new TypeError(`Неизвестная часовая зона: ${timeZone}.`, { cause: error });
  }
}

function formatLocal(date: Date, formatter: Intl.DateTimeFormat): CivilDateTime {
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: requiredPart(values, 'year'),
    month: requiredPart(values, 'month'),
    day: requiredPart(values, 'day'),
    hour: requiredPart(values, 'hour'),
    minute: requiredPart(values, 'minute'),
  };
}

function requiredPart(parts: ReadonlyMap<string, number>, name: string): number {
  const value = parts.get(name);
  if (value === undefined || Number.isNaN(value)) {
    throw new RangeError(`Intl не вернул компонент локального времени: ${name}.`);
  }
  return value;
}

function compareCivilDateTime(left: CivilDateTime, right: CivilDateTime): number {
  const leftValue = [left.year, left.month, left.day, left.hour, left.minute];
  const rightValue = [right.year, right.month, right.day, right.hour, right.minute];
  for (let index = 0; index < leftValue.length; index += 1) {
    const difference = leftValue[index]! - rightValue[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}
