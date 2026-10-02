import { DayDate } from '../../domain/day/DayDate';
import type { Walk } from '../../domain/walk/Walk';
import type { WalkRepository } from '../ports/WalkRepository';
import { DomainError } from '../../shared/errors/DomainError';
export function analyzeWalks(walks: readonly Walk[]) {
  const visible = walks.filter((walk) => walk.deletedAt === null);
  const completed = visible.filter((walk) => walk.status === 'completed');
  const durations = completed
    .map((walk) => walk.actualDurationMilliseconds ?? 0)
    .sort((a, b) => a - b);
  const pairs = completed.filter((walk) => walk.beforeState !== null && walk.afterState !== null);
  const days = new Map<string, { date: string; durationMs: number; count: number }>();
  for (const walk of completed) {
    const date = walk.date.toString();
    const day = days.get(date) ?? { date, durationMs: 0, count: 0 };
    day.durationMs += walk.actualDurationMilliseconds ?? 0;
    day.count++;
    days.set(date, day);
  }
  const delta = (key: 'energy' | 'tension' | 'clarity') =>
    pairs.reduce((sum, walk) => sum + walk.afterState![key] - walk.beforeState![key], 0) /
    pairs.length;
  return {
    completedCount: completed.length,
    durationMs: durations.reduce((a, b) => a + b, 0),
    activeDays: days.size,
    medianDurationMs: durations.length
      ? (durations[Math.floor((durations.length - 1) / 2)]! +
          durations[Math.floor(durations.length / 2)]!) /
        2
      : null,
    abandonedCount: visible.filter((walk) => walk.status === 'abandoned').length,
    pairedCount: pairs.length,
    meanDelta: pairs.length
      ? { energy: delta('energy'), tension: delta('tension'), clarity: delta('clarity') }
      : null,
    sourceIds: completed.map((walk) => walk.id.toString()),
    pairedSourceIds: pairs.map((walk) => walk.id.toString()),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
export type WalkAnalyticsResult = ReturnType<typeof analyzeWalks>;
export class WalkAnalytics {
  public constructor(private readonly repository: WalkRepository) {}
  public async get(from: string, to: string): Promise<WalkAnalyticsResult> {
    DayDate.create(from);
    DayDate.create(to);
    if (from > to)
      throw new DomainError(
        'walk.invalid_period',
        'Начало периода должно быть не позже окончания.',
      );
    const walks: Walk[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.repository.list({ from, to, ...(cursor ? { cursor } : {}) });
      walks.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return analyzeWalks(walks);
  }
  public async getDayFacts(date: DayDate): Promise<{ completedCount: number; durationMs: number }> {
    const result = await this.get(date.toString(), date.toString());
    return { completedCount: result.completedCount, durationMs: result.durationMs };
  }
}
