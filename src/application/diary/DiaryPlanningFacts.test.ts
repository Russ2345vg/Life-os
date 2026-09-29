import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal } from '../../domain';
import type { PlanningState } from '../ports/PlanningRepository';
import { buildWeeklyGoalReview } from '../queries/GetWeeklyGoalReview';
import { buildDiaryMonthPlanningFacts, buildDiaryWeekPlanningFacts } from './DiaryPlanningFacts';

const state = (): PlanningState => ({
  goals: [
    Goal.create({
      id: EntityId.create('goal'),
      title: 'Здоровье',
      status: 'active',
      now: new Date('2026-09-01'),
    }),
  ],
  actions: [],
  periods: [],
  memberships: [],
  decisions: [],
  links: [],
  contributions: [],
  rules: [],
  legacyFocus: [],
  journal: [],
});

describe('DiaryPlanningFacts', () => {
  it('uses the canonical weekly goal review for the selected week', () => {
    const current = state();
    expect(
      buildDiaryWeekPlanningFacts(
        current,
        DayDate.create('2026-09-14'),
        DayDate.create('2026-09-29'),
      ),
    ).toEqual(buildWeeklyGoalReview(current, '2026-09-29', '2026-09-14'));
  });

  it('rebuilds monthly facts from current planning state without persisting them in diary data', () => {
    const current = state();
    const first = buildDiaryMonthPlanningFacts(
      current,
      DayDate.create('2026-09-01'),
      DayDate.create('2026-09-29'),
    );
    current.contributions.push({
      id: 'manual',
      version: 1,
      schemaVersion: 1,
      updatedAt: '2026-09-20T10:00:00.000Z',
      goalId: 'goal',
      actionId: null,
      completionKey: null,
      linkId: null,
      source: 'manual',
      amount: 2,
      effectiveDate: '2026-09-20',
      occurredAt: '2026-09-20T10:00:00.000Z',
      voided: false,
      reason: 'Факт',
    });
    const second = buildDiaryMonthPlanningFacts(
      current,
      DayDate.create('2026-09-01'),
      DayDate.create('2026-09-29'),
    );
    expect(first.goals[0]).toMatchObject({ recordCount: 0, amount: 0 });
    expect(second.goals[0]).toMatchObject({ recordCount: 1, amount: 2 });
    expect(JSON.stringify(second)).not.toContain('DiaryEntry');
  });
});
