import type { LifeAction } from '../../domain';
import {
  effectiveActionTime,
  type EffectiveActionTime,
  type WalkScheduleDay,
} from '../walk/WalkScheduleProjection';
import {
  scheduleConflictIds,
  type AutopilotScheduleBlock,
} from '../../domain/planner/AutopilotSchedule';

export interface TimeScheduleDay {
  readonly effectiveTimes: ReadonlyMap<string, EffectiveActionTime>;
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
  sunsetWalk?: WalkScheduleDay | null,
): TimeScheduleDay {
  const available = actions.filter(
    (action) =>
      action.plannedDate?.toString() === date &&
      !action.isDeleted() &&
      !action.isArchived() &&
      action.status !== 'cancelled',
  );
  const effectiveTimes = new Map(
    available.map((action) => [action.id.toString(), effectiveActionTime(action, sunsetWalk)]),
  );
  const time = (action: LifeAction) => effectiveTimes.get(action.id.toString())!;
  const timed = available
    .filter((action) => time(action).startMinute !== null)
    .sort((left, right) => time(left).startMinute! - time(right).startMinute!);
  const untimed = available.filter((action) => time(action).startMinute === null);
  const solarRows =
    sunsetWalk?.kind === 'available'
      ? timed.filter((action) => action.walkPlan && ['draft', 'ready'].includes(action.status))
      : [];
  // Preserve every row, but shared solar time occupies only the longest linked duration.
  const solarIds = new Set(solarRows.map((action) => action.id.toString()));
  const representative = [...solarRows].sort(
    (a, b) => (time(b).durationMinutes ?? 0) - (time(a).durationMinutes ?? 0),
  )[0];
  const occupied = timed.filter(
    (action) => !solarIds.has(action.id.toString()) || action === representative,
  );
  const scheduledMinutes = occupied.reduce(
    (sum, action) => sum + (time(action).durationMinutes ?? 0),
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
    ...occupied
      .filter((action) => action.status !== 'completed')
      .map((action): AutopilotScheduleBlock => ({
        id: action.id.toString(),
        kind: 'action',
        title: action.title.toString(),
        startMinute: time(action).startMinute!,
        endMinute: time(action).startMinute! + time(action).durationMinutes!,
        sourceId: action.id.toString(),
        actionId: action.id.toString(),
        protected: true,
      })),
  ]);
  for (const id of unified) conflictIds.add(id);
  for (let i = 0; i < occupied.length; i++) {
    const left = occupied[i]!;
    if (left.status === 'completed') continue;
    for (let j = i + 1; j < occupied.length; j++) {
      const right = occupied[j]!;
      if (time(right).startMinute! >= time(left).startMinute! + time(left).durationMinutes!) break;
      if (right.status === 'completed') continue;
      conflictIds.add(left.id.toString());
      conflictIds.add(right.id.toString());
    }
  }
  if (representative && conflictIds.has(representative.id.toString()))
    for (const id of solarIds) conflictIds.add(id);
  return {
    effectiveTimes,
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
        startMinute: day.effectiveTimes.get(action.id.toString())!.startMinute!,
        endMinute:
          day.effectiveTimes.get(action.id.toString())!.startMinute! +
          day.effectiveTimes.get(action.id.toString())!.durationMinutes!,
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
