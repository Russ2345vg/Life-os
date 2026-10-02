import { expect, it, vi } from 'vitest';
import { EntityId, Goal } from '../../domain';
import type { CreateGoal } from '../../application';
import { success } from '../../shared/result/Result';
import {
  emptyActionDraft,
  emptyGoalDraft,
  submitPlannerActionWithScenario,
  submitPlannerGoal,
  submitPlannerGoalWithPeriod,
} from './plannerFormSubmission';
import { thirtyDayPeriod } from '../../domain/planner/PlanningPeriod';
import type { CreateLifeActionDraft } from '../../application';
import { LifeAction, LifeActionTitle } from '../../domain';

it('creates an active goal with a matching stage so editing text cannot move it to future', async () => {
  const execute = vi.fn<CreateGoal['execute']>(async (input) =>
    success(
      Goal.create({ ...input, id: EntityId.create('goal'), now: new Date('2026-09-21T10:00:00Z') }),
    ),
  );
  const goal = await submitPlannerGoal({ execute }, { ...emptyGoalDraft(), title: 'Найти жильё' });
  expect(goal.status).toBe('active');
  expect(goal.stage).toBe('active_goal');
});

it('uses existing planning memberships and reports a saved goal when period assignment fails', async () => {
  const execute = vi.fn<CreateGoal['execute']>(async (input) =>
    success(Goal.create({ ...input, id: EntityId.create('goal'), now: new Date() })),
  );
  const participate = vi.fn(async () => {});
  const periods = { startCycle: vi.fn(async () => thirtyDayPeriod('2026-09-10')), participate };
  const draft = { ...emptyGoalDraft(), title: 'Цель', period: 'thirty_days' as const };
  const saved = await submitPlannerGoalWithPeriod({ execute }, draft, periods, '2026-09-21');
  expect(participate).toHaveBeenCalledWith('thirty_days', '2026-09-10', 'goal', 'goal');
  expect(saved.warning).toBeNull();
  participate.mockRejectedValueOnce(new Error('offline'));
  const partial = await submitPlannerGoalWithPeriod({ execute }, draft, periods, '2026-09-21');
  expect(partial.goal.id.toString()).toBe('goal');
  expect(partial.warning).toContain('Цель сохранена');
  expect(execute).toHaveBeenCalledTimes(2);
});

it('adds a created goal action to the selected scenario and preserves partial success', async () => {
  const execute = vi.fn<CreateLifeActionDraft['execute']>(async () =>
    success(
      LifeAction.createDraft({
        id: EntityId.create('action-1'),
        title: LifeActionTitle.create('Первый шаг'),
        createdAt: new Date(),
        eventId: EntityId.create('event-1'),
      }),
    ),
  );
  const addAction = vi.fn(async (scenarioId: string, actionId: string) => {
    expect(scenarioId).toBe('scenario-1');
    expect(actionId).toBe('action-1');
  });
  const draft = { ...emptyActionDraft('goal-1'), title: 'Первый шаг', scenarioId: 'scenario-1' };
  const saved = await submitPlannerActionWithScenario({ execute }, draft, { addAction });
  expect(addAction).toHaveBeenCalledWith('scenario-1', 'action-1');
  expect(saved.warning).toBeNull();
  addAction.mockRejectedValueOnce(new Error('Сценарий заполнен'));
  const partial = await submitPlannerActionWithScenario({ execute }, draft, { addAction });
  expect(partial.warning).toContain('Действие сохранено');
  expect(execute).toHaveBeenCalledTimes(2);
});
