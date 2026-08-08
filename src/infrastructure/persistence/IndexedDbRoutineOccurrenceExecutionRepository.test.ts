import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_EXECUTION_STATUS,
  RoutineOccurrenceExecution,
} from '../../domain';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbRoutineOccurrenceExecutionRepository } from './IndexedDbRoutineOccurrenceExecutionRepository';
import { RoutineOccurrenceExecutionRecordMapper } from './mappers/RoutineOccurrenceExecutionRecordMapper';

const DATE = DayDate.create('2026-08-08');

function started(id: string, blockId = 'routine-1'): RoutineOccurrenceExecution {
  return RoutineOccurrenceExecution.start({
    id: EntityId.create(id),
    routineBlockId: EntityId.create(blockId),
    occurrenceDate: DATE,
    occurredAt: new Date('2026-08-08T08:12:00.000Z'),
  });
}

describe('IndexedDbRoutineOccurrenceExecutionRepository', () => {
  it('persists running, completed and abandoned facts across reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = new IndexedDbRoutineOccurrenceExecutionRepository(firstDatabase);
    const execution = started('execution-1');
    expect(await first.addIfNoRunning(execution)).toBe('saved');
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopened = new IndexedDbRoutineOccurrenceExecutionRepository(reopenedDatabase);
    const running = await reopened.findRunning();
    expect(running).toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.running,
      actualStartedAt: new Date('2026-08-08T08:12:00.000Z'),
    });
    const completed = running!.complete(new Date('2026-08-08T08:52:00.000Z'));
    expect(await reopened.saveIfVersionMatches(completed, 1)).toBe(true);
    reopenedDatabase.close();

    const finalDatabase = new LifeOsIndexedDb(factory);
    const finalRepository = new IndexedDbRoutineOccurrenceExecutionRepository(finalDatabase);
    expect(
      await finalRepository.findByOccurrence(EntityId.create('routine-1'), DATE),
    ).toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.completed,
      version: 2,
      actualEndedAt: new Date('2026-08-08T08:52:00.000Z'),
    });
    finalDatabase.close();
  });

  it('atomically protects occurrence identity, one running fact and versions', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbRoutineOccurrenceExecutionRepository(database);
    const duplicateResults = await Promise.all([
      repository.addIfNoRunning(started('execution-a')),
      repository.addIfNoRunning(started('execution-b')),
    ]);
    expect(duplicateResults.filter((result) => result === 'saved')).toHaveLength(1);
    expect(await repository.addIfNoRunning(started('execution-2', 'routine-2'))).toBe(
      'runningExists',
    );

    const current = (await repository.findAll())[0]!;
    const completed = current.complete(new Date('2026-08-08T08:52:00.000Z'));
    expect(await repository.saveIfVersionMatches(completed, 1)).toBe(true);
    expect(await repository.saveIfVersionMatches(completed, 1)).toBe(false);
    database.close();
  });

  it('reports multiple running records as an integrity error without choosing one', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const nativeDatabase = await database.open();
    const transaction = nativeDatabase.transaction(
      LIFE_OS_STORE.routineOccurrenceExecutions,
      'readwrite',
    );
    const store = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions);
    store.add(RoutineOccurrenceExecutionRecordMapper.toRecord(started('execution-one')));
    store.add(
      RoutineOccurrenceExecutionRecordMapper.toRecord(started('execution-two', 'routine-2')),
    );
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () => reject(transaction.error));
    });

    const repository = new IndexedDbRoutineOccurrenceExecutionRepository(database);
    await expect(repository.findRunning()).rejects.toMatchObject({
      code: 'routine_execution.multiple_running',
    });
    expect(await repository.findAll()).toHaveLength(2);
    database.close();
  });
});
