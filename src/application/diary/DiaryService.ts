import {
  completeDiaryEntry,
  createDiaryDraft,
  diaryPeriod,
  reviseDiaryEntry,
  DayDate,
  type DiaryDayEntry,
  type DiaryDayPayload,
  type DiaryEntry,
  type DiaryMonthEntry,
  type DiaryMonthPayload,
  type DiaryPeriodKind,
  type DiaryWeekEntry,
  type DiaryWeekPayload,
} from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DiaryRepository } from '../ports/DiaryRepository';
import type { PlanningRepository } from '../ports/PlanningRepository';
import { buildDiaryMonthPlanningFacts, buildDiaryWeekPlanningFacts } from './DiaryPlanningFacts';
import {
  inclusiveDays,
  monthDiaryWeekBuckets,
  monthWeeklyReflections,
  summarizeDiaryRatings,
} from './DiarySummary';

interface SaveDiaryBase<K extends DiaryPeriodKind, P> {
  readonly kind: K;
  readonly anchor: DayDate;
  readonly payload: P;
  readonly expectedVersion: number | null;
}

export type SaveDiaryInput =
  | SaveDiaryBase<'day', DiaryDayPayload>
  | SaveDiaryBase<'week', DiaryWeekPayload>
  | SaveDiaryBase<'month', DiaryMonthPayload>;

export interface DiaryWeekOverview {
  readonly period: ReturnType<typeof diaryPeriod<'week'>>;
  readonly entry: DiaryWeekEntry | null;
  readonly summary: ReturnType<typeof summarizeDiaryRatings>;
  readonly planning: ReturnType<typeof buildDiaryWeekPlanningFacts>;
}

export interface DiaryMonthOverview {
  readonly period: ReturnType<typeof diaryPeriod<'month'>>;
  readonly entry: DiaryMonthEntry | null;
  readonly summary: ReturnType<typeof summarizeDiaryRatings>;
  readonly weekBuckets: ReturnType<typeof monthDiaryWeekBuckets>;
  readonly weeklyReflections: ReturnType<typeof monthWeeklyReflections>;
  readonly planning: ReturnType<typeof buildDiaryMonthPlanningFacts>;
}

export interface DiaryService {
  get(kind: DiaryPeriodKind, anchor: DayDate): Promise<DiaryEntry | null>;
  saveDraft(input: SaveDiaryInput): Promise<DiaryEntry>;
  complete(input: SaveDiaryInput): Promise<DiaryEntry>;
  getWeekOverview(anchor: DayDate): Promise<DiaryWeekOverview>;
  getMonthOverview(anchor: DayDate): Promise<DiaryMonthOverview>;
}

export class DiaryApplicationService implements DiaryService {
  public constructor(
    private readonly repository: DiaryRepository,
    private readonly clock: Clock,
    private readonly currentDate: CurrentDateProvider,
    private readonly planning: PlanningRepository,
  ) {}

  public async get(kind: DiaryPeriodKind, anchor: DayDate): Promise<DiaryEntry | null> {
    const period = this.allowedPeriod(kind, anchor);
    return this.repository.findByPeriodKey(period.periodKey);
  }

  public async saveDraft(input: SaveDiaryInput): Promise<DiaryEntry> {
    return this.save(input, false);
  }

  public async complete(input: SaveDiaryInput): Promise<DiaryEntry> {
    return this.save(input, true);
  }

  public async getWeekOverview(anchor: DayDate): Promise<DiaryWeekOverview> {
    const period = this.allowedPeriod('week', anchor);
    const [entry, days, planning] = await Promise.all([
      this.repository.findByPeriodKey(period.periodKey),
      this.repository.listCompleted('day', period.periodStart, period.periodEnd),
      this.planning.read(),
    ]);
    return {
      period,
      entry: asWeek(entry),
      summary: summarizeDiaryRatings(days.filter(isDay), 7),
      planning: buildDiaryWeekPlanningFacts(
        planning,
        period.periodStart,
        this.currentDate.getCurrentDate(),
      ),
    };
  }

  public async getMonthOverview(anchor: DayDate): Promise<DiaryMonthOverview> {
    const period = this.allowedPeriod('month', anchor);
    const reflectionStart = DayDate.create(addDays(period.periodStart.toString(), -6));
    const [entry, days, weeks, planning] = await Promise.all([
      this.repository.findByPeriodKey(period.periodKey),
      this.repository.listCompleted('day', period.periodStart, period.periodEnd),
      this.repository.listCompleted('week', reflectionStart, period.periodEnd),
      this.planning.read(),
    ]);
    const dayEntries = days.filter(isDay);
    return {
      period,
      entry: asMonth(entry),
      summary: summarizeDiaryRatings(
        dayEntries,
        inclusiveDays(period.periodStart.toString(), period.periodEnd.toString()),
      ),
      weekBuckets: monthDiaryWeekBuckets(period, dayEntries),
      weeklyReflections: monthWeeklyReflections(period, weeks.filter(isWeek)),
      planning: buildDiaryMonthPlanningFacts(
        planning,
        period.periodStart,
        this.currentDate.getCurrentDate(),
      ),
    };
  }

  private async save(input: SaveDiaryInput, markCompleted: boolean): Promise<DiaryEntry> {
    const period = this.allowedPeriod(input.kind, input.anchor);
    const existing = await this.repository.findByPeriodKey(period.periodKey);
    const base = existing ?? createDiaryDraft(period, this.clock.now());
    const revised = reviseDiaryEntry(base, input.payload, this.clock.now());
    const value = markCompleted ? completeDiaryEntry(revised, this.clock.now()) : revised;
    return this.repository.save(value, input.expectedVersion);
  }

  private allowedPeriod<K extends DiaryPeriodKind>(kind: K, anchor: DayDate) {
    const period = diaryPeriod(kind, anchor);
    if (period.periodStart.isAfter(this.currentDate.getCurrentDate()))
      throw new DomainError('diary.future_period', 'Будущий период дневника пока недоступен.');
    return period;
  }
}

function isDay(entry: DiaryEntry): entry is DiaryDayEntry {
  return entry.kind === 'day';
}

function isWeek(entry: DiaryEntry): entry is DiaryWeekEntry {
  return entry.kind === 'week';
}

function asWeek(entry: DiaryEntry | null): DiaryWeekEntry | null {
  return entry === null ? null : isWeek(entry) ? entry : invalidKind();
}

function asMonth(entry: DiaryEntry | null): DiaryMonthEntry | null {
  return entry === null ? null : entry.kind === 'month' ? entry : invalidKind();
}

function invalidKind(): never {
  throw new DomainError(
    'diary.period_kind_mismatch',
    'Запись дневника относится к другому периоду.',
  );
}
