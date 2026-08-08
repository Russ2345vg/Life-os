import {
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  type EntityId,
  type RoutineOccurrenceOverride,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Result } from '../../shared/result/Result';
import {
  saveOverride,
  validateMutableOccurrence,
  validateReplacementAction,
  type RoutineOccurrenceCommandDependencies,
  type RoutineOccurrenceCommandInput,
} from './routineOccurrenceCommandSupport';

export interface ReplaceRoutineOccurrenceActionInput extends RoutineOccurrenceCommandInput {
  readonly replacementActionId: EntityId;
}

export class ReplaceRoutineOccurrenceAction {
  public constructor(readonly dependencies: RoutineOccurrenceCommandDependencies) {}
  public async execute(
    input: ReplaceRoutineOccurrenceActionInput,
  ): Promise<Result<RoutineOccurrenceOverride, DomainError>> {
    let block;
    try {
      block = await validateMutableOccurrence(this.dependencies, input);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
    if (block.assignment.kind !== ROUTINE_BLOCK_ASSIGNMENT.existingAction) {
      return failure(
        new DomainError(
          'routine_occurrence_override.replacement_not_supported',
          'Заменить действие можно только у блока, связанного с действием.',
        ),
      );
    }
    try {
      await validateReplacementAction(this.dependencies, input.replacementActionId);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
    return saveOverride(this.dependencies, input, {
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction,
      replacementActionId: input.replacementActionId,
    });
  }
}
