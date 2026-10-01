import { describe, expect, it } from 'vitest';
import {
  ActionActualResult,
  ActionExpectedResult,
  DayDate,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
} from '../../domain';
import {
  automaticPeriod,
  membershipId,
  type PeriodMembership,
  type PlanningPeriod,
} from '../../domain/planner/PlanningPeriod';
import type { PlanningState } from '../ports/PlanningRepository';
import { buildTodayGoalGuidance } from './GetTodayGoalGuidance';

const today = '2026-10-01';
const now = new Date('2026-10-01T08:00:00.000Z');

function goal(id: string, title: string) {
  return Goal.create({ id: EntityId.create(id), title, status: 'active', now });
}

function action(id: string, parent: Goal, date: string | null = null, main = false) {
  return LifeAction.createDraft({
    id: EntityId.create(id),
    title: LifeActionTitle.create(`Шаг ${id}`),
    goalId: parent.id,
    ...(date ? { plannedDate: DayDate.create(date) } : {}),
    isNext: main,
    createdAt: now,
    eventId: EntityId.create(`${id}-created`),
  });
}

function state(goals: Goal[], actions: LifeAction[], primaryId?: string): PlanningState {
  const period: PlanningPeriod = {
    ...automaticPeriod('week', today),
    primaryGoalId: primaryId ?? null,
  };
  const memberships: PeriodMembership[] = primaryId
    ? [
        {
          id: membershipId(period.id, 'goal', primaryId),
          periodId: period.id,
          entityType: 'goal',
          entityId: primaryId,
          focused: true,
          removed: false,
          schemaVersion: 1,
          version: 1,
          updatedAt: now.toISOString(),
        },
      ]
    : [];
  return {
    goals,
    actions,
    periods: [period],
    memberships,
    decisions: [],
    links: [],
    contributions: [],
    rules: [],
    legacyFocus: [],
    journal: [],
  };
}

describe('buildTodayGoalGuidance', () => {
  it('shows empty state when there are no active goals even after clearing a selection', () => {
    const snapshot = state([], []);
    expect(buildTodayGoalGuidance(snapshot, today).status).toBe('empty');
    expect(buildTodayGoalGuidance(snapshot, today, { goal: null }).status).toBe('empty');
  });

  it('offers the explicitly selected next action of the main weekly goal', () => {
    const base = goal('portfolio', 'Портфолио');
    const step = action('draft', base);
    const saved = base.selectNextAction(step.id, now);
    const result = buildTodayGoalGuidance(state([saved], [step], saved.id.toString()), today);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.goalId).toBe('portfolio');
    expect(result.actionId).toBe('draft');
    expect(result.goalReason).toBe('weekly-primary');
    expect(result.actionReason).toBe('goal-next-action');
    expect(result.cta).toBe('add-today');
  });

  it('asks for a goal when no main weekly goal was chosen', () => {
    const a = goal('a', 'Альфа');
    const b = goal('b', 'Бета');
    const result = buildTodayGoalGuidance(state([b, a], []), today);
    expect(result.status).toBe('choose-goal');
    expect(result.goals.map((item) => item.title)).toEqual(['Альфа', 'Бета']);
  });

  it('asks for an action instead of treating a sorted action as a recommendation', () => {
    const g = goal('g', 'Цель');
    const result = buildTodayGoalGuidance(state([g], [action('a', g)], 'g'), today);
    expect(result.status).toBe('choose-action');
    if (result.status !== 'choose-action') return;
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.id).toBe('a');
  });

  it('keeps the original default visible when the weekly priority changes and explains the change', () => {
    const first = goal('first', 'Первая');
    const second = goal('second', 'Вторая');
    const step = action('step', first);
    const saved = first.selectNextAction(step.id, now);
    const current = state([saved, second], [step], 'second');
    const result = buildTodayGoalGuidance(current, today, {
      goal: { id: 'first', origin: 'default' },
      action: { id: 'step', origin: 'default' },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.goalId).toBe('first');
    expect(result.goalReason).toBe('source-changed');
    expect(result.actionReason).toBe('goal-next-action');
  });

  it('changes the source key when a changed next step changes again', () => {
    const g = goal('g', 'Цель');
    const original = action('original', g);
    const newer = action('newer', g);
    const latest = action('latest', g);
    const selected = {
      goal: { id: 'g', origin: 'default' as const },
      action: { id: 'original', origin: 'default' as const },
    };
    const first = g.selectNextAction(original.id, now);
    const second = first.selectNextAction(newer.id, now);
    const third = second.selectNextAction(latest.id, now);
    const before = buildTodayGoalGuidance(
      state([second], [original, newer, latest], 'g'),
      today,
      selected,
    );
    const after = buildTodayGoalGuidance(
      state([third], [original, newer, latest], 'g'),
      today,
      selected,
    );
    expect(before.status).toBe('ready');
    expect(after.status).toBe('ready');
    if (before.status === 'ready' && after.status === 'ready') {
      expect(before.actionReason).toBe('source-changed');
      expect(after.actionReason).toBe('source-changed');
      expect(after.sourceKey).not.toBe(before.sourceKey);
    }
  });

  it('does not choose a replacement after the selected action is completed', () => {
    const g = goal('g', 'Цель');
    const selected = action('selected', g, today);
    selected.makeReady({
      expectedResult: ActionExpectedResult.create('Результат'),
      plannedDate: DayDate.create(today),
      occurredAt: now,
      eventId: EntityId.create('ready'),
    });
    selected.markInProgress(now, EntityId.create('started'));
    selected.complete(ActionActualResult.create('Сделано'), now, EntityId.create('done'));
    const replacement = action('replacement', g);
    const saved = g.selectNextAction(selected.id, now);
    const result = buildTodayGoalGuidance(state([saved], [selected, replacement], 'g'), today, {
      goal: { id: 'g', origin: 'default' },
      action: { id: 'selected', origin: 'default' },
    });
    expect(result.status).toBe('selection-unavailable');
    expect(result.actions.map((item) => item.id)).toEqual(['replacement']);
  });

  it('distinguishes a future move from an action already on today', () => {
    const g = goal('g', 'Цель');
    const future = action('future', g, '2026-10-03', true);
    const existing = action('existing', g, today);
    const snapshot = state([g], [future, existing], 'g');
    const selected = { goal: { id: 'g', origin: 'user' as const } };
    const move = buildTodayGoalGuidance(snapshot, today, {
      ...selected,
      action: { id: 'future', origin: 'user' },
    });
    const open = buildTodayGoalGuidance(snapshot, today, {
      ...selected,
      action: { id: 'existing', origin: 'user' },
    });
    expect(move.status).toBe('ready');
    if (move.status === 'ready') {
      expect(move.cta).toBe('move-today');
      expect(move.mainOnPreviousDate).toBe(true);
    }
    expect(open.status).toBe('ready');
    if (open.status === 'ready') expect(open.cta).toBe('open-action');
  });

  it('does not refill a goal the user explicitly cleared', () => {
    const g = goal('g', 'Цель');
    const result = buildTodayGoalGuidance(state([g], [], 'g'), today, { goal: null });
    expect(result.status).toBe('choose-goal');
  });

  it('does not promote a supporting focus goal or last week’s main goal', () => {
    const g = goal('g', 'Цель');
    const snapshot = state([g], [], 'g');
    snapshot.periods[0] = { ...snapshot.periods[0]!, primaryGoalId: null };
    expect(buildTodayGoalGuidance(snapshot, today).status).toBe('choose-goal');
    expect(buildTodayGoalGuidance(state([g], [], 'g'), '2026-10-05').status).toBe('choose-goal');
  });

  it('does not offer an inactive goal or actions from another goal', () => {
    const active = goal('active', 'Активная');
    const future = Goal.create({ id: EntityId.create('future'), title: 'Позже', now });
    const other = action('other', future);
    const snapshot = state([future, active], [other], 'future');
    expect(buildTodayGoalGuidance(snapshot, today).goals.map((item) => item.id)).toEqual([
      'active',
    ]);
    expect(
      buildTodayGoalGuidance(snapshot, today, {
        goal: { id: 'active', origin: 'user' },
        action: { id: 'other', origin: 'user' },
      }).status,
    ).toBe('selection-unavailable');
  });

  it('allows opening but never moving an action in progress', () => {
    const g = goal('g', 'Цель');
    const step = action('step', g, '2026-10-03');
    step.makeReady({
      expectedResult: ActionExpectedResult.create('Результат'),
      plannedDate: DayDate.create('2026-10-03'),
      occurredAt: now,
      eventId: EntityId.create('ready-progress'),
    });
    step.markInProgress(now, EntityId.create('started-progress'));
    const saved = g.selectNextAction(step.id, now);
    const result = buildTodayGoalGuidance(state([saved], [step], 'g'), today);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.cta).toBe('open-action');
  });

  it('respects an explicitly cleared action despite a valid next action', () => {
    const g = goal('g', 'Цель');
    const step = action('step', g);
    const saved = g.selectNextAction(step.id, now);
    const result = buildTodayGoalGuidance(state([saved], [step], 'g'), today, { action: null });
    expect(result.status).toBe('choose-action');
  });
});
