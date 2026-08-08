import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  resolveRoutineOccurrencesForDate,
  type EffectiveRoutineOccurrence,
  type RoutineOccurrenceExecution,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import type { RoutineOccurrenceOverrideRepository } from '../ports/RoutineOccurrenceOverrideRepository';

export interface RunningRoutineOccurrence {
  readonly execution: RoutineOccurrenceExecution;
  readonly occurrence: EffectiveRoutineOccurrence;
}

export class GetRunningRoutineOccurrence {
  public constructor(
    readonly executionRepository: RoutineOccurrenceExecutionRepository,
    readonly routineBlockRepository: RoutineBlockRepository,
    readonly overrideRepository: RoutineOccurrenceOverrideRepository,
  ) {}

  public async execute(): Promise<RunningRoutineOccurrence | null> {
    const execution = await this.executionRepository.findRunning();
    if (execution === null) return null;

    const [block, override] = await Promise.all([
      this.routineBlockRepository.findById(execution.routineBlockId),
      this.overrideRepository.findByOccurrence(execution.routineBlockId, execution.occurrenceDate),
    ]);
    if (block === null) throw recoveryPlanMissing();

    const effectiveDate =
      override?.type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled
        ? override.targetDate
        : execution.occurrenceDate;
    if (effectiveDate === null) throw recoveryPlanMissing();
    const occurrence = resolveRoutineOccurrencesForDate(
      [block],
      override === null ? [] : [override],
      effectiveDate,
    ).find(
      (candidate) =>
        candidate.sourceBlockId.equals(execution.routineBlockId) &&
        candidate.occurrenceDate.equals(execution.occurrenceDate) &&
        !candidate.isRescheduledSource,
    );
    if (occurrence === undefined || occurrence.isSkipped) throw recoveryPlanMissing();
    return Object.freeze({ execution, occurrence });
  }
}

function recoveryPlanMissing(): DomainError {
  return new DomainError(
    'routine_execution.recovery_plan_missing',
    'Не удалось восстановить исторический план выполняющегося блока.',
  );
}
