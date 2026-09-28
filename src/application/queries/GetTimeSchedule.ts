import type { LifeAction } from '../../domain';

export interface TimeScheduleDay {
  readonly timed: readonly LifeAction[];
  readonly untimed: readonly LifeAction[];
  readonly scheduledMinutes: number;
  readonly untimedEstimateMinutes: number;
  readonly plannedMinutes: number;
  readonly unknownEstimateCount: number;
  readonly capacityMinutes: number | null;
  readonly utilization: number | null;
  readonly overCapacity: boolean;
  readonly conflictIds: ReadonlySet<string>;
}

export function buildTimeScheduleDay(
  date: string,
  actions: readonly LifeAction[],
  capacityMinutes: number | null,
): TimeScheduleDay {
  const available = actions.filter(
    (action) =>
      action.plannedDate?.toString() === date &&
      !action.isDeleted() &&
      !action.isArchived() &&
      action.status !== 'cancelled',
  );
  const timed = available
    .filter((action) => action.scheduledStartMinute !== null)
    .sort((left, right) => left.scheduledStartMinute! - right.scheduledStartMinute!);
  const untimed = available.filter((action) => action.scheduledStartMinute === null);
  const scheduledMinutes = timed.reduce(
    (sum, action) => sum + (action.scheduledDurationMinutes ?? 0),
    0,
  );
  const untimedEstimateMinutes = untimed.reduce(
    (sum, action) => sum + (action.estimateMinutes ?? 0),
    0,
  );
  const plannedMinutes = scheduledMinutes + untimedEstimateMinutes;
  const conflictIds = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    const left = timed[i]!;
    if (left.status === 'completed') continue;
    for (let j = i + 1; j < timed.length; j++) {
      const right = timed[j]!;
      if (
        right.scheduledStartMinute! >=
        left.scheduledStartMinute! + left.scheduledDurationMinutes!
      )
        break;
      if (right.status === 'completed') continue;
      conflictIds.add(left.id.toString());
      conflictIds.add(right.id.toString());
    }
  }
  return {
    timed,
    untimed,
    scheduledMinutes,
    untimedEstimateMinutes,
    plannedMinutes,
    unknownEstimateCount: untimed.filter((action) => action.estimateMinutes === null).length,
    capacityMinutes,
    utilization: capacityMinutes === null ? null : plannedMinutes / capacityMinutes,
    overCapacity: capacityMinutes !== null && plannedMinutes > capacityMinutes,
    conflictIds,
  };
}
