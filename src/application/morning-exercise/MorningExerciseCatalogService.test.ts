import { describe, expect, it } from 'vitest';
import { EXERCISE_MEASUREMENT_TYPE } from '../../domain';
import { InMemoryExerciseDefinitionRepository } from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { MorningExerciseCatalogService } from './MorningExerciseCatalogService';

const NOW = new Date('2026-08-27T07:10:00.000+09:00');

describe('MorningExerciseCatalogService', () => {
  it('создаёт одно переиспользуемое пользовательское упражнение на время', async () => {
    const repository = new InMemoryExerciseDefinitionRepository();
    const service = new MorningExerciseCatalogService(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('custom-exercise'),
    );

    const created = await service.createCustom(
      '  Вис на   перекладине ',
      EXERCISE_MEASUREMENT_TYPE.duration,
    );

    expect(created).toMatchObject({
      name: 'Вис на перекладине',
      source: 'CUSTOM',
      measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
    });
    expect((await repository.findAll()).map(({ name }) => name)).toContain('Вис на перекладине');
  });

  it('отклоняет нормализованный дубль и сохраняет исходное определение', async () => {
    const repository = new InMemoryExerciseDefinitionRepository();
    const service = new MorningExerciseCatalogService(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('custom-exercise'),
    );
    await service.createCustom('Бёрпи', EXERCISE_MEASUREMENT_TYPE.repetitions);

    await expect(
      service.createCustom('  бёрпи ', EXERCISE_MEASUREMENT_TYPE.duration),
    ).rejects.toThrow('Упражнение с таким названием уже существует.');
    expect(await repository.findAll()).toHaveLength(1);
    expect((await repository.findAll())[0]?.measurementType).toBe(
      EXERCISE_MEASUREMENT_TYPE.repetitions,
    );
  });
});
