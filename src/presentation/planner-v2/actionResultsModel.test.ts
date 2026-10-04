import { describe, expect, it } from 'vitest';
import { ActionActualResult, EntityId, LifeAction, LifeActionTitle } from '../../domain';
import { actionResultsForDirection, actionResultsForGoal } from './actionResultsModel';

const id = (value: string) => EntityId.create(value);
function completed(
  actionId: string,
  goalId: string | null,
  directionId: string | null,
  note: string,
  day: number,
) {
  const action = LifeAction.createDraft({
    id: id(actionId),
    title: LifeActionTitle.create(actionId),
    goalId: goalId ? id(goalId) : null,
    directionId: directionId ? id(directionId) : null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    eventId: id(`event-${actionId}`),
  });
  action.complete(
    ActionActualResult.create(note),
    new Date(`2026-10-0${day}T12:00:00Z`),
    id(`complete-${actionId}`),
  );
  return action;
}

describe('results in action context', () => {
  it('shows goal results newest first and direction results from direct and goal links', () => {
    const direct = completed('direct', null, 'direction', 'Направление', 2);
    const linked = completed('linked', 'goal', null, 'Цель', 3);
    const other = completed('other', 'other-goal', null, 'Другое', 4);
    const actions = [direct, linked, other];
    expect(actionResultsForGoal(actions, 'goal').map((action) => action.id.toString())).toEqual([
      'linked',
    ]);
    expect(
      actionResultsForDirection(actions, 'direction', ['goal']).map((action) =>
        action.id.toString(),
      ),
    ).toEqual(['linked', 'direct']);
  });
});
