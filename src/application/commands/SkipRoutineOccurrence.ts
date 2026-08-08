import { ROUTINE_OCCURRENCE_OVERRIDE_TYPE, type RoutineOccurrenceOverride } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import {
  saveOverride,
  type RoutineOccurrenceCommandDependencies,
  type RoutineOccurrenceCommandInput,
} from './routineOccurrenceCommandSupport';

export class SkipRoutineOccurrence {
  public constructor(readonly dependencies: RoutineOccurrenceCommandDependencies) {}
  public execute(
    input: RoutineOccurrenceCommandInput,
  ): Promise<Result<RoutineOccurrenceOverride, DomainError>> {
    return saveOverride(this.dependencies, input, {
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped,
    });
  }
}
