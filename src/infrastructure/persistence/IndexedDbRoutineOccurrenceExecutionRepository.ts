import type {
  RoutineOccurrenceExecutionRepository,
  StartRoutineExecutionResult,
} from '../../application';
import {
  ROUTINE_EXECUTION_STATUS,
  type DayDate,
  type EntityId,
  type RoutineOccurrenceExecution,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import {
  RoutineOccurrenceExecutionRecordMapper,
  routineExecutionOccurrenceKey,
} from './mappers/RoutineOccurrenceExecutionRecordMapper';
import type { RoutineOccurrenceExecutionRecord } from './records/RoutineOccurrenceExecutionRecord';

export class IndexedDbRoutineOccurrenceExecutionRepository implements RoutineOccurrenceExecutionRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findByOccurrence(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceExecution | null> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceExecutions, 'readonly');
    const record = await observeRequest<unknown>(
      transaction
        .objectStore(LIFE_OS_STORE.routineOccurrenceExecutions)
        .index('byOccurrence')
        .get(routineExecutionOccurrenceKey(routineBlockId.toString(), occurrenceDate.toString())),
    );
    return record === undefined ? null : RoutineOccurrenceExecutionRecordMapper.fromRecord(record);
  }

  public async findRunning(): Promise<RoutineOccurrenceExecution | null> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceExecutions, 'readonly');
    const records = await observeRequest<unknown[]>(
      transaction
        .objectStore(LIFE_OS_STORE.routineOccurrenceExecutions)
        .index('byStatus')
        .getAll(ROUTINE_EXECUTION_STATUS.running),
    );
    if (records.length > 1) throw multipleRunningExecutions();
    const record = records[0];
    return record === undefined ? null : RoutineOccurrenceExecutionRecordMapper.fromRecord(record);
  }

  public async findAll(): Promise<readonly RoutineOccurrenceExecution[]> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceExecutions, 'readonly');
    const records = await observeRequest<unknown[]>(
      transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions).getAll(),
    );
    return records.map(RoutineOccurrenceExecutionRecordMapper.fromRecord);
  }

  public async addIfNoRunning(
    execution: RoutineOccurrenceExecution,
  ): Promise<StartRoutineExecutionResult> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      LIFE_OS_STORE.routineOccurrenceExecutions,
      'readwrite',
    );
    const completion = observeTransaction(transaction);
    const store = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions);
    try {
      const existing = await observeRequest<RoutineOccurrenceExecutionRecord | undefined>(
        store
          .index('byOccurrence')
          .get(
            routineExecutionOccurrenceKey(
              execution.routineBlockId.toString(),
              execution.occurrenceDate.toString(),
            ),
          ),
      );
      if (existing !== undefined) {
        transaction.abort();
        await settle(completion);
        return 'occurrenceExists';
      }
      const running = await observeRequest<RoutineOccurrenceExecutionRecord | undefined>(
        store.index('byStatus').get(ROUTINE_EXECUTION_STATUS.running),
      );
      if (running !== undefined) {
        transaction.abort();
        await settle(completion);
        return 'runningExists';
      }
      await observeRequest(store.add(RoutineOccurrenceExecutionRecordMapper.toRecord(execution)));
      await completion;
      return 'saved';
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        return (await this.findByOccurrence(execution.routineBlockId, execution.occurrenceDate)) ===
          null
          ? 'runningExists'
          : 'occurrenceExists';
      }
      throw error;
    }
  }

  public async saveIfVersionMatches(
    execution: RoutineOccurrenceExecution,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      LIFE_OS_STORE.routineOccurrenceExecutions,
      'readwrite',
    );
    const completion = observeTransaction(transaction);
    const store = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions);
    try {
      const existing = await observeRequest<RoutineOccurrenceExecutionRecord | undefined>(
        store.get(execution.id.toString()),
      );
      if (existing?.version !== expectedVersion) {
        transaction.abort();
        await settle(completion);
        return false;
      }
      await observeRequest(store.put(RoutineOccurrenceExecutionRecordMapper.toRecord(execution)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
      throw error;
    }
  }
}

function multipleRunningExecutions(): DomainError {
  return new DomainError(
    'routine_execution.multiple_running',
    'Обнаружено несколько выполняющихся блоков. Это ошибка целостности; данные не изменены.',
  );
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    /* already complete */
  }
}

async function settle(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    /* expected abort */
  }
}
