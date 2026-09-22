import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';

export const ROUTINE_BLOCK_ASSIGNMENT = {
  reminder: 'reminder',
  existingAction: 'existingAction',
  existingSeries: 'existingSeries',
  createAction: 'createAction',
  eveningReview: 'eveningReview',
  walk: 'walk',
} as const;

export type RoutineBlockAssignmentKind =
  (typeof ROUTINE_BLOCK_ASSIGNMENT)[keyof typeof ROUTINE_BLOCK_ASSIGNMENT];

export type RoutineBlockAssignment =
  | Readonly<{ readonly kind: 'existingSeries'; readonly ruleId: EntityId }>
  | Readonly<{ readonly kind: typeof ROUTINE_BLOCK_ASSIGNMENT.reminder }>
  | Readonly<{
      readonly kind: typeof ROUTINE_BLOCK_ASSIGNMENT.existingAction;
      readonly actionId: EntityId;
    }>
  | Readonly<{ readonly kind: typeof ROUTINE_BLOCK_ASSIGNMENT.createAction }>
  | Readonly<{ readonly kind: typeof ROUTINE_BLOCK_ASSIGNMENT.eveningReview }>
  | Readonly<{ readonly kind: typeof ROUTINE_BLOCK_ASSIGNMENT.walk }>;

export function isRoutineBlockAssignmentKind(value: string): value is RoutineBlockAssignmentKind {
  return Object.values(ROUTINE_BLOCK_ASSIGNMENT).some((kind) => kind === value);
}

export function createRoutineBlockAssignment(
  kind: RoutineBlockAssignmentKind,
  actionId?: EntityId,
): RoutineBlockAssignment {
  if (!isRoutineBlockAssignmentKind(kind)) {
    throw new DomainError(
      'routine_block.invalid_assignment',
      'Назначение блока распорядка указано неверно.',
    );
  }

  if (kind === 'existingSeries') {
    if (!(actionId instanceof EntityId))
      throw new DomainError('routine_block.series_required', 'Выберите серию повторения.');
    return Object.freeze({ kind, ruleId: actionId });
  }
  if (kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction) {
    if (!(actionId instanceof EntityId)) {
      throw new DomainError(
        'routine_block.action_required',
        'Выберите действие для связи с блоком.',
      );
    }
    return Object.freeze({ kind, actionId });
  }

  return Object.freeze({ kind });
}

export function copyRoutineBlockAssignment(
  assignment: RoutineBlockAssignment,
): RoutineBlockAssignment {
  if (assignment.kind === 'existingSeries')
    return createRoutineBlockAssignment(assignment.kind, assignment.ruleId);
  return assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
    ? createRoutineBlockAssignment(assignment.kind, assignment.actionId)
    : createRoutineBlockAssignment(assignment.kind);
}
