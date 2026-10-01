import type { CompleteLifeAction, SetLifeActionPlan } from '../../application';
import { DayDate, EntityId, type LifeActionStatus } from '../../domain';

export async function completePlannerAction(
  command: Pick<CompleteLifeAction, 'execute'>,
  id: string,
  expectedCompletionKey?: string,
) {
  const result = await command.execute({
    lifeActionId: EntityId.create(id),
    ...(expectedCompletionKey === undefined ? {} : { expectedCompletionKey }),
  });
  if (!result.ok) throw result.error;
  return result.value;
}
export async function planPlannerAction(
  command: Pick<SetLifeActionPlan, 'execute'>,
  id: string,
  date: string,
  isNext?: boolean,
  allowedStatuses?: readonly LifeActionStatus[],
) {
  const result = await command.execute({
    lifeActionId: EntityId.create(id),
    plannedDate: date ? DayDate.create(date) : null,
    ...(isNext === undefined ? {} : { isNext }),
    ...(allowedStatuses === undefined ? {} : { allowedStatuses }),
  });
  if (!result.ok) throw result.error;
  return result.value;
}
