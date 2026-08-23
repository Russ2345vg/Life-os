import {
  ROUTINE_EXECUTION_STATUS,
  durationMinutes,
  type DayDate,
  type EffectiveRoutineOccurrence,
  type RoutineExecutionStatus,
  type RoutineOccurrenceExecution,
} from '../../domain';
import type { Clock } from '../ports/Clock';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import type { GetRoutineBlocksForDate } from './GetRoutineBlocksForDate';

export type RoutineTemporalState = 'future' | 'current' | 'past' | 'running';

export interface RoutinePlanFactPresentation {
  readonly occurrence: EffectiveRoutineOccurrence;
  readonly execution: RoutineOccurrenceExecution | null;
  readonly executionStatus: RoutineExecutionStatus;
  readonly plannedTimeLabel: string;
  readonly actualTimeLabel: string | null;
  readonly plannedDurationMinutes: number;
  readonly actualDurationMinutes: number | null;
  readonly startDeviationMinutes: number | null;
  readonly endDeviationMinutes: number | null;
  readonly durationDeviationMinutes: number | null;
  readonly temporalState: RoutineTemporalState;
}

export class GetRoutinePlanFactForDate {
  public constructor(
    readonly getRoutineBlocksForDate: Pick<GetRoutineBlocksForDate, 'execute'>,
    readonly executionRepository: RoutineOccurrenceExecutionRepository,
    readonly clock: Clock,
  ) {}

  public async execute(date: DayDate): Promise<readonly RoutinePlanFactPresentation[]> {
    const [occurrences, executions] = await Promise.all([
      this.getRoutineBlocksForDate.execute(date),
      this.executionRepository.findAll(),
    ]);
    const executionByOccurrence = new Map(
      executions.map((execution) => [
        occurrenceKey(execution.routineBlockId.toString(), execution.occurrenceDate),
        execution,
      ]),
    );
    const now = this.clock.now();
    const presentations = occurrences.map((occurrence) =>
      resolveRoutinePlanFactPresentation(
        occurrence,
        executionByOccurrence.get(
          occurrenceKey(occurrence.sourceBlockId.toString(), occurrence.occurrenceDate),
        ) ?? null,
        now,
      ),
    );
    return Object.freeze(presentations);
  }
}

function occurrenceKey(blockId: string, date: DayDate): string {
  return `${blockId}\u0000${date.toString()}`;
}

export function resolveRoutinePlanFactPresentation(
  occurrence: EffectiveRoutineOccurrence,
  execution: RoutineOccurrenceExecution | null,
  now: Date,
): RoutinePlanFactPresentation {
  const plannedStart = localDateTime(occurrence.effectiveDate, occurrence.effectiveStartTime);
  const plannedEnd = localDateTime(occurrence.effectiveDate, occurrence.effectiveEndTime);
  const actualStartedAt = execution?.actualStartedAt ?? null;
  const actualEndedAt = execution?.actualEndedAt ?? null;
  const plannedDuration = durationMinutes(
    occurrence.effectiveStartTime,
    occurrence.effectiveEndTime,
  );
  const actualDuration =
    actualStartedAt === null || actualEndedAt === null
      ? null
      : minutesBetween(actualStartedAt, actualEndedAt);

  return Object.freeze({
    occurrence,
    execution,
    executionStatus: execution?.status ?? ROUTINE_EXECUTION_STATUS.notStarted,
    plannedTimeLabel: `${occurrence.effectiveStartTime}–${occurrence.effectiveEndTime}`,
    actualTimeLabel:
      actualStartedAt === null
        ? null
        : `${formatTime(actualStartedAt)}–${actualEndedAt === null ? '…' : formatTime(actualEndedAt)}`,
    plannedDurationMinutes: plannedDuration,
    actualDurationMinutes: actualDuration,
    startDeviationMinutes:
      actualStartedAt === null ? null : minutesBetween(plannedStart, actualStartedAt),
    endDeviationMinutes: actualEndedAt === null ? null : minutesBetween(plannedEnd, actualEndedAt),
    durationDeviationMinutes: actualDuration === null ? null : actualDuration - plannedDuration,
    temporalState: resolveTemporalState(execution, plannedStart, plannedEnd, now),
  });
}

function resolveTemporalState(
  execution: RoutineOccurrenceExecution | null,
  plannedStart: Date,
  plannedEnd: Date,
  now: Date,
): RoutineTemporalState {
  if (execution?.status === ROUTINE_EXECUTION_STATUS.running) return 'running';
  if (now.getTime() < plannedStart.getTime()) return 'future';
  if (now.getTime() <= plannedEnd.getTime()) return 'current';
  return 'past';
}

function localDateTime(date: DayDate, time: string): Date {
  const [year, month, day] = date.toString().split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year!, month! - 1, day!, hours!, minutes!, 0, 0);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

function formatTime(value: Date): string {
  return `${value.getHours().toString().padStart(2, '0')}:${value
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}
