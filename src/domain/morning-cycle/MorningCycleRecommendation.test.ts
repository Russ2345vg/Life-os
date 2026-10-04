import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_RECOMMENDATION_STATUS,
  buildMorningPhysicalRecommendation,
} from '../morning-exercise';
import { EntityId } from '../shared/EntityId';
import { MorningCycle } from './MorningCycle';
import { MORNING_CYCLE_STATE } from './MorningCycleState';
import { MORNING_PHYSICAL_STATUS } from './MorningPhysicalStatus';

describe('MorningCycle physical recommendation', () => {
  it('сохраняет предложение только после завершения зарядки и принимает его один раз', () => {
    const cycle = completedCycle();
    const proposal = buildMorningPhysicalRecommendation(
      cycle.physicalPlanItems,
      cycle.physicalExecution!,
    )!;

    expect(cycle.proposePhysicalRecommendation(proposal, at(8))).toBe(true);
    expect(cycle.physicalRecommendation).toMatchObject({
      status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending,
      createdAt: at(8),
      decidedAt: null,
    });
    expect(cycle.acceptPhysicalRecommendation(at(9))).toBe(true);
    expect(cycle.acceptPhysicalRecommendation(at(10))).toBe(false);
    expect(cycle.physicalRecommendation).toMatchObject({
      status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.accepted,
      decidedAt: at(9),
    });

    const firstRead = cycle.physicalRecommendation!;
    (firstRead.planItems as unknown[]).splice(0, 1);
    firstRead.createdAt.setUTCFullYear(2030);
    expect(cycle.physicalRecommendation?.planItems).toHaveLength(1);
    expect(cycle.physicalRecommendation?.createdAt).toEqual(at(8));
  });

  it('отклоняет предложение и сохраняет текущий план основой следующего утра', () => {
    const cycle = completedCycle();
    const proposal = buildMorningPhysicalRecommendation(
      cycle.physicalPlanItems,
      cycle.physicalExecution!,
    )!;

    cycle.proposePhysicalRecommendation(proposal, at(8));
    expect(cycle.dismissPhysicalRecommendation(at(9))).toBe(true);
    expect(cycle.dismissPhysicalRecommendation(at(10))).toBe(false);
    expect(cycle.physicalRecommendation?.status).toBe(
      MORNING_PHYSICAL_RECOMMENDATION_STATUS.dismissed,
    );
  });

  it('не принимает предложение до завершения физического этапа', () => {
    const cycle = createCycle();
    cycle.start(at(0));
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.pull-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      at(1),
    );

    expect(() => cycle.proposePhysicalRecommendation(cycle.physicalPlanItems, at(2))).toThrowError(
      'Сначала завершите зарядку.',
    );
    expect(cycle.physicalRecommendation).toBeNull();
  });

  it('отклоняет сохранённое pending-предложение с временем решения', () => {
    expect(() =>
      MorningCycle.rehydrate({
        id: EntityId.create('cycle-invalid'),
        dayId: EntityId.create('day'),
        dateKey: DayDate.create('2026-10-04'),
        state: MORNING_CYCLE_STATE.inProgress,
        startedAt: at(0),
        finishedAt: null,
        shortenedMode: false,
        stageStates: [],
        waterCompletedAt: null,
        waterAmountMl: null,
        physicalStatus: MORNING_PHYSICAL_STATUS.done,
        physicalUpdatedAt: at(7),
        physicalPlanItems: [planItem(4)],
        physicalExecution: completedCycle().physicalExecution,
        physicalRecommendation: {
          status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending,
          planItems: [planItem(5)],
          createdAt: at(8),
          decidedAt: at(9),
        },
        updatedAt: at(9),
        version: 9,
      }),
    ).toThrowError('Предложение нагрузки указано неверно.');
  });
});

function completedCycle(): MorningCycle {
  const cycle = createCycle();
  cycle.start(at(0));
  cycle.selectPhysicalExercise(
    EntityId.create('morning-exercise.pull-ups'),
    EXERCISE_MEASUREMENT_TYPE.repetitions,
    at(1),
  );
  cycle.adjustPhysicalExercise(
    EntityId.create('morning-exercise.pull-ups'),
    { field: 'target', delta: -1 },
    at(2),
  );
  cycle.startPhysicalExecution(at(3));
  for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
    cycle.completePhysicalSet(
      EntityId.create('morning-exercise.pull-ups'),
      setNumber,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 9 },
      at(3 + setNumber),
    );
    if (setNumber < 3) cycle.advancePhysicalExecution(at(3 + setNumber));
  }
  cycle.completePhysicalExecution(at(7));
  return cycle;
}

function createCycle(): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create('cycle'),
    dayId: EntityId.create('day'),
    dateKey: DayDate.create('2026-10-04'),
    occurredAt: at(-1),
  });
}

function planItem(targetReps: number) {
  return {
    exerciseDefinitionId: EntityId.create('morning-exercise.pull-ups'),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets: 3,
    targetReps,
  } as const;
}

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 4, 6, minutes));
}
