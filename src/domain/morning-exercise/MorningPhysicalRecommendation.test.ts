import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { EXERCISE_MEASUREMENT_TYPE, SYSTEM_EXERCISE_DEFINITION_ID } from './ExerciseDefinition';
import { MorningPhysicalExecution } from './MorningPhysicalExecution';
import {
  buildMorningPhysicalRecommendation,
  createReadyMorningPhysicalPlan,
} from './MorningPhysicalRecommendation';
import type { MorningPhysicalPlanItem } from './MorningPhysicalPlan';

describe('MorningPhysicalRecommendation', () => {
  it('создаёт готовый комплекс на турник и коврик примерно на 30 минут', () => {
    expect(createReadyMorningPhysicalPlan().map(serializedPlanItem)).toEqual([
      'morning-exercise.warm-up:2:150',
      'morning-exercise.pull-ups:3:4',
      'morning-exercise.push-ups:3:10',
      'morning-exercise.squats:3:15',
      'morning-exercise.plank:2:30',
      'morning-exercise.stretching:2:150',
    ]);
  });

  it('предлагает плюс один повтор или пять секунд после выполнения всех целей', () => {
    const plan = createReadyMorningPhysicalPlan();
    const execution = completedExecution(plan, (item) =>
      item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
        ? item.targetReps
        : item.targetDurationSeconds,
    );

    expect(buildMorningPhysicalRecommendation(plan, execution)?.map(serializedPlanItem)).toEqual([
      'morning-exercise.warm-up:2:150',
      'morning-exercise.pull-ups:3:5',
      'morning-exercise.push-ups:3:11',
      'morning-exercise.squats:3:16',
      'morning-exercise.plank:2:35',
      'morning-exercise.stretching:2:150',
    ]);
  });

  it('предлагает снижение после результата ниже 80 процентов и не меняет пограничный результат', () => {
    const plan: readonly MorningPhysicalPlanItem[] = [
      repetition(SYSTEM_EXERCISE_DEFINITION_ID.pullUps, 2, 10),
      repetition(SYSTEM_EXERCISE_DEFINITION_ID.pushUps, 1, 10),
    ];
    const execution = completedExecution(plan, (item, setNumber) => {
      if (item.exerciseDefinitionId.toString() === SYSTEM_EXERCISE_DEFINITION_ID.pullUps) {
        return setNumber === 1 ? 7 : 10;
      }
      return 8;
    });

    expect(buildMorningPhysicalRecommendation(plan, execution)?.map(serializedPlanItem)).toEqual([
      'morning-exercise.pull-ups:2:9',
      'morning-exercise.push-ups:1:10',
    ]);
  });

  it('предлагает снижение при пропущенном подходе', () => {
    const plan = [repetition(SYSTEM_EXERCISE_DEFINITION_ID.pullUps, 2, 4)] as const;
    const execution = MorningPhysicalExecution.start(plan, at(0));
    execution.completeSet(
      EntityId.create(SYSTEM_EXERCISE_DEFINITION_ID.pullUps),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 4 },
      at(1),
    );
    execution.advance();
    execution.skipSet(EntityId.create(SYSTEM_EXERCISE_DEFINITION_ID.pullUps), 2, at(2));
    execution.complete(at(3));

    expect(buildMorningPhysicalRecommendation(plan, execution)?.map(serializedPlanItem)).toEqual([
      'morning-exercise.pull-ups:2:3',
    ]);
  });

  it('не строит предложение до завершения выполнения', () => {
    const plan = [repetition(SYSTEM_EXERCISE_DEFINITION_ID.pullUps, 1, 4)] as const;
    const execution = MorningPhysicalExecution.start(plan, at(0));

    expect(() => buildMorningPhysicalRecommendation(plan, execution)).toThrowError(
      'Сначала завершите зарядку.',
    );
  });
});

function completedExecution(
  plan: readonly MorningPhysicalPlanItem[],
  actualFor: (item: MorningPhysicalPlanItem, setNumber: number) => number,
): MorningPhysicalExecution {
  const execution = MorningPhysicalExecution.start(plan, at(0));
  for (let index = 0; index < execution.sets.length; index += 1) {
    const set = execution.currentSet;
    const item = plan.find(({ exerciseDefinitionId }) =>
      exerciseDefinitionId.equals(set.exerciseDefinitionId),
    )!;
    const actual = actualFor(item, set.setNumber);
    execution.completeSet(
      set.exerciseDefinitionId,
      set.setNumber,
      set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
        ? { measurementType: set.measurementType, actualReps: actual }
        : { measurementType: set.measurementType, actualDurationSeconds: actual },
      at(index + 1),
    );
    if (index < execution.sets.length - 1) execution.advance();
  }
  execution.complete(at(execution.sets.length + 1));
  return execution;
}

function repetition(id: string, sets: number, targetReps: number): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: EntityId.create(id),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets,
    targetReps,
  };
}

function serializedPlanItem(item: MorningPhysicalPlanItem): string {
  return `${item.exerciseDefinitionId.toString()}:${item.sets}:${
    item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
      ? item.targetReps
      : item.targetDurationSeconds
  }`;
}

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 4, 6, minutes));
}
