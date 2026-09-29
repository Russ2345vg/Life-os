import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { addDays, automaticPeriod } from '../planner/PlanningPeriod';
import { EntityId } from '../shared/EntityId';

export type DiaryPeriodKind = 'day' | 'week' | 'month';
export type DiaryEntryStatus = 'draft' | 'completed';
export type DiaryRating = 1 | 2 | 3 | 4 | 5;

export interface DiaryPeriod<K extends DiaryPeriodKind = DiaryPeriodKind> {
  readonly kind: K;
  readonly periodStart: DayDate;
  readonly periodEnd: DayDate;
  readonly periodKey: string;
  readonly id: EntityId;
}

export interface DiaryRatings {
  readonly productivity: DiaryRating | null;
  readonly energy: DiaryRating | null;
  readonly mood: DiaryRating | null;
  readonly overall: DiaryRating | null;
}

export interface DiaryDayPayload extends DiaryRatings {
  readonly worldBetter: string | null;
  readonly energyReflection: string | null;
  readonly tomorrowReflection: string | null;
  readonly note: string | null;
}

export interface DiaryWeekPayload {
  readonly learned: string | null;
  readonly biggestAchievement: string | null;
  readonly memorableMoments: string | null;
  readonly energyReflection: string | null;
  readonly nextWeek: string | null;
}

export interface DiaryMonthPayload {
  readonly biggestAchievement: string | null;
  readonly learnedAboutSelf: string | null;
  readonly memorableMoments: string | null;
  readonly energyAndMood: string | null;
  readonly nextMonth: string | null;
}

interface DiaryEntryBase<K extends DiaryPeriodKind, P> extends DiaryPeriod<K> {
  readonly status: DiaryEntryStatus;
  readonly promptVersion: 1;
  readonly payload: P;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export type DiaryDayEntry = DiaryEntryBase<'day', DiaryDayPayload>;
export type DiaryWeekEntry = DiaryEntryBase<'week', DiaryWeekPayload>;
export type DiaryMonthEntry = DiaryEntryBase<'month', DiaryMonthPayload>;
export type DiaryEntry = DiaryDayEntry | DiaryWeekEntry | DiaryMonthEntry;
export type DiaryPayload = DiaryDayPayload | DiaryWeekPayload | DiaryMonthPayload;

export type DiaryEntryByKind<K extends DiaryPeriodKind> = K extends 'day'
  ? DiaryDayEntry
  : K extends 'week'
    ? DiaryWeekEntry
    : DiaryMonthEntry;

export type DiaryPayloadByKind<K extends DiaryPeriodKind> = K extends 'day'
  ? DiaryDayPayload
  : K extends 'week'
    ? DiaryWeekPayload
    : DiaryMonthPayload;

const ANSWER_LIMIT = 4_000;
const NOTE_LIMIT = 12_000;

export function diaryPeriod<K extends DiaryPeriodKind>(kind: K, anchor: DayDate): DiaryPeriod<K> {
  const date = anchor.toString();
  const periodStart =
    kind === 'week'
      ? automaticPeriod('week', date).startDate
      : kind === 'month'
        ? `${date.slice(0, 7)}-01`
        : date;
  const periodEnd =
    kind === 'week'
      ? addDays(periodStart, 6)
      : kind === 'month'
        ? monthEnd(periodStart)
        : periodStart;
  return {
    kind,
    periodStart: DayDate.create(periodStart),
    periodEnd: DayDate.create(periodEnd),
    periodKey: `${kind}:${periodStart}`,
    id: EntityId.create(`diary:${kind}:${periodStart}`),
  };
}

export function createDiaryDraft<K extends DiaryPeriodKind>(
  period: DiaryPeriod<K>,
  now: Date,
): DiaryEntryByKind<K> {
  const timestamp = isoTimestamp(now);
  const payload = emptyPayload(period.kind);
  return validateDiaryEntry({
    ...period,
    status: 'draft',
    promptVersion: 1,
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 0,
  }) as DiaryEntryByKind<K>;
}

export function reviseDiaryEntry(
  entry: DiaryDayEntry,
  payload: DiaryDayPayload,
  now: Date,
): DiaryDayEntry;
export function reviseDiaryEntry(
  entry: DiaryWeekEntry,
  payload: DiaryWeekPayload,
  now: Date,
): DiaryWeekEntry;
export function reviseDiaryEntry(
  entry: DiaryMonthEntry,
  payload: DiaryMonthPayload,
  now: Date,
): DiaryMonthEntry;
export function reviseDiaryEntry(entry: DiaryEntry, payload: DiaryPayload, now: Date): DiaryEntry;
export function reviseDiaryEntry(entry: DiaryEntry, payload: DiaryPayload, now: Date): DiaryEntry {
  const updatedAt = nextTimestamp(entry.updatedAt, now);
  return validateDiaryEntry({
    ...entry,
    status: 'draft',
    payload: normalizePayload(entry.kind, payload),
    updatedAt,
  });
}

export function completeDiaryEntry(entry: DiaryDayEntry, now: Date): DiaryDayEntry;
export function completeDiaryEntry(entry: DiaryWeekEntry, now: Date): DiaryWeekEntry;
export function completeDiaryEntry(entry: DiaryMonthEntry, now: Date): DiaryMonthEntry;
export function completeDiaryEntry(entry: DiaryEntry, now: Date): DiaryEntry;
export function completeDiaryEntry(entry: DiaryEntry, now: Date): DiaryEntry {
  const updatedAt = nextTimestamp(entry.updatedAt, now);
  return validateDiaryEntry({ ...entry, status: 'completed', updatedAt });
}

export function validateDiaryEntry(
  value: unknown,
  options: { readonly persisted?: boolean } = {},
): DiaryEntry {
  if (!isRecord(value)) throw invalidEntry();
  const kind = value.kind;
  if (kind !== 'day' && kind !== 'week' && kind !== 'month') throw invalidEntry();
  if (!(value.id instanceof EntityId)) throw invalidEntry();
  if (!(value.periodStart instanceof DayDate) || !(value.periodEnd instanceof DayDate))
    throw invalidEntry();
  if (value.status !== 'draft' && value.status !== 'completed') throw invalidEntry();
  if (value.promptVersion !== 1) throw invalidEntry();
  if (!Number.isInteger(value.version) || Number(value.version) < (options.persisted ? 1 : 0))
    throw invalidEntry();
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string')
    throw invalidEntry();
  const createdAt = Date.parse(value.createdAt);
  const updatedAt = Date.parse(value.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt)
    throw invalidEntry();

  const expected = diaryPeriod(kind, value.periodStart);
  if (
    value.id.toString() !== expected.id.toString() ||
    value.periodKey !== expected.periodKey ||
    !value.periodStart.equals(expected.periodStart) ||
    !value.periodEnd.equals(expected.periodEnd)
  )
    throw invalidEntry();

  const payload = normalizePayload(kind, value.payload);
  if (value.status === 'completed') assertCanComplete(kind, payload);
  return { ...value, kind, payload } as DiaryEntry;
}

function emptyPayload(kind: DiaryPeriodKind): DiaryPayload {
  if (kind === 'day')
    return {
      productivity: null,
      energy: null,
      mood: null,
      overall: null,
      worldBetter: null,
      energyReflection: null,
      tomorrowReflection: null,
      note: null,
    };
  if (kind === 'week')
    return {
      learned: null,
      biggestAchievement: null,
      memorableMoments: null,
      energyReflection: null,
      nextWeek: null,
    };
  return {
    biggestAchievement: null,
    learnedAboutSelf: null,
    memorableMoments: null,
    energyAndMood: null,
    nextMonth: null,
  };
}

function normalizePayload(kind: 'day', value: unknown): DiaryDayPayload;
function normalizePayload(kind: 'week', value: unknown): DiaryWeekPayload;
function normalizePayload(kind: 'month', value: unknown): DiaryMonthPayload;
function normalizePayload(kind: DiaryPeriodKind, value: unknown): DiaryPayload;
function normalizePayload(kind: DiaryPeriodKind, value: unknown): DiaryPayload {
  if (!isRecord(value)) throw invalidEntry();
  if (kind === 'day')
    return {
      productivity: rating(value.productivity),
      energy: rating(value.energy),
      mood: rating(value.mood),
      overall: rating(value.overall),
      worldBetter: text(value.worldBetter, ANSWER_LIMIT),
      energyReflection: text(value.energyReflection, ANSWER_LIMIT),
      tomorrowReflection: text(value.tomorrowReflection, ANSWER_LIMIT),
      note: text(value.note, NOTE_LIMIT),
    };
  if (kind === 'week')
    return {
      learned: text(value.learned, ANSWER_LIMIT),
      biggestAchievement: text(value.biggestAchievement, ANSWER_LIMIT),
      memorableMoments: text(value.memorableMoments, ANSWER_LIMIT),
      energyReflection: text(value.energyReflection, ANSWER_LIMIT),
      nextWeek: text(value.nextWeek, ANSWER_LIMIT),
    };
  return {
    biggestAchievement: text(value.biggestAchievement, ANSWER_LIMIT),
    learnedAboutSelf: text(value.learnedAboutSelf, ANSWER_LIMIT),
    memorableMoments: text(value.memorableMoments, ANSWER_LIMIT),
    energyAndMood: text(value.energyAndMood, ANSWER_LIMIT),
    nextMonth: text(value.nextMonth, ANSWER_LIMIT),
  };
}

function assertCanComplete(kind: DiaryPeriodKind, payload: DiaryPayload): void {
  if (kind === 'day') {
    const ratings = payload as DiaryDayPayload;
    if (
      ratings.productivity === null ||
      ratings.energy === null ||
      ratings.mood === null ||
      ratings.overall === null
    )
      throw new DomainError(
        'diary.day_incomplete',
        'Чтобы завершить день, поставьте все четыре оценки.',
      );
    return;
  }
  if (!Object.values(payload).some((answer) => answer !== null))
    throw new DomainError(
      'diary.reflection_incomplete',
      'Чтобы завершить итог, ответьте хотя бы на один вопрос.',
    );
}

function rating(value: unknown): DiaryRating | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) throw invalidEntry();
  return value as DiaryRating;
}

function text(value: unknown, limit: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw invalidEntry();
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > limit) throw invalidEntry();
  return normalized;
}

function nextTimestamp(current: string, now: Date): string {
  const timestamp = isoTimestamp(now);
  if (timestamp < current)
    throw new DomainError('diary.invalid_time', 'Время изменения записи указано неверно.');
  return timestamp;
}

function isoTimestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw invalidEntry();
  return value.toISOString();
}

function monthEnd(monthStart: string): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (days === undefined) throw invalidEntry();
  return DayDate.fromParts(year, month, days).toString();
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidEntry(): DomainError {
  return new DomainError('diary.invalid_entry', 'Запись дневника содержит некорректные данные.');
}
