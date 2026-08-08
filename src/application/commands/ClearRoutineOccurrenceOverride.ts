import type { DomainError } from '../../shared/errors/DomainError';
import { DomainError as DomainErrorClass } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import {
  assertExpectedVersion,
  validateMutableOccurrence,
  versionConflict,
  type RoutineOccurrenceCommandDependencies,
  type RoutineOccurrenceCommandInput,
} from './routineOccurrenceCommandSupport';

export interface ClearRoutineOccurrenceOverrideInput extends RoutineOccurrenceCommandInput {
  readonly expectedVersion: number;
}

export class ClearRoutineOccurrenceOverride {
  public constructor(readonly dependencies: RoutineOccurrenceCommandDependencies) {}
  public async execute(
    input: ClearRoutineOccurrenceOverrideInput,
  ): Promise<Result<void, DomainError>> {
    try {
      assertExpectedVersion(input.expectedVersion);
      await validateMutableOccurrence(this.dependencies, input);
      const existing = await this.dependencies.overrideRepository.findByOccurrence(
        input.routineBlockId,
        input.occurrenceDate,
      );
      if (existing === null || existing.version !== input.expectedVersion) {
        return failure(versionConflict());
      }
      const deleted = await this.dependencies.overrideRepository.deleteIfVersionMatches(
        existing.id,
        input.expectedVersion,
      );
      return deleted ? success(undefined) : failure(versionConflict());
    } catch (error: unknown) {
      if (error instanceof DomainErrorClass) return failure(error);
      throw error;
    }
  }
}
