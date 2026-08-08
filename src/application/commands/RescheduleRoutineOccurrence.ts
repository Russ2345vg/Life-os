import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  addMinutes,
  durationMinutes,
  timeToMinutes,
  type DayDate,
  type RoutineOccurrenceOverride,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Result } from '../../shared/result/Result';
import {
  saveOverride,
  validateMutableOccurrence,
  type RoutineOccurrenceCommandDependencies,
  type RoutineOccurrenceCommandInput,
} from './routineOccurrenceCommandSupport';

export interface RescheduleRoutineOccurrenceInput extends RoutineOccurrenceCommandInput {
  readonly targetDate: DayDate;
  readonly targetStartTime: string;
}

export class RescheduleRoutineOccurrence {
  public constructor(readonly dependencies: RoutineOccurrenceCommandDependencies) {}
  public async execute(
    input: RescheduleRoutineOccurrenceInput,
  ): Promise<Result<RoutineOccurrenceOverride, DomainError>> {
    let block;
    try {
      block = await validateMutableOccurrence(this.dependencies, input);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
    const duration = durationMinutes(block.startTime, block.endTime);
    if (
      !input.targetDate.isAfter(input.occurrenceDate) ||
      timeToMinutes(input.targetStartTime) + duration > 24 * 60
    ) {
      return failure(
        new DomainError(
          'routine_occurrence_override.invalid_reschedule',
          'Новая дата не может быть раньше исходной, а блок должен завершаться в тот же день.',
        ),
      );
    }
    addMinutes(input.targetStartTime, duration);
    return saveOverride(this.dependencies, input, {
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: input.targetDate,
      targetStartTime: input.targetStartTime,
    });
  }
}
