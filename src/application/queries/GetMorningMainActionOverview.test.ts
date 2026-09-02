import { describe, expect, it } from 'vitest';
import {
  DECISION_KIND,
  DayDate,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineBlock,
  RoutineBlockRecurrence,
  TOMORROW_PLAN_STATUS,
  TomorrowPlan,
  resolveRoutineOccurrencesForDate,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { resolveMorningMainActionOverview } from './GetMorningMainActionOverview';

const DATE = DayDate.create('2026-08-28');
const NOW = new Date('2026-08-28T07:00:00.000+09:00');

describe('resolveMorningMainActionOverview', () => {
  it('projects the approved decision, expected result, time and first step from authoritative sources', () => {
    const decision = createPlannedDecision('primary', DATE, DECISION_KIND.main, 1);
    const firstStep = createReadyLifeAction('first-step', DATE, { decisionId: decision.id });

    const overview = resolveMorningMainActionOverview({
      plan: plan(decision.id, firstStep.id, 'Собрать рабочий прототип'),
      decisions: [decision],
      lifeActions: [firstStep],
      occurrences: [occurrence(firstStep.id, '09:30', '10:15')],
    });

    expect(overview).toMatchObject({
      decisionTitle: 'Решение primary',
      expectedResult: 'Собрать рабочий прототип',
      firstStepTitle: 'Действие first-step',
      scheduledTime: '09:30–10:15',
      completed: false,
      ready: true,
      candidates: [],
    });
    expect(overview.firstStepId?.equals(firstStep.id)).toBe(true);
  });

  it('offers only active target-day candidates of the primary decision when first step is absent', () => {
    const primary = createPlannedDecision('primary', DATE, DECISION_KIND.main, 1);
    const other = createPlannedDecision('other', DATE, DECISION_KIND.main, 2);
    const later = createReadyLifeAction('later', DATE, {
      decisionId: primary.id,
      createdAt: new Date('2026-08-01T10:00:00.000+09:00'),
    });
    const first = createReadyLifeAction('first', DATE, {
      decisionId: primary.id,
      createdAt: new Date('2026-08-01T08:00:00.000+09:00'),
    });
    const unrelated = createReadyLifeAction('unrelated', DATE, { decisionId: other.id });

    const overview = resolveMorningMainActionOverview({
      plan: plan(primary.id, null, 'Минимальный результат'),
      decisions: [other, primary],
      lifeActions: [later, unrelated, first],
      occurrences: [],
    });

    expect(overview.firstStepId).toBeNull();
    expect(overview.ready).toBe(false);
    expect(overview.candidates.map((candidate) => candidate.title)).toEqual([
      'Действие first',
      'Действие later',
    ]);
  });

  it('keeps a completed first step ready without requiring a future time block', () => {
    const decision = createPlannedDecision('done', DATE, DECISION_KIND.main, 1);
    const firstStep = completeLifeAction(
      createReadyLifeAction('done-step', DATE, { decisionId: decision.id }),
    );

    const overview = resolveMorningMainActionOverview({
      plan: plan(decision.id, firstStep.id, 'Готовый результат'),
      decisions: [decision],
      lifeActions: [firstStep],
      occurrences: [],
    });

    expect(overview.completed).toBe(true);
    expect(overview.scheduledTime).toBeNull();
    expect(overview.ready).toBe(true);
  });
});

function plan(
  primaryDecisionId: EntityId,
  firstActionId: EntityId | null,
  minimumOutcome: string,
): TomorrowPlan {
  return TomorrowPlan.rehydrate({
    id: EntityId.create(`plan-${primaryDecisionId.toString()}`),
    cycleId: EntityId.create('evening-cycle'),
    sourceDayId: EntityId.create('source-day'),
    targetDayId: EntityId.create('target-day'),
    targetDateKey: DATE,
    directionId: null,
    vector: null,
    primaryDecisionId,
    minimumOutcome,
    targetOutcome: null,
    stretchOutcome: null,
    firstActionId,
    firstAttentionItem: null,
    supportingDecisionIds: [],
    status: TOMORROW_PLAN_STATUS.inProgress,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    version: 1,
  });
}

function occurrence(actionId: EntityId, startTime: string, endTime: string) {
  const block = RoutineBlock.create({
    id: EntityId.create('main-action-block'),
    anchorDate: DATE,
    title: 'Главное действие',
    startTime,
    endTime,
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: true,
    assignment: { kind: ROUTINE_BLOCK_ASSIGNMENT.existingAction, actionId },
    now: NOW,
  });
  return resolveRoutineOccurrencesForDate([block], [], DATE)[0]!;
}
