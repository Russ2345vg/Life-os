import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import {
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  ExerciseDefinition,
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
} from './ExerciseDefinition';

const NOW = new Date('2026-08-27T07:00:00.000+09:00');
const LATER = new Date('2026-08-27T07:05:00.000+09:00');

describe('ExerciseDefinition', () => {
  it('нормализует пользовательское название и сохраняет стабильный тип учёта', () => {
    const definition = ExerciseDefinition.create({
      id: EntityId.create('custom-burpees'),
      name: '  Бёрпи   утром  ',
      measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      source: EXERCISE_DEFINITION_SOURCE.custom,
      occurredAt: NOW,
    });

    expect(definition.name).toBe('Бёрпи утром');
    expect(definition.normalizedName).toBe('бёрпи утром');
    expect(definition.measurementType).toBe(EXERCISE_MEASUREMENT_TYPE.repetitions);
    expect(definition.source).toBe(EXERCISE_DEFINITION_SOURCE.custom);
    expect(definition.archivedAt).toBeNull();
    expect(definition.version).toBe(1);
  });

  it.each(['', '   ', 'x'.repeat(81)])('отклоняет непригодное название: %j', (name) => {
    expect(() => customDefinition(name)).toThrowError('Название упражнения указано неверно.');
  });

  it('содержит семь стабильных системных определений в приоритетном порядке', () => {
    expect(
      SYSTEM_EXERCISE_DEFINITION_SEEDS.map(({ id, name, measurementType }) => ({
        id,
        name,
        measurementType,
      })),
    ).toEqual([
      {
        id: 'morning-exercise.warm-up',
        name: 'Разминка',
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      },
      {
        id: 'morning-exercise.pull-ups',
        name: 'Подтягивания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      },
      {
        id: 'morning-exercise.push-ups',
        name: 'Отжимания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      },
      {
        id: 'morning-exercise.squats',
        name: 'Приседания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      },
      {
        id: 'morning-exercise.plank',
        name: 'Планка',
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      },
      {
        id: 'morning-exercise.abs',
        name: 'Пресс',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      },
      {
        id: 'morning-exercise.stretching',
        name: 'Растяжка',
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      },
    ]);
  });

  it('архивирует определение идемпотентно, не меняя его идентичность и тип', () => {
    const definition = customDefinition('Бёрпи');

    expect(definition.archive(LATER)).toBe(true);
    const archivedAt = definition.archivedAt;
    expect(definition.archive(new Date('2026-08-27T07:10:00.000+09:00'))).toBe(false);

    expect(definition.id.toString()).toBe('custom-exercise');
    expect(definition.measurementType).toBe(EXERCISE_MEASUREMENT_TYPE.repetitions);
    expect(definition.archivedAt).toEqual(archivedAt);
    expect(definition.version).toBe(2);
  });

  it('возвращает защитные копии дат', () => {
    const definition = customDefinition('Бёрпи');
    definition.archive(LATER);

    const firstRead = definition.archivedAt;
    firstRead?.setFullYear(2035);

    expect(definition.archivedAt).toEqual(LATER);
  });
});

function customDefinition(name: string): ExerciseDefinition {
  return ExerciseDefinition.create({
    id: EntityId.create('custom-exercise'),
    name,
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    source: EXERCISE_DEFINITION_SOURCE.custom,
    occurredAt: NOW,
  });
}
