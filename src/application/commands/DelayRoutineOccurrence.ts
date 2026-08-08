import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  addMinutes,
  durationMinutes,
  timeToMinutes,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Result } from '../../shared/result/Result';
import type { RoutineOccurrenceOverride } from '../../domain';
import {
  saveOverride,
  validateMutableOccurrence,
  type RoutineOccurrenceCommandDependencies,
  type RoutineOccurrenceCommandInput,
} from './routineOccurrenceCommandSupport';

export interface DelayRoutineOccurrenceInput extends RoutineOccurrenceCommandInput {
  readonly newStartTime: string;
}

export class DelayRoutineOccurrence {
  public constructor(readonly dependencies: RoutineOccurrenceCommandDependencies) {}

  public async execute(
    input: DelayRoutineOccurrenceInput,
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
      timeToMinutes(input.newStartTime) <= timeToMinutes(block.startTime) ||
      timeToMinutes(input.newStartTime) + duration > 24 * 60
    ) {
      return failure(
        new DomainError(
          'routine_occurrence_override.invalid_delay',
          'Новое начало должно быть позже исходного, а блок — завершаться в тот же день.',
        ),
      );
    }
    addMinutes(input.newStartTime, duration);
    return saveOverride(this.dependencies, input, {
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed,
      startTimeOverride: input.newStartTime,
    });
  }
}
