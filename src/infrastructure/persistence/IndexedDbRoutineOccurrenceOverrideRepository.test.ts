import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineOccurrenceOverride,
} from '../../domain';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbRoutineOccurrenceOverrideRepository } from './IndexedDbRoutineOccurrenceOverrideRepository';

const DATE = DayDate.create('2026-08-08');
const BLOCK_ID = EntityId.create('block-1');

function delayed(id: string, version = 1) {
  return RoutineOccurrenceOverride.rehydrate({
    id: EntityId.create(id),
    routineBlockId: BLOCK_ID,
    occurrenceDate: DATE,
    type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed,
    startTimeOverride: version === 1 ? '08:30' : '08:45',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date(`2026-08-08T0${version - 1}:00:00.000Z`),
    version,
  });
}

describe('IndexedDbRoutineOccurrenceOverrideRepository', () => {
  it('persists an override across F5 and database reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = new IndexedDbRoutineOccurrenceOverrideRepository(firstDatabase);
    expect(await first.saveIfVersionMatches(delayed('override-1'), null)).toBe(true);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopened = new IndexedDbRoutineOccurrenceOverrideRepository(reopenedDatabase);
    expect(await reopened.findByOccurrence(BLOCK_ID, DATE)).toMatchObject({
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed,
      startTimeOverride: '08:30',
      version: 1,
    });
    reopenedDatabase.close();
  });

  it('enforces optimistic concurrency for update and clear', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbRoutineOccurrenceOverrideRepository(database);
    expect(await repository.saveIfVersionMatches(delayed('override-1'), null)).toBe(true);
    expect(await repository.saveIfVersionMatches(delayed('override-1', 2), 1)).toBe(true);
    expect(await repository.saveIfVersionMatches(delayed('override-1', 2), 1)).toBe(false);
    expect(await repository.deleteIfVersionMatches(EntityId.create('override-1'), 1)).toBe(false);
    expect(await repository.deleteIfVersionMatches(EntityId.create('override-1'), 2)).toBe(true);
    database.close();
  });

  it('protects routineBlockId + occurrenceDate from duplicate records', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbRoutineOccurrenceOverrideRepository(database);
    const results = await Promise.all([
      repository.saveIfVersionMatches(delayed('override-a'), null),
      repository.saveIfVersionMatches(delayed('override-b'), null),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.findAll()).toHaveLength(1);
    database.close();
  });
});
