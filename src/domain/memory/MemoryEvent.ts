import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { diaryPeriod, type DiaryPeriodKind } from '../diary/DiaryEntry';
import { EntityId } from '../shared/EntityId';
import { validateMemoryPhoto, type MemoryPhoto } from './MemoryPhoto';

export type MemoryKind = 'moment' | 'achievement' | 'trip' | 'decision' | 'insight';
export const MEMORY_KINDS: readonly MemoryKind[] = [
  'moment',
  'achievement',
  'trip',
  'decision',
  'insight',
];
export type DiaryMemoryField =
  | 'worldBetter'
  | 'energyReflection'
  | 'tomorrowReflection'
  | 'note'
  | 'learned'
  | 'biggestAchievement'
  | 'memorableMoments'
  | 'nextWeek'
  | 'learnedAboutSelf'
  | 'energyAndMood'
  | 'nextMonth';

export const DIARY_MEMORY_FIELDS: Readonly<Record<DiaryPeriodKind, readonly DiaryMemoryField[]>> = {
  day: ['worldBetter', 'energyReflection', 'tomorrowReflection', 'note'],
  week: ['learned', 'biggestAchievement', 'memorableMoments', 'energyReflection', 'nextWeek'],
  month: [
    'biggestAchievement',
    'learnedAboutSelf',
    'memorableMoments',
    'energyAndMood',
    'nextMonth',
  ],
};

export interface MemoryContext {
  readonly sphereId: string | null;
  readonly sphereTitle: string | null;
  readonly directionId: string | null;
  readonly directionTitle: string | null;
  readonly goalId: string | null;
  readonly goalTitle: string | null;
}

export interface MemoryDiarySource {
  readonly entryId: string;
  readonly kind: DiaryPeriodKind;
  readonly periodStart: string;
  readonly field: DiaryMemoryField;
  readonly version: number;
}

export interface MemoryDraft {
  readonly id: EntityId;
  readonly occurredOn: DayDate;
  readonly title: string;
  readonly body: string;
  readonly kind: MemoryKind;
  readonly isHighlight: boolean;
  readonly context: MemoryContext | null;
  readonly diarySource: MemoryDiarySource | null;
  readonly photo: MemoryPhoto | null;
}

export interface MemoryEvent extends MemoryDraft {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly version: number;
}

export type MemoryEventSummary = Omit<MemoryEvent, 'photo'> & { readonly hasPhoto: boolean };

export function createMemoryEvent(draft: MemoryDraft, now: Date): MemoryEvent {
  const timestamp = now.toISOString();
  return validateMemoryEvent({
    ...draft,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 0,
  });
}

export function validateMemoryEvent(
  value: unknown,
  options: { readonly persisted?: boolean } = {},
): MemoryEvent {
  if (!isRecord(value) || !(value.id instanceof EntityId) || !(value.occurredOn instanceof DayDate))
    throw invalidEvent();
  const title = text(value.title, 160);
  if (
    !title ||
    typeof value.isHighlight !== 'boolean' ||
    !MEMORY_KINDS.includes(value.kind as MemoryKind) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < (options.persisted ? 1 : 0)
  )
    throw invalidEvent();
  const createdAt = timestamp(value.createdAt);
  const updatedAt = timestamp(value.updatedAt);
  const deletedAt = value.deletedAt === null ? null : timestamp(value.deletedAt);
  if (
    updatedAt < createdAt ||
    (deletedAt !== null && (deletedAt < createdAt || deletedAt > updatedAt))
  )
    throw invalidEvent();
  return {
    id: value.id,
    occurredOn: value.occurredOn,
    title,
    body: text(value.body, 10000),
    kind: value.kind as MemoryKind,
    isHighlight: value.isHighlight,
    context: context(value.context),
    diarySource: source(value.diarySource),
    photo: value.photo === null ? null : validateMemoryPhoto(value.photo),
    createdAt,
    updatedAt,
    deletedAt,
    version: Number(value.version),
  };
}

export function summarizeMemoryEvent(
  event: MemoryEvent,
  hasPhoto = event.photo !== null,
): MemoryEventSummary {
  return {
    id: event.id,
    occurredOn: event.occurredOn,
    title: event.title,
    body: event.body,
    kind: event.kind,
    isHighlight: event.isHighlight,
    context: event.context,
    diarySource: event.diarySource,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    deletedAt: event.deletedAt,
    version: event.version,
    hasPhoto,
  };
}

/** The user's content is independent of versions and command timestamps. */
export function sameMemoryContent(left: MemoryEvent, right: MemoryEvent): boolean {
  const content = (event: MemoryEvent) => ({
    id: event.id.toString(),
    occurredOn: event.occurredOn.toString(),
    title: event.title,
    body: event.body,
    kind: event.kind,
    isHighlight: event.isHighlight,
    context: event.context,
    diarySource: event.diarySource,
    photo: event.photo,
    deletedAt: event.deletedAt,
  });
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}

function context(value: unknown): MemoryContext | null {
  if (value === null) return null;
  if (!isRecord(value)) throw invalidEvent();
  const nullable = (field: string) =>
    value[field] === null ? null : text(value[field], 1000) || invalidEventThrow();
  return {
    sphereId: nullable('sphereId'),
    sphereTitle: nullable('sphereTitle'),
    directionId: nullable('directionId'),
    directionTitle: nullable('directionTitle'),
    goalId: nullable('goalId'),
    goalTitle: nullable('goalTitle'),
  };
}

function source(value: unknown): MemoryDiarySource | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    (value.kind !== 'day' && value.kind !== 'week' && value.kind !== 'month') ||
    typeof value.field !== 'string' ||
    !DIARY_MEMORY_FIELDS[value.kind].includes(value.field as DiaryMemoryField) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1
  )
    throw invalidEvent();
  const periodStart = text(value.periodStart, 10);
  const period = diaryPeriod(value.kind, DayDate.create(periodStart));
  if (period.periodStart.toString() !== periodStart || value.entryId !== period.id.toString())
    throw invalidEvent();
  return {
    entryId: period.id.toString(),
    kind: value.kind,
    periodStart,
    field: value.field as DiaryMemoryField,
    version: Number(value.version),
  };
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.trim().length > limit) throw invalidEvent();
  return value.trim();
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw invalidEvent();
  return new Date(value).toISOString();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalidEventThrow(): never {
  throw invalidEvent();
}
function invalidEvent(): DomainError {
  return new DomainError(
    'memory.invalid_event',
    'Проверьте название, дату и содержимое воспоминания.',
  );
}
