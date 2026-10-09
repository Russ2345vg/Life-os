import { describe, expect, it } from 'vitest';
import { ActionActualResult, EntityId, LifeAction, LifeActionTitle } from '../../domain';
import { actionResultsForDirection, actionResultsForGoal } from './actionResultsModel';

const id = (value: string) => EntityId.create(value);
function completed(
  actionId: string,
  goalId: string | null,
  directionId: string | null,
  note: string | null,
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
    note === null ? null : ActionActualResult.create(note),
    new Date(`2026-10-0${day}T12:00:00Z`),
    id(`complete-${actionId}`),
  );
  return action;
}

describe('results in action context', () => {
  it('includes completed actions without a result and keeps the newest completion first', () => {
    const withResult = completed('with-result', 'goal', null, 'Получилось', 2);
    const withoutResult = completed('without-result', 'goal', null, null, 3);
    expect(actionResultsForGoal([withResult, withoutResult], 'goal')).toEqual([
      withoutResult,
      withResult,
    ]);
  });

  it('keeps archived successes but excludes deleted and reopened actions', () => {
    const archived = completed('archived', 'goal', null, null, 2);
    archived.archive(new Date('2026-10-05T12:00:00Z'), id('archive-event'));
    const deleted = completed('deleted', 'goal', null, 'Удалённый итог', 3);
    deleted.softDelete(new Date('2026-10-05T12:00:00Z'));
    const reopened = completed('reopened', 'goal', null, 'Старый итог', 4);
    reopened.reopen(new Date('2026-10-05T12:00:00Z'));
    expect(actionResultsForGoal([deleted, reopened, archived], 'goal')).toEqual([archived]);
  });

  it('uses the goal link before a direct direction link and never repeats an action', () => {
    const linked = completed('linked', 'goal', 'direction', null, 2);
    const foreignGoal = completed('foreign', 'other-goal', 'direction', 'Другое', 3);
    const direct = completed('direct', null, 'direction', null, 4);
    const foreignDirection = completed('outside', null, 'other-direction', 'Другое', 5);
    expect(
      actionResultsForDirection([linked, foreignGoal, direct, foreignDirection], 'direction', [
        'goal',
        'goal',
      ]),
    ).toEqual([direct, linked]);
    expect(actionResultsForGoal([linked, direct], 'goal')).toEqual([linked]);
  });

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
