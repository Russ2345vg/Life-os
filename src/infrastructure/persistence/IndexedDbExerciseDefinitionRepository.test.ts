import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  EntityId,
  ExerciseDefinition,
} from '../../domain';
import { IndexedDbExerciseDefinitionRepository } from './IndexedDbExerciseDefinitionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const NOW = new Date('2026-08-27T07:00:00.000+09:00');

describe('IndexedDbExerciseDefinitionRepository', () => {
  it('возвращает пять системных упражнений из единого каталога', async () => {
    const repository = new IndexedDbExerciseDefinitionRepository(
      new LifeOsIndexedDb(new IDBFactory()),
    );

    expect((await repository.findAll()).map(({ name }) => name)).toEqual([
      'Отжимания',
      'Подтягивания',
      'Приседания',
      'Планка',
      'Пресс',
    ]);
  });

  it('сохраняет пользовательское упражнение после закрытия и повторного открытия базы', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = new IndexedDbExerciseDefinitionRepository(firstDatabase);
    const definition = customDefinition('Вис на перекладине');

    expect(await first.add(definition)).toBe(true);
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(factory);
    const second = new IndexedDbExerciseDefinitionRepository(secondDatabase);
    const restored = await second.findById(definition.id);

    expect(restored?.name).toBe('Вис на перекладине');
    expect(restored?.measurementType).toBe(EXERCISE_MEASUREMENT_TYPE.duration);
    expect(restored?.source).toBe(EXERCISE_DEFINITION_SOURCE.custom);
    secondDatabase.close();
  });

  it('не перезаписывает определение с тем же нормализованным названием', async () => {
    const repository = new IndexedDbExerciseDefinitionRepository(
      new LifeOsIndexedDb(new IDBFactory()),
    );

    expect(await repository.add(customDefinition('Бёрпи'))).toBe(true);
    expect(await repository.add(customDefinition('  бёрпи ', 'other-custom'))).toBe(false);
    expect(
      (await repository.findAll()).filter(({ normalizedName }) => normalizedName === 'бёрпи'),
    ).toHaveLength(1);
  });

  it('сохраняет архивированное определение для старых планов', async () => {
    const repository = new IndexedDbExerciseDefinitionRepository(
      new LifeOsIndexedDb(new IDBFactory()),
    );
    const definition = customDefinition('Бёрпи');
    definition.archive(new Date('2026-08-27T07:05:00.000+09:00'));
    await repository.add(definition);

    expect((await repository.findById(definition.id))?.archivedAt).toEqual(
      new Date('2026-08-27T07:05:00.000+09:00'),
    );
  });
});

function customDefinition(name: string, id = 'custom-exercise'): ExerciseDefinition {
  return ExerciseDefinition.create({
    id: EntityId.create(id),
    name,
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
    source: EXERCISE_DEFINITION_SOURCE.custom,
    occurredAt: NOW,
  });
}
