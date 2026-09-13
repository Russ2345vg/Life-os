import type { ArchiveGoal, UpdateGoal } from '../../application';
import { EntityId, type Goal, type GoalStatus } from '../../domain';

export async function changePlannerGoalStatus(
  command: Pick<UpdateGoal, 'execute'>,
  goal: Goal,
  status: GoalStatus,
  archiveCommand?: Pick<ArchiveGoal, 'execute'>,
) {
  if (status === 'archived') {
    if (!archiveCommand) throw new Error('Архивация цели недоступна.');
    const archived = await archiveCommand.execute({ id: goal.id, expectedVersion: goal.version });
    if (!archived.ok) throw archived.error;
    return archived.value;
  }
  const result = await command.execute({
    id: goal.id,
    expectedVersion: goal.version,
    title: goal.title,
    status,
    stage:
      status === 'achieved' ? 'achieved' : goal.stage === 'achieved' ? 'active_goal' : goal.stage,
  });
  if (!result.ok) throw result.error;
  return result.value;
}
export async function linkPlannerGoalDirection(
  command: Pick<UpdateGoal, 'execute'>,
  goal: Goal,
  directionId: string,
) {
  const result = await command.execute({
    id: goal.id,
    expectedVersion: goal.version,
    title: goal.title,
    directionId: directionId ? EntityId.create(directionId) : null,
  });
  if (!result.ok) throw result.error;
  return result.value;
}
