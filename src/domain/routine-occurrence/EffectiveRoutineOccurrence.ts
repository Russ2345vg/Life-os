import type { DayDate } from '../day/DayDate';
import type { RoutineBlock } from '../routine-block/RoutineBlock';
import type { RoutineBlockAssignment } from '../routine-block/RoutineBlockAssignment';
import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  type RoutineOccurrenceOverride,
  type RoutineOccurrenceOverrideType,
} from './RoutineOccurrenceOverride';

export interface EffectiveRoutineOccurrence {
  readonly id: RoutineBlock['id'];
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly category: RoutineBlock['category'];
  readonly recurrence: RoutineBlock['recurrence'];
  readonly required: boolean;
  readonly assignment: RoutineBlockAssignment;
  readonly anchorDate: DayDate;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly sourceBlock: RoutineBlock;
  readonly sourceBlockId: RoutineBlock['id'];
  readonly occurrenceDate: DayDate;
  readonly effectiveDate: DayDate;
  readonly effectiveStartTime: string;
  readonly effectiveEndTime: string;
  readonly effectiveAssignment: RoutineBlockAssignment;
  readonly deviationType: RoutineOccurrenceOverrideType | null;
  readonly isSkipped: boolean;
  readonly isRescheduledSource: boolean;
  readonly originalStartTime: string;
  readonly originalEndTime: string;
  readonly override: RoutineOccurrenceOverride | null;
}

export function resolveRoutineOccurrencesForDate(
  blocks: readonly RoutineBlock[],
  overrides: readonly RoutineOccurrenceOverride[],
  selectedDate: DayDate,
): readonly EffectiveRoutineOccurrence[] {
  const overridesByOccurrence = new Map(
    overrides.map((override) => [
      occurrenceKey(override.routineBlockId.toString(), override.occurrenceDate),
      override,
    ]),
  );
  const blockById = new Map(blocks.map((block) => [block.id.toString(), block]));
  const result: EffectiveRoutineOccurrence[] = [];

  for (const block of blocks) {
    if (!block.occursOn(selectedDate)) continue;
    const override =
      overridesByOccurrence.get(occurrenceKey(block.id.toString(), selectedDate)) ?? null;
    result.push(resolveSourceOccurrence(block, selectedDate, override));
  }

  for (const override of overrides) {
    if (
      override.type !== ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled ||
      override.targetDate === null ||
      !override.targetDate.equals(selectedDate)
    ) {
      continue;
    }
    const block = blockById.get(override.routineBlockId.toString());
    if (block === undefined || override.occurrenceDate.equals(selectedDate)) continue;
    result.push(resolveRescheduledTarget(block, override));
  }

  return result.sort(
    (left, right) =>
      left.effectiveStartTime.localeCompare(right.effectiveStartTime) ||
      left.effectiveEndTime.localeCompare(right.effectiveEndTime) ||
      left.sourceBlockId.toString().localeCompare(right.sourceBlockId.toString()) ||
      left.occurrenceDate.toString().localeCompare(right.occurrenceDate.toString()),
  );
}

function resolveSourceOccurrence(
  block: RoutineBlock,
  occurrenceDate: DayDate,
  override: RoutineOccurrenceOverride | null,
): EffectiveRoutineOccurrence {
  let startTime = block.startTime;
  let endTime = block.endTime;
  let assignment = block.assignment;
  let isSkipped = false;
  let isRescheduledSource = false;

  if (override?.type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed) {
    startTime = override.startTimeOverride!;
    endTime = addMinutes(startTime, durationMinutes(block.startTime, block.endTime));
  } else if (override?.type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened) {
    endTime = override.endTimeOverride!;
  } else if (override?.type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped) {
    isSkipped = true;
  } else if (override?.type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled) {
    isSkipped = true;
    isRescheduledSource = true;
  } else if (override?.type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction) {
    assignment = Object.freeze({ kind: 'existingAction', actionId: override.replacementActionId! });
  }

  return {
    id: block.id,
    title: block.title,
    startTime,
    endTime,
    category: block.category,
    recurrence: block.recurrence,
    required: block.required,
    assignment,
    anchorDate: block.anchorDate,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    version: block.version,
    sourceBlock: block,
    sourceBlockId: block.id,
    occurrenceDate,
    effectiveDate: occurrenceDate,
    effectiveStartTime: startTime,
    effectiveEndTime: endTime,
    effectiveAssignment: assignment,
    deviationType: override?.type ?? null,
    isSkipped,
    isRescheduledSource,
    originalStartTime: block.startTime,
    originalEndTime: block.endTime,
    override,
  };
}

function resolveRescheduledTarget(
  block: RoutineBlock,
  override: RoutineOccurrenceOverride,
): EffectiveRoutineOccurrence {
  const startTime = override.targetStartTime!;
  return {
    id: block.id,
    title: block.title,
    startTime,
    endTime: addMinutes(startTime, durationMinutes(block.startTime, block.endTime)),
    category: block.category,
    recurrence: block.recurrence,
    required: block.required,
    assignment: block.assignment,
    anchorDate: block.anchorDate,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    version: block.version,
    sourceBlock: block,
    sourceBlockId: block.id,
    occurrenceDate: override.occurrenceDate,
    effectiveDate: override.targetDate!,
    effectiveStartTime: startTime,
    effectiveEndTime: addMinutes(startTime, durationMinutes(block.startTime, block.endTime)),
    effectiveAssignment: block.assignment,
    deviationType: override.type,
    isSkipped: false,
    isRescheduledSource: false,
    originalStartTime: block.startTime,
    originalEndTime: block.endTime,
    override,
  };
}

export function durationMinutes(startTime: string, endTime: string): number {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

export function addMinutes(startTime: string, minutes: number): string {
  const total = timeToMinutes(startTime) + minutes;
  if (total > 24 * 60) return '24:00';
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function occurrenceKey(blockId: string, date: DayDate): string {
  return `${blockId}\u0000${date.toString()}`;
}
