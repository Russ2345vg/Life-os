import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_RECOMMENDATION_STATUS,
  MORNING_PHYSICAL_STATUS,
  MorningCycle,
  MorningPhysicalExecution,
} from '../../../domain';
import { MorningCycleRecordMapper } from './MorningCycleRecordMapper';

describe('MorningCycleRecordMapper physical recommendation', () => {
  it('round-trips a pending recommendation and keeps legacy records nullable', () => {
    const execution = completedExecution();
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('cycle'),
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
      physicalUpdatedAt: at(3),
      physicalPlanItems: [plan(4)],
      physicalExecution: execution,
      physicalRecommendation: {
        status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending,
        planItems: [plan(5)],
        createdAt: at(4),
        decidedAt: null,
      },
      updatedAt: at(4),
      version: 6,
    });

    const record = MorningCycleRecordMapper.toRecord(cycle);
    expect(record.physicalRecommendation).toEqual({
      status: 'PENDING',
      planItems: [
        {
          exerciseDefinitionId: 'morning-exercise.pull-ups',
          measurementType: 'REPETITIONS',
          sets: 1,
          targetReps: 5,
        },
      ],
      createdAt: at(4).toISOString(),
      decidedAt: null,
    });
    expect(MorningCycleRecordMapper.fromRecord(record).physicalRecommendation).toMatchObject({
      status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending,
      planItems: [{ targetReps: 5 }],
    });

    const legacy = { ...record } as Record<string, unknown>;
    delete legacy.physicalRecommendation;
    expect(MorningCycleRecordMapper.fromRecord(legacy).physicalRecommendation).toBeNull();
  });

  it('maps an invalid recommendation to persistence.invalid_record', () => {
    const execution = completedExecution();
    const record = {
      schemaVersion: 1,
      id: 'cycle',
      dayId: 'day',
      dateKey: '2026-10-04',
      state: 'IN_PROGRESS',
      startedAt: at(0).toISOString(),
      finishedAt: null,
      shortenedMode: false,
      stageStates: [],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: 'DONE',
      physicalUpdatedAt: at(3).toISOString(),
      physicalPlanItems: [recordPlan(4)],
      physicalExecution: MorningCycleRecordMapper.toRecord(
        MorningCycle.rehydrate({
          id: EntityId.create('source'),
          dayId: EntityId.create('day-source'),
          dateKey: DayDate.create('2026-10-03'),
          state: MORNING_CYCLE_STATE.inProgress,
          startedAt: at(0),
          finishedAt: null,
          shortenedMode: false,
          stageStates: [],
          waterCompletedAt: null,
          waterAmountMl: null,
          physicalStatus: MORNING_PHYSICAL_STATUS.done,
          physicalUpdatedAt: at(3),
          physicalPlanItems: [plan(4)],
          physicalExecution: execution,
          updatedAt: at(3),
          version: 4,
        }),
      ).physicalExecution,
      physicalRecommendation: {
        status: 'PENDING',
        planItems: [],
        createdAt: at(4).toISOString(),
        decidedAt: null,
      },
      updatedAt: at(4).toISOString(),
      version: 6,
    };

    expect(() => MorningCycleRecordMapper.fromRecord(record)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_record' }),
    );
  });
});

function completedExecution(): MorningPhysicalExecution {
  const execution = MorningPhysicalExecution.start([plan(4)], at(1));
  execution.completeSet(
    EntityId.create('morning-exercise.pull-ups'),
    1,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 4 },
    at(2),
  );
  execution.complete(at(3));
  return execution;
}

function plan(targetReps: number) {
  return {
    exerciseDefinitionId: EntityId.create('morning-exercise.pull-ups'),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets: 1,
    targetReps,
  } as const;
}

function recordPlan(targetReps: number) {
  return {
    exerciseDefinitionId: 'morning-exercise.pull-ups',
    measurementType: 'REPETITIONS',
    sets: 1,
    targetReps,
  };
}

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 4, 6, minutes));
}
