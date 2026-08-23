import { describe, expect, it } from 'vitest';
import {
  DECISION_KIND,
  DayDate,
  EntityId,
  MORNING_PHYSICAL_STATUS,
  MorningCycle,
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
import { MORNING_NEXT_STEP, resolveMorningOverview } from './GetMorningOverview';

const DATE = DayDate.create('2026-08-23');
const NOW = new Date('2026-08-23T07:12:00.000+09:00');

describe('resolveMorningOverview', () => {
  it('использует firstAction плана и самый ранний непропущенный интервал', () => {
    const firstDecision = createPlannedDecision('first-main', DATE, DECISION_KIND.main, 1);
    const plannedDecision = createPlannedDecision('planned-main', DATE, DECISION_KIND.main, 2);
    const fallback = createReadyLifeAction('fallback', DATE, { decisionId: firstDecision.id });
    const planned = createReadyLifeAction('planned', DATE, { decisionId: plannedDecision.id });
    const plan = tomorrowPlan(plannedDecision.id, planned.id);
    const skipped = occurrence('skipped', planned.id, '09:00', '09:30', true);
    const scheduled = occurrence('scheduled', planned.id, '10:00', '11:30');

    const overview = resolveMorningOverview({
      date: DATE,
      currentDate: DATE,
      cycle: readyCycle(),
      plan,
      decisions: [firstDecision, plannedDecision],
      lifeActions: [fallback, planned],
      occurrences: [skipped, scheduled],
    });

    expect(overview.mainAction?.id.equals(planned.id)).toBe(true);
    expect(overview.mainAction?.scheduledTime).toBe('10:00–11:30');
    expect(overview.progress).toBe(100);
    expect(overview.nextStep).toBe(MORNING_NEXT_STEP.goToDay);
  });

  it('использует действие первого главного Решения при отсутствии плана', () => {
    const secondDecision = createPlannedDecision('second', DATE, DECISION_KIND.main, 2);
    const firstDecision = createPlannedDecision('first', DATE, DECISION_KIND.main, 1);
    const secondAction = createReadyLifeAction('second-action', DATE, {
      decisionId: secondDecision.id,
    });
    const firstAction = createReadyLifeAction('first-action', DATE, {
      decisionId: firstDecision.id,
    });

    const overview = resolveMorningOverview({
      date: DATE,
      currentDate: DATE,
      cycle: readyCycle(),
      plan: null,
      decisions: [secondDecision, firstDecision],
      lifeActions: [secondAction, firstAction],
      occurrences: [],
    });

    expect(overview.mainAction?.id.equals(firstAction.id)).toBe(true);
    expect(overview.nextStep).toBe(MORNING_NEXT_STEP.scheduleMainAction);
    expect(overview.progress).toBe(75);
  });

  it('не требует времени или повторного выполнения для завершённого действия', () => {
    const decision = createPlannedDecision('done-main', DATE, DECISION_KIND.main, 1);
    const action = completeLifeAction(
      createReadyLifeAction('done-action', DATE, { decisionId: decision.id }),
    );

    const overview = resolveMorningOverview({
      date: DATE,
      currentDate: DATE,
      cycle: readyCycle(),
      plan: null,
      decisions: [decision],
      lifeActions: [action],
      occurrences: [],
    });

    expect(overview.mainAction?.completed).toBe(true);
    expect(overview.ready).toBe(true);
    expect(overview.nextStep).toBe(MORNING_NEXT_STEP.goToDay);
  });

  it('выбирает следующий шаг в одном обязательном порядке', () => {
    const decision = createPlannedDecision('main', DATE, DECISION_KIND.main, 1);
    const action = createReadyLifeAction('action', DATE, { decisionId: decision.id });
    const base = {
      date: DATE,
      currentDate: DATE,
      plan: null,
      decisions: [decision],
      lifeActions: [action],
      occurrences: [occurrence('time', action.id, '10:00', '11:30')],
    };

    expect(resolveMorningOverview({ ...base, cycle: null }).nextStep).toBe(
      MORNING_NEXT_STEP.startMorning,
    );
    const started = startedCycle();
    expect(resolveMorningOverview({ ...base, cycle: started }).nextStep).toBe(
      MORNING_NEXT_STEP.water,
    );
    started.completeWater(new Date('2026-08-23T07:14:00.000+09:00'), 250);
    expect(resolveMorningOverview({ ...base, cycle: started }).nextStep).toBe(
      MORNING_NEXT_STEP.physical,
    );
  });
});

function startedCycle(): MorningCycle {
  const cycle = MorningCycle.create({
    id: EntityId.create('cycle'),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    occurredAt: NOW,
  });
  cycle.start(NOW);
  return cycle;
}

function readyCycle(): MorningCycle {
  const cycle = startedCycle();
  cycle.completeWater(new Date('2026-08-23T07:14:00.000+09:00'), 250);
  cycle.skipPhysical(new Date('2026-08-23T07:15:00.000+09:00'));
  expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.skipped);
  return cycle;
}

function tomorrowPlan(primaryDecisionId: EntityId, firstActionId: EntityId): TomorrowPlan {
  return TomorrowPlan.rehydrate({
    id: EntityId.create('tomorrow-plan'),
    cycleId: EntityId.create('evening-cycle'),
    sourceDayId: EntityId.create('source-day'),
    targetDayId: EntityId.create('day'),
    targetDateKey: DATE,
    directionId: null,
    vector: null,
    primaryDecisionId,
    minimumOutcome: 'Минимальный результат',
    targetOutcome: null,
    stretchOutcome: null,
    firstActionId,
    firstAttentionItem: null,
    supportingDecisionIds: [],
    status: TOMORROW_PLAN_STATUS.completed,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    version: 2,
  });
}

function occurrence(
  id: string,
  actionId: EntityId,
  startTime: string,
  endTime: string,
  isSkipped = false,
) {
  const block = RoutineBlock.create({
    id: EntityId.create(id),
    anchorDate: DATE,
    title: `Блок ${id}`,
    startTime,
    endTime,
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: true,
    assignment: { kind: ROUTINE_BLOCK_ASSIGNMENT.existingAction, actionId },
    now: NOW,
  });
  const resolved = resolveRoutineOccurrencesForDate([block], [], DATE)[0]!;
  return isSkipped ? { ...resolved, isSkipped: true } : resolved;
}
