import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_RECOMMENDATION_STATUS,
  MorningCycle,
  buildMorningPhysicalRecommendation,
} from '../../domain';
import { IndexedDbMorningCycleRepository } from './IndexedDbMorningCycleRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

describe('IndexedDbMorningCycleRepository', () => {
  it('восстанавливает активный подход после закрытия и повторного открытия базы', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstRepository = new IndexedDbMorningCycleRepository(firstDatabase);
    const cycle = createCycle('2026-10-04');
    cycle.start(at(0));
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.pull-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      at(1),
    );
    cycle.startPhysicalExecution(at(2));
    cycle.completePhysicalSet(
      EntityId.create('morning-exercise.pull-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 4 },
      at(3),
    );
    cycle.advancePhysicalExecution(at(3));
    await firstRepository.save(cycle);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = await new IndexedDbMorningCycleRepository(reopenedDatabase).findByDate(
      DayDate.create('2026-10-04'),
    );

    expect(restored?.physicalExecution?.activeSetIndex).toBe(1);
    expect(restored?.physicalExecution?.sets[0]).toMatchObject({
      status: 'COMPLETED',
      actualReps: 4,
    });
    expect(restored?.physicalExecution?.currentSet).toMatchObject({
      setNumber: 2,
      status: 'PENDING',
    });
    reopenedDatabase.close();
  });

  it('сохраняет принятое предложение и находит последний предыдущий цикл', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const previous = completedCycle('2026-10-03');
    const recommendation = buildMorningPhysicalRecommendation(
      previous.physicalPlanItems,
      previous.physicalExecution!,
    )!;
    previous.proposePhysicalRecommendation(recommendation, at(8));
    previous.acceptPhysicalRecommendation(at(9));
    await repository.save(previous);
    await repository.save(createCycle('2026-10-01'));

    const restored = await repository.latestBefore(DayDate.create('2026-10-04'));

    expect(restored?.dateKey.toString()).toBe('2026-10-03');
    expect(restored?.physicalRecommendation?.status).toBe(
      MORNING_PHYSICAL_RECOMMENDATION_STATUS.accepted,
    );
    expect(restored?.physicalRecommendation?.planItems[0]).toMatchObject({ targetReps: 11 });
    database.close();
  });
});

function completedCycle(date: string): MorningCycle {
  const cycle = createCycle(date);
  cycle.start(at(0));
  cycle.selectPhysicalExercise(
    EntityId.create('morning-exercise.pull-ups'),
    EXERCISE_MEASUREMENT_TYPE.repetitions,
    at(1),
  );
  cycle.startPhysicalExecution(at(2));
  for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
    cycle.completePhysicalSet(
      EntityId.create('morning-exercise.pull-ups'),
      setNumber,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 10 },
      at(2 + setNumber),
    );
    if (setNumber < 3) cycle.advancePhysicalExecution(at(2 + setNumber));
  }
  cycle.completePhysicalExecution(at(7));
  return cycle;
}

function createCycle(date: string): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create(`cycle:${date}`),
    dayId: EntityId.create(`day:${date}`),
    dateKey: DayDate.create(date),
    occurredAt: at(-1),
  });
}

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 4, 6, minutes));
}
