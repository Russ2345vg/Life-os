import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  timeToMinutes,
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

export interface ShortenRoutineOccurrenceInput extends RoutineOccurrenceCommandInput {
  readonly newEndTime: string;
}

export class ShortenRoutineOccurrence {
  public constructor(readonly dependencies: RoutineOccurrenceCommandDependencies) {}
  public async execute(
    input: ShortenRoutineOccurrenceInput,
  ): Promise<Result<RoutineOccurrenceOverride, DomainError>> {
    let block;
    try {
      block = await validateMutableOccurrence(this.dependencies, input);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
    const end = timeToMinutes(input.newEndTime);
    if (end <= timeToMinutes(block.startTime) || end >= timeToMinutes(block.endTime)) {
      return failure(
        new DomainError(
          'routine_occurrence_override.invalid_shorten',
          'Новое окончание должно быть позже начала и раньше исходного окончания.',
        ),
      );
    }
    return saveOverride(this.dependencies, input, {
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened,
      endTimeOverride: input.newEndTime,
    });
  }
}
