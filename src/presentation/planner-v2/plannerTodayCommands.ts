import type { CompleteLifeAction, SetLifeActionPlan } from '../../application';
import { DayDate, EntityId } from '../../domain';

export async function completePlannerAction(
  command: Pick<CompleteLifeAction, 'execute'>,
  id: string,
) {
  const result = await command.execute({ lifeActionId: EntityId.create(id) });
  if (!result.ok) throw result.error;
  return result.value;
}
export async function planPlannerAction(
  command: Pick<SetLifeActionPlan, 'execute'>,
  id: string,
  date: string,
  isNext?: boolean,
) {
  const result = await command.execute({
    lifeActionId: EntityId.create(id),
    plannedDate: date ? DayDate.create(date) : null,
    ...(isNext === undefined ? {} : { isNext }),
  });
  if (!result.ok) throw result.error;
  return result.value;
}
