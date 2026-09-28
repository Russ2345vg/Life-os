import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import { addDays } from '../../domain/planner/PlanningPeriod';

export function summarizeEveningHistory(state: SleepScheduleState, cycleDate: string) {
  const start = addDays(cycleDate, -14);
  const nights = state.nightCycles.filter(
    (night) => night.cycleDate >= start && night.cycleDate < cycleDate,
  );
  const completed = nights.filter(
    (night) =>
      night.preparationCompletionKind === 'ALL_DONE' ||
      night.preparationCompletionKind === 'WITH_SKIPS',
  );
  const suggestions = state.preparationItems
    .filter((item) => item.enabled)
    .map((item) => {
      const observations = completed.flatMap((night) =>
        night.preparationItems.filter((snapshot) => snapshot.id === item.id),
      );
      return {
        id: item.id,
        title: item.title,
        total: observations.length,
        missed: observations.filter((snapshot) => snapshot.status !== 'DONE').length,
      };
    })
    .filter((item) => item.total >= 5 && item.missed > 0)
    .sort((a, b) => b.missed / b.total - a.missed / a.total)
    .slice(0, 3);
  return {
    recorded: nights.length,
    completed: completed.length,
    onTime: completed.filter(
      (night) =>
        night.preparationCompletedAt !== null &&
        night.preparationCompletedAt <= night.plannedSleepAt,
    ).length,
    incomplete: nights.filter((night) => night.preparationCompletionKind === null).length,
    skipped: nights.filter((night) => night.preparationCompletionKind === 'SKIPPED_TODAY').length,
    suggestions,
  };
}
