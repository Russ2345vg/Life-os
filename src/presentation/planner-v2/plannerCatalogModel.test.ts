import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import {
  filterPlannerGoals,
  filterPlannerActions,
  groupPlannerActions,
  emptyGoalFilters,
  measuredGoalProgress,
} from './plannerCatalogModel';
import { selectRecurringActionRepresentatives } from '../../application/planner/actionSelection';
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
  it('excludes goals with a deadline from the undated filter', () => {
    const dated = goal.update({ title: goal.title, dueDate: '2026-10-01' }, now);
    expect(
      filterPlannerGoals([goal, dated], { ...emptyGoalFilters(), undated: true }, '', [], []),
    ).toEqual([goal]);
  });
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
  it('groups dated actions into today, tomorrow, this week and undated buckets', () => {
    const makeAction = (id: string, date: string | null) =>
      LifeAction.createDraft({
        id: EntityId.create(id),
        title: LifeActionTitle.create(id),
        plannedDate: date ? DayDate.create(date) : null,
        createdAt: now,
        eventId: EntityId.create(`${id}-event`),
      });
    const grouped = groupPlannerActions(
      [
        makeAction('week', '2026-09-16'),
        makeAction('undated', null),
        makeAction('tomorrow', '2026-09-15'),
        makeAction('today', '2026-09-14'),
      ],
      '2026-09-14',
    );

    expect(grouped.map((group) => group.key)).toEqual(['today', 'tomorrow', 'week', 'undated']);
    expect(grouped.map((group) => group.actions.map((item) => item.title.toString()))).toEqual([
      ['today'],
      ['tomorrow'],
      ['week'],
      ['undated'],
    ]);
  });
  it('does not describe overdue and distant dates as this week', () => {
    const actions = ['2026-09-01', '2026-10-01'].map((date) =>
      LifeAction.createDraft({
        id: EntityId.create(date),
        title: LifeActionTitle.create(date),
        plannedDate: DayDate.create(date),
        createdAt: now,
        eventId: EntityId.create(`${date}-event`),
      }),
    );
    const groups = groupPlannerActions(actions, '2026-09-14');
    expect(groups.find((g) => g.key === 'week')?.actions).toEqual([]);
    expect(groups.find((g) => g.key === 'overdue')?.actions).toEqual([actions[0]]);
    expect(groups.find((g) => g.key === 'later')?.actions).toEqual([actions[1]]);
  });
  it('keeps one action per recurrence rule for selection while preserving ordinary actions', () => {
    const recurring = (id: string, date: string) => {
      const value = LifeAction.createDraft({
        id: EntityId.create(id),
        title: LifeActionTitle.create('Тренировка'),
        createdAt: new Date(`${date}T08:00:00Z`),
        eventId: EntityId.create(`${id}-event`),
      });
      value.setPlanningMetadata({
        occurrence: {
          ruleId: 'recurrence:training',
          slot: date,
          ruleRevision: 1,
          originalDate: date,
        },
      });
      return value;
    };
    const first = recurring('training-first', '2026-09-13');
    const second = recurring('training-second', '2026-09-14');

    expect(selectRecurringActionRepresentatives([second, action, first])).toEqual([action, first]);
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
