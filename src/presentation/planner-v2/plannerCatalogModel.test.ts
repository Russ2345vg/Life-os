import { describe, expect, it } from 'vitest';
import { EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import {
  filterPlannerGoals,
  filterPlannerActions,
  emptyGoalFilters,
  measuredGoalProgress,
} from './plannerCatalogModel';
const now = new Date('2026-09-13T10:00:00Z');
const goal = Goal.create({
  id: EntityId.create('g'),
  title: 'Изучить испанский',
  description: 'Читать книги',
  status: 'active',
  now,
});
const action = LifeAction.createDraft({
  id: EntityId.create('a'),
  title: LifeActionTitle.create('Прочитать главу'),
  createdAt: now,
  eventId: EntityId.create('e'),
});
describe('V2 catalogue projections', () => {
  it('finds goals without direction and searches textual context', () => {
    expect(
      filterPlannerGoals([goal], { ...emptyGoalFilters(), unassigned: true }, 'книги', [], []),
    ).toEqual([goal]);
    expect(filterPlannerGoals([goal], emptyGoalFilters(), 'испанский', [], [])).toEqual([goal]);
    expect(
      filterPlannerGoals([goal], { ...emptyGoalFilters(), status: 'paused' }, '', [], []),
    ).toEqual([]);
  });
  it('includes standalone and undated actions and title search', () => {
    expect(filterPlannerActions([action], 'unassigned', 'главу', '2026-09-13')).toEqual([action]);
    expect(filterPlannerActions([action], 'undated', '', '2026-09-13')).toEqual([action]);
    expect(filterPlannerActions([action], 'today', '', '2026-09-13')).toEqual([]);
  });
  it('never invents a qualitative percentage', () => {
    expect(measuredGoalProgress(goal)).toBeNull();
    expect(
      measuredGoalProgress(
        goal.update({ title: goal.title, progress: { type: 'qualitative', stage: 'moving' } }, now),
      ),
    ).toBeNull();
    expect(
      measuredGoalProgress(
        goal.update(
          { title: goal.title, progress: { type: 'metric', current: 3, target: 10, unit: 'книг' } },
          now,
        ),
      )?.percent,
    ).toBe(30);
  });
});
