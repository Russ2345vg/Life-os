import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { EXERCISE_MEASUREMENT_TYPE } from './ExerciseDefinition';
import {
  adjustMorningPhysicalPlanItem,
  assertMorningPhysicalPlanItems,
  createDefaultMorningPhysicalPlanItem,
  summarizeMorningPhysicalPlan,
  type MorningPhysicalPlanItem,
} from './MorningPhysicalPlan';

describe('MorningPhysicalPlan', () => {
  it('создаёт типоспецифичные значения по умолчанию', () => {
    expect(
      serializable(createDefaultMorningPhysicalPlanItem(id('push-ups'), 'REPETITIONS')),
    ).toEqual({
      exerciseDefinitionId: 'push-ups',
      measurementType: 'REPETITIONS',
      sets: 3,
      targetReps: 10,
    });
    expect(serializable(createDefaultMorningPhysicalPlanItem(id('plank'), 'DURATION'))).toEqual({
      exerciseDefinitionId: 'plank',
      measurementType: 'DURATION',
      sets: 3,
      targetDurationSeconds: 30,
    });
  });

  it('считает шесть подходов как объяснимый ориентир двенадцать минут', () => {
    expect(
      summarizeMorningPhysicalPlan([
        repetitionItem('push-ups', 3, 15),
        repetitionItem('pull-ups', 3, 6),
      ]),
    ).toEqual({
      selectedCount: 2,
      totalSets: 6,
      estimatedMinutes: 12,
    });
  });

  it('увеличивает повторения по одному, а длительность по пять секунд', () => {
    const reps = adjustMorningPhysicalPlanItem(repetitionItem('push-ups', 3, 10), {
      field: 'target',
      delta: 1,
    });
    const duration = adjustMorningPhysicalPlanItem(durationItem('plank', 3, 30), {
      field: 'target',
      delta: 1,
    });

    expect(reps.measurementType === 'REPETITIONS' ? reps.targetReps : null).toBe(11);
    expect(duration.measurementType === 'DURATION' ? duration.targetDurationSeconds : null).toBe(
      35,
    );
  });

  it('не выходит за безопасные границы обычным нажатием степпера', () => {
    const minSets = adjustMorningPhysicalPlanItem(repetitionItem('push-ups', 1, 1), {
      field: 'sets',
      delta: -1,
    });
    const maxReps = adjustMorningPhysicalPlanItem(repetitionItem('push-ups', 10, 100), {
      field: 'target',
      delta: 1,
    });
    const minDuration = adjustMorningPhysicalPlanItem(durationItem('plank', 1, 5), {
      field: 'target',
      delta: -1,
    });

    expect(serializable(minSets)).toEqual(serializable(repetitionItem('push-ups', 1, 1)));
    expect(serializable(maxReps)).toEqual(serializable(repetitionItem('push-ups', 10, 100)));
    expect(serializable(minDuration)).toEqual(serializable(durationItem('plank', 1, 5)));
  });

  it.each([0, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'отклоняет некорректное число подходов: %s',
    (sets) => {
      expect(() =>
        assertMorningPhysicalPlanItems([repetitionItem('push-ups', sets, 10)]),
      ).toThrowError('План физической активации указан неверно.');
    },
  );

  it.each([0, 101, 1.5, Number.NaN, Number.NEGATIVE_INFINITY])(
    'отклоняет некорректную цель повторений: %s',
    (targetReps) => {
      expect(() =>
        assertMorningPhysicalPlanItems([repetitionItem('push-ups', 3, targetReps)]),
      ).toThrowError('План физической активации указан неверно.');
    },
  );

  it.each([4, 601, 31, Number.NaN, Number.POSITIVE_INFINITY])(
    'отклоняет некорректную цель времени: %s',
    (seconds) => {
      expect(() =>
        assertMorningPhysicalPlanItems([durationItem('plank', 3, seconds)]),
      ).toThrowError('План физической активации указан неверно.');
    },
  );

  it('отклоняет повтор одного определения в утреннем плане', () => {
    expect(() =>
      assertMorningPhysicalPlanItems([
        repetitionItem('push-ups', 3, 10),
        repetitionItem('push-ups', 4, 12),
      ]),
    ).toThrowError('План физической активации указан неверно.');
  });

  it('не смешивает повторения и секунды в одной ветке union', () => {
    const malformed = {
      ...repetitionItem('push-ups', 3, 10),
      targetDurationSeconds: 30,
    } as unknown as MorningPhysicalPlanItem;

    expect(() => assertMorningPhysicalPlanItems([malformed])).toThrowError(
      'План физической активации указан неверно.',
    );
  });
});

function id(value: string): EntityId {
  return EntityId.create(value);
}

function repetitionItem(
  definitionId: string,
  sets: number,
  targetReps: number,
): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: id(definitionId),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets,
    targetReps,
  };
}

function durationItem(
  definitionId: string,
  sets: number,
  targetDurationSeconds: number,
): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: id(definitionId),
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
    sets,
    targetDurationSeconds,
  };
}

function serializable(item: MorningPhysicalPlanItem): Record<string, string | number> {
  return {
    exerciseDefinitionId: item.exerciseDefinitionId.toString(),
    measurementType: item.measurementType,
    sets: item.sets,
    ...(item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
      ? { targetReps: item.targetReps }
      : { targetDurationSeconds: item.targetDurationSeconds }),
  };
}
