import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { cloneMorningCycle } from '../../application';
import { DayDate, EntityId, MorningCycle } from '../../domain';
import { IndexedDbMorningCycleRepository } from './IndexedDbMorningCycleRepository';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-23');
const START = new Date('2026-08-23T07:12:00.000+09:00');
const WATER = new Date('2026-08-23T07:14:00.000+09:00');

describe('IndexedDbMorningCycleRepository', () => {
  it('восстанавливает старт, воду и пропуск после повторного открытия', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const cycle = morningCycle('cycle');
    cycle.start(START);
    cycle.completeWater(WATER, 250);
    cycle.skipPhysical(new Date('2026-08-23T07:16:00.000+09:00'));
    await repository.createIfAbsent(cycle);
    database.close();

    const restored = await new IndexedDbMorningCycleRepository(database).findByDateKey(DATE);

    expect(restored?.startedAt).toEqual(START);
    expect(restored?.waterCompletedAt).toEqual(WATER);
    expect(restored?.waterAmountMl).toBe(250);
    expect(restored?.physicalStatus).toBe('SKIPPED');
    database.close();
  });

  it('создаёт одну запись при конкурентном первом запуске', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        repository.createIfAbsent(morningCycle(`cycle-${index}`)),
      ),
    );

    expect(new Set(results.map((cycle) => cycle.id.toString())).size).toBe(1);
    expect((await repository.findByDayId(EntityId.create('day')))?.dateKey.equals(DATE)).toBe(true);
    database.close();
  });

  it('отклоняет устаревшую версию второй вкладки', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    await repository.createIfAbsent(morningCycle('cycle'));
    const first = cloneMorningCycle((await repository.findByDateKey(DATE))!);
    const second = cloneMorningCycle((await repository.findByDateKey(DATE))!);
    const version = first.version;
    first.start(START);
    second.start(new Date('2026-08-23T08:00:00.000+09:00'));

    const results = await Promise.all([
      repository.saveIfVersionMatches(first, version),
      repository.saveIfVersionMatches(second, version),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.findByDateKey(DATE))?.version).toBe(version + 1);
    database.close();
  });

  it('регистрирует store и уникальные индексы схемы', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const transaction = opened.transaction(LIFE_OS_STORE.morningCycles, 'readonly');
    const store = transaction.objectStore(LIFE_OS_STORE.morningCycles);

    expect(store.indexNames.contains('byDayId')).toBe(true);
    expect(store.indexNames.contains('byDateKey')).toBe(true);
    expect(store.index('byDayId').unique).toBe(true);
    expect(store.index('byDateKey').unique).toBe(true);
    database.close();
  });
});

function morningCycle(id: string): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create(id),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    occurredAt: new Date('2026-08-23T06:50:00.000+09:00'),
  });
}
