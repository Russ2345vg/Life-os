import { describe, expect, it } from 'vitest';
import {
  ActionCancelReason,
  DayDate,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
  Sphere,
} from '../../domain';
import { buildPlannerViews, calendarMonthDays } from './plannerViewsModel';
const now = new Date('2026-09-13T10:00:00Z');
const id = EntityId.create;
const sphere = Sphere.create({ id: id('s'), name: 'Сфера', now });
const direction = Direction.create({ id: id('d'), sphereId: sphere.id, name: 'Направление', now });
const goal = Goal.create({
  id: id('g'),
  directionId: direction.id,
  title: 'Цель',
  status: 'active',
  horizon: '<1y',
  now,
});
const action = (key: string, linked = false, date: string | null = null) =>
  LifeAction.createDraft({
    id: id(key),
    title: LifeActionTitle.create(key),
    goalId: linked ? goal.id : null,
    plannedDate: date ? DayDate.create(date) : null,
    createdAt: now,
    eventId: id(`event-${key}`),
  });

describe('V2 views projections', () => {
  it('chooses the same nearest next step as the list regardless of repository order', () => {
    const undated = action('undated', true);
    const laterAction = action('later', true, '2026-09-19');
    const todayAction = action('today', true, '2026-09-13');
    const input = {
      goals: [goal],
      actions: [undated, laterAction, todayAction],
      spheres: [],
      directions: [],
    };
    expect(buildPlannerViews(input).nextActionByGoal.get('g')).toBe(todayAction);
    expect(
      buildPlannerViews({
        ...input,
        actions: [todayAction, laterAction, undated],
      }).nextActionByGoal.get('g'),
    ).toBe(todayAction);
    laterAction.setPlan(laterAction.plannedDate, true);
    expect(buildPlannerViews(input).nextActionByGoal.get('g')).toBe(laterAction);
  });
  it('partitions each entity once and never fabricates a deadline from a horizon', () => {
    const a = action('a', true, '2026-09-15');
    const b = action('b');
    const view = buildPlannerViews({
      goals: [goal],
      actions: [a, b],
      spheres: [sphere],
      directions: [direction],
    });
    expect(view.goalsByStatus.get('active')).toEqual([goal]);
    expect([...view.goalsByStatus.values()].flat()).toHaveLength(1);
    expect([...view.actionsByColumn.values()].flat()).toHaveLength(2);
    expect(view.actionsByDate.get('2026-09-15')).toEqual([a]);
    expect(view.undatedActions).toEqual([b]);
    expect(view.undatedGoals).toEqual([goal]);
    expect(view.actionsByDate.get('2026-12-31')).toBeUndefined();
  });
  it('keeps complete hierarchy, empty parents, independent and missing-parent entities accessible', () => {
    const independent = Goal.create({ id: id('independent'), title: 'Без направления', now });
    const direct = Goal.create({
      id: id('direct'),
      sphereId: sphere.id,
      title: 'Прямая сфера',
      now,
    });
    const missing = Goal.create({
      id: id('missing'),
      directionId: id('missing-direction'),
      title: 'Нет родителя',
      now,
    });
    const empty = Direction.create({ id: id('empty'), name: 'Пустое направление', now });
    const emptySphere = Sphere.create({ id: id('empty-sphere'), name: 'Пустая сфера', now });
    const a = action('a', true);
    const b = action('b');
    const input = {
      goals: [goal, independent, direct, missing],
      actions: [a, b],
      directions: [direction, empty],
      spheres: [sphere, emptySphere],
    };
    const view = buildPlannerViews(input);
    expect(view.directionsBySphere.get('s')).toEqual([direction]);
    expect(view.goalsByDirection.get('d')).toEqual([goal]);
    expect(view.actionsByGoal.get('g')).toEqual([a]);
    expect(view.goalsWithoutDirectionBySphere.get('s')).toEqual([direct]);
    expect(view.goalsWithoutDirectionBySphere.get('')).toEqual([independent, missing]);
    expect(view.directionsBySphere.get('')).toEqual([empty]);
    expect(view.actionsWithoutGoal).toEqual([b]);
    expect(view.spheres).toContain(emptySphere);
    expect(view.directions).toContain(empty);
    expect(buildPlannerViews(input)).toEqual(view);
    expect(a.version).toBe(1);
    b.setGoal(goal.id);
    const linked = buildPlannerViews(input);
    expect(linked.actionsByGoal.get('g')).toEqual([a, b]);
    expect(linked.actionsWithoutGoal).toEqual([]);
    b.setGoal(null);
    expect(buildPlannerViews(input).actionsWithoutGoal).toEqual([b]);
  });
  it('moves completed actions between dates but leaves them in the completed column', () => {
    const a = action('a', false, '2026-09-13');
    a.complete(null, now, id('complete'));
    a.setPlan(DayDate.create('2026-09-18'), false);
    const view = buildPlannerViews({ goals: [], actions: [a], spheres: [], directions: [] });
    expect(view.actionsByDate.get('2026-09-13')).toBeUndefined();
    expect(view.actionsByDate.get('2026-09-18')).toEqual([a]);
    expect(view.actionsByColumn.get('completed')).toEqual([a]);
    expect(a.completedAt).toEqual(now);
  });
  it('hides legacy cancelled recurrence occurrences while keeping standalone cancellations', () => {
    const recurring = action('legacy-recurring', false, '2026-09-15');
    recurring.setPlanningMetadata({
      occurrence: {
        ruleId: 'removed-rule',
        slot: '2026-09-15',
        originalDate: '2026-09-15',
        ruleRevision: 1,
      },
    });
    recurring.cancel(now, id('cancel-recurring'), ActionCancelReason.create('Серия удалена'));
    const standalone = action('standalone', false, '2026-09-15');
    standalone.cancel(now, id('cancel-standalone'), ActionCancelReason.create('Не актуально'));

    const view = buildPlannerViews({
      goals: [],
      actions: [recurring, standalone],
      spheres: [],
      directions: [],
    });

    expect(view.actionsByDate.get('2026-09-15')).toEqual([standalone]);
    expect(view.actionsByColumn.get('cancelled')).toEqual([standalone]);
    expect(view.actionsWithoutGoal).toEqual([standalone]);
  });
  it('indexes a large collection and produces Monday-first calendar days across leap years', () => {
    const actions = Array.from({ length: 2500 }, (_, i) => action(`a${i}`, true, '2026-09-13'));
    expect(
      buildPlannerViews({ goals: [goal], actions, spheres: [], directions: [] }).actionsByGoal.get(
        'g',
      ),
    ).toHaveLength(2500);
    const days = calendarMonthDays('2024-02-14');
    expect(days).toHaveLength(35);
    expect(days[0]).toBe('2024-01-29');
    expect(days).toContain('2024-02-29');
    expect(calendarMonthDays('2026-12-15').at(-1)).toBe('2027-01-03');
  });
});
