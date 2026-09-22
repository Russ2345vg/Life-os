import { expect, it, vi } from 'vitest';
import { EntityId, Goal } from '../../domain';
import type { CreateGoal } from '../../application';
import { success } from '../../shared/result/Result';
import {
  emptyGoalDraft,
  submitPlannerGoal,
  submitPlannerGoalWithPeriod,
} from './plannerFormSubmission';
import { thirtyDayPeriod } from '../../domain/planner/PlanningPeriod';

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
