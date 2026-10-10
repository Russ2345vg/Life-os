import type { LifeAction } from '../../domain';
import {
  scheduleConflictIds,
  type AutopilotScheduleBlock,
} from '../../domain/planner/AutopilotSchedule';

export interface TimeScheduleDay {
  readonly blocks: readonly AutopilotScheduleBlock[];
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
  blocks: readonly AutopilotScheduleBlock[] = [],
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
  const routineWindows = blocks.filter(
    (block) => block.kind !== 'action' && !block.actionId && block.kind !== 'reserve',
  );
  const conflictIds = new Set<string>();
  const unified = scheduleConflictIds([
    ...routineWindows,
    ...timed
      .filter((action) => action.status !== 'completed')
      .map((action): AutopilotScheduleBlock => ({
        id: action.id.toString(),
        kind: 'action',
        title: action.title.toString(),
        startMinute: action.scheduledStartMinute!,
        endMinute: action.scheduledStartMinute! + action.scheduledDurationMinutes!,
        sourceId: action.id.toString(),
        actionId: action.id.toString(),
        protected: true,
      })),
  ]);
  for (const id of unified) conflictIds.add(id);
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
    blocks: routineWindows,
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

/** One start per free gap, aligned to a quarter-hour inside the visible working day. */
export function suggestFreeTimeStarts(
  day: TimeScheduleDay,
  durationMinutes: number,
  earliestMinute: number,
): readonly number[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) return [];
  const align = (minute: number) => Math.ceil(minute / 15) * 15;
  let cursor = align(Math.max(420, earliestMinute));
  const suggestions: number[] = [];
  const occupied = [
    ...day.blocks,
    ...day.timed
      .filter((action) => action.status !== 'completed')
      .map((action) => ({
        startMinute: action.scheduledStartMinute!,
        endMinute: action.scheduledStartMinute! + action.scheduledDurationMinutes!,
      })),
  ].sort((a, b) => a.startMinute - b.startMinute);
  for (const block of occupied) {
    const start = block.startMinute;
    const end = block.endMinute;
    if (end <= cursor) continue;
    if (cursor + durationMinutes <= Math.min(start, 1260)) {
      suggestions.push(cursor);
      if (suggestions.length === 3) return suggestions;
    }
    cursor = align(Math.max(cursor, end));
    if (cursor + durationMinutes > 1260) return suggestions;
  }
  if (cursor + durationMinutes <= 1260) suggestions.push(cursor);
  return suggestions;
}
