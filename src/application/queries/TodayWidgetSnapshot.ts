import type { LifeAction } from '../../domain';
import type { PlannerTodayOverview } from './GetPlannerToday';

export interface TodayWidgetSnapshot {
  readonly date: string;
  readonly main: string | null;
  readonly actions: readonly string[];
  readonly remainingCount: number;
  readonly updatedAtEpochMillis: number;
}

export function buildTodayWidgetSnapshot(
  date: string,
  overview: Pick<PlannerTodayOverview, 'main' | 'actions'>,
  updatedAtEpochMillis: number,
): TodayWidgetSnapshot {
  const planned: readonly LifeAction[] = overview.main
    ? [overview.main, ...overview.actions]
    : overview.actions;
  return {
    date,
    main: planned[0]?.title.toString() ?? null,
    actions: planned.slice(1, 4).map((action) => action.title.toString()),
    remainingCount: Math.max(0, planned.length - 4),
    updatedAtEpochMillis,
  };
}
