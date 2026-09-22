import {
  RoutineBlockRecurrence,
  createRoutineBlockAssignment,
  type DayDate,
  type IsoWeekday,
  type RoutineBlockCategory,
  type RoutineBlockAssignmentKind,
  type EntityId,
  type RoutineBlockDetails,
  type RoutineBlockRecurrenceKind,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Failure } from '../../shared/result/Result';

export interface RoutineBlockDetailsInput {
  readonly anchorDate: DayDate;
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly category: RoutineBlockCategory;
  readonly recurrence: RoutineBlockRecurrenceKind;
  readonly selectedWeekdays?: readonly IsoWeekday[];
  readonly required: boolean;
  readonly assignmentKind?: RoutineBlockAssignmentKind;
  readonly actionId?: EntityId;
  readonly ruleId?: EntityId;
}

export function routineBlockDetails(input: RoutineBlockDetailsInput): RoutineBlockDetails {
  return {
    anchorDate: input.anchorDate,
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
    category: input.category,
    recurrence: RoutineBlockRecurrence.create(input.recurrence, input.selectedWeekdays),
    required: input.required,
    assignment: createRoutineBlockAssignment(
      input.assignmentKind ?? 'reminder',
      input.assignmentKind === 'existingSeries' ? input.ruleId : input.actionId,
    ),
  };
}

export function routineBlockFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) {
    return failure(error);
  }
  throw error;
}

export function routineBlockNotFound(): Failure<DomainError> {
  return failure(new DomainError('routine_block.not_found', 'Блок распорядка не найден.'));
}

export function routineBlockVersionConflict(): Failure<DomainError> {
  return failure(
    new DomainError(
      'routine_block.version_conflict',
      'Блок изменился в другой вкладке. Обновите данные и повторите сохранение.',
    ),
  );
}

export function validExpectedVersion(version: number): boolean {
  return Number.isInteger(version) && version >= 1;
}
