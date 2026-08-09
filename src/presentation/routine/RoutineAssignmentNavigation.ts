import { ROUTINE_BLOCK_ASSIGNMENT, type RoutineBlockAssignment } from '../../domain';

export function openRoutineAssignmentSection(
  assignment: RoutineBlockAssignment,
  onOpenWalks: (() => void) | undefined,
): boolean {
  if (assignment.kind !== ROUTINE_BLOCK_ASSIGNMENT.walk || onOpenWalks === undefined) return false;
  onOpenWalks();
  return true;
}
