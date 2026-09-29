import type { DiaryDayEntry, DiaryPeriod, DiaryWeekEntry } from '../../domain';
import { addDays, automaticPeriod } from '../../domain/planner/PlanningPeriod';

export interface DiaryAverage {
  readonly value: number | null;
  readonly sampleCount: number;
}

export interface DiaryRatingSummary {
  readonly productivity: DiaryAverage;
  readonly energy: DiaryAverage;
  readonly mood: DiaryAverage;
  readonly overall: DiaryAverage;
  readonly completedDays: number;
  readonly totalDays: number;
}

export interface DiaryAverageComparison {
  readonly value: number | null;
  readonly sufficient: boolean;
}

export interface DiaryMonthWeekBucket {
  readonly startDate: string;
  readonly endDate: string;
  readonly summary: DiaryRatingSummary;
}

export function summarizeDiaryRatings(
  entries: readonly DiaryDayEntry[],
  totalDays: number,
): DiaryRatingSummary {
  const completed = entries.filter((entry) => entry.status === 'completed');
  return {
    productivity: average(completed.map((entry) => entry.payload.productivity)),
    energy: average(completed.map((entry) => entry.payload.energy)),
    mood: average(completed.map((entry) => entry.payload.mood)),
    overall: average(completed.map((entry) => entry.payload.overall)),
    completedDays: completed.length,
    totalDays,
  };
}

export function roundDiaryAverage(value: number): number {
  return Math.round(value * 10) / 10;
}

export function compareDiaryAverages(
  current: DiaryAverage,
  previous: DiaryAverage,
  minimumSamples = 3,
): DiaryAverageComparison {
  if (
    current.value === null ||
    previous.value === null ||
    current.sampleCount < minimumSamples ||
    previous.sampleCount < minimumSamples
  )
    return { value: null, sufficient: false };
  return { value: roundDiaryAverage(current.value - previous.value), sufficient: true };
}

export function monthDiaryWeekBuckets(
  month: DiaryPeriod<'month'>,
  entries: readonly DiaryDayEntry[],
): readonly DiaryMonthWeekBucket[] {
  const monthStart = month.periodStart.toString();
  const monthEnd = month.periodEnd.toString();
  const buckets: DiaryMonthWeekBucket[] = [];
  let cursor = monthStart;
  while (cursor <= monthEnd) {
    const week = automaticPeriod('week', cursor);
    const endDate = week.endDate < monthEnd ? week.endDate : monthEnd;
    const within = entries.filter((entry) => {
      const date = entry.periodStart.toString();
      return date >= cursor && date <= endDate;
    });
    buckets.push({
      startDate: cursor,
      endDate,
      summary: summarizeDiaryRatings(within, inclusiveDays(cursor, endDate)),
    });
    cursor = addDays(endDate, 1);
  }
  return buckets;
}

export function monthWeeklyReflections(
  month: DiaryPeriod<'month'>,
  entries: readonly DiaryWeekEntry[],
): readonly DiaryWeekEntry[] {
  const start = month.periodStart.toString();
  const end = month.periodEnd.toString();
  return entries
    .filter((entry) => {
      const periodEnd = entry.periodEnd.toString();
      return entry.status === 'completed' && periodEnd >= start && periodEnd <= end;
    })
    .sort((left, right) => left.periodEnd.toString().localeCompare(right.periodEnd.toString()));
}

export function inclusiveDays(start: string, end: string): number {
  return (
    Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1
  );
}

function average(values: readonly (number | null)[]): DiaryAverage {
  const samples = values.filter((value): value is number => value !== null);
  return {
    value:
      samples.length === 0 ? null : samples.reduce((sum, value) => sum + value, 0) / samples.length,
    sampleCount: samples.length,
  };
}
