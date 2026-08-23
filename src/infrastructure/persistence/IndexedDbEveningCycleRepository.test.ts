import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { cloneEveningCycle } from '../../application';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  type EveningCycleState,
} from '../../domain';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';

describe('IndexedDbEveningCycleRepository', () => {
  it('находит последний незавершённый цикл старше суток для recovery', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    await repository.createIfAbsent(cycle('2026-08-01', EVENING_CYCLE_STATE.reflecting));
    await repository.createIfAbsent(cycle('2026-08-03', EVENING_CYCLE_STATE.shutdown));
    await repository.createIfAbsent(cycle('2026-08-04', EVENING_CYCLE_STATE.completed));

    const recovered = await repository.findLatestUnfinishedOnOrBefore(DayDate.create('2026-08-06'));

    expect(recovered?.dateKey.toString()).toBe('2026-08-03');
    expect(recovered?.state).toBe(EVENING_CYCLE_STATE.shutdown);
    database.close();
  });

  it('100 конкурентных открытий создают ровно один EveningCycle', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        repository.createIfAbsent(
          EveningCycle.rehydrate({
            id: EntityId.create(`cycle-open-${index}`),
            dayId: EntityId.create('day-shared'),
            dateKey: DayDate.create('2026-08-07'),
            state: EVENING_CYCLE_STATE.notStarted,
            mode: EVENING_CYCLE_MODE.normal,
            startedAt: null,
            updatedAt: new Date('2026-08-07T20:00:00.000Z'),
            completedAt: null,
            version: 1,
          }),
        ),
      ),
    );

    expect(new Set(results.map((result) => result.id.toString())).size).toBe(1);
    expect((await repository.findByDateKey(DayDate.create('2026-08-07')))?.dayId.toString()).toBe(
      'day-shared',
    );
    database.close();
  });

  it.each(Object.values(EVENING_CYCLE_STATE) as readonly EveningCycleState[])(
    'восстанавливает состояние %s после закрытия и повторного открытия IndexedDB',
    async (state) => {
      const database = new LifeOsIndexedDb(new IDBFactory());
      const date = DayDate.create('2026-08-08');
      const completed = state === EVENING_CYCLE_STATE.completed;
      const notStarted = state === EVENING_CYCLE_STATE.notStarted;
      const stored = EveningCycle.rehydrate({
        id: EntityId.create(`cycle-${state}`),
        dayId: EntityId.create('day-refresh'),
        dateKey: date,
        state,
        mode: EVENING_CYCLE_MODE.normal,
        ...(completed ? { completion: EVENING_CYCLE_COMPLETION.completed } : {}),
        startedAt: notStarted ? null : new Date('2026-08-08T20:00:00.000Z'),
        updatedAt: new Date('2026-08-08T21:00:00.000Z'),
        completedAt: completed ? new Date('2026-08-08T21:00:00.000Z') : null,
        version: 5,
      });
      await new IndexedDbEveningCycleRepository(database).createIfAbsent(stored);
      database.close();

      const restored = await new IndexedDbEveningCycleRepository(database).findByDateKey(date);

      expect(restored?.state).toBe(state);
      expect(restored?.dayId.toString()).toBe('day-refresh');
      expect(restored?.dateKey.toString()).toBe('2026-08-08');
      database.close();
    },
  );

  it('отклоняет stale-запись второй вкладки и не смешивает два перехода', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const firstTab = new IndexedDbEveningCycleRepository(database);
    const secondTab = new IndexedDbEveningCycleRepository(database);
    const date = DayDate.create('2026-08-09');
    await firstTab.createIfAbsent(cycle('2026-08-09', EVENING_CYCLE_STATE.resolving));
    const firstSnapshot = cloneEveningCycle((await firstTab.findByDateKey(date))!);
    const secondSnapshot = cloneEveningCycle((await secondTab.findByDateKey(date))!);
    const expectedVersion = firstSnapshot.version;
    firstSnapshot.completeResolving(new Date('2026-08-09T21:01:00.000Z'));
    secondSnapshot.switchMode(
      EVENING_CYCLE_MODE.quick,
      'USER_SELECTED',
      new Date('2026-08-09T21:01:00.000Z'),
    );

    const results = await Promise.all([
      firstTab.saveIfVersionMatches(firstSnapshot, expectedVersion),
      secondTab.saveIfVersionMatches(secondSnapshot, expectedVersion),
    ]);
    const restored = await firstTab.findByDateKey(date);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(restored?.version).toBe(expectedVersion + 1);
    expect([
      `${EVENING_CYCLE_STATE.reflecting}:${EVENING_CYCLE_MODE.normal}`,
      `${EVENING_CYCLE_STATE.resolving}:${EVENING_CYCLE_MODE.quick}`,
    ]).toContain(`${restored?.state}:${restored?.mode}`);
    database.close();
  });
});

function cycle(date: string, state: EveningCycleState): EveningCycle {
  const completed = state === EVENING_CYCLE_STATE.completed;
  return EveningCycle.rehydrate({
    id: EntityId.create(`cycle-${date}`),
    dayId: EntityId.create(`day-${date}`),
    dateKey: DayDate.create(date),
    state,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: new Date(`${date}T20:00:00.000Z`),
    updatedAt: new Date(`${date}T21:00:00.000Z`),
    completedAt: completed ? new Date(`${date}T21:00:00.000Z`) : null,
    version: 1,
  });
}
