import type {
  FinishRoutineWalkCommitInput,
  RoutineWalkUnitOfWork,
  StartRoutineWalkCommitInput,
} from '../../application';
import {
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_EXECUTION_STATUS,
  WALK_STATUS,
  resolveRoutineOccurrencesForDate,
  sameWalkRoutineOccurrenceReference,
  type RoutineOccurrenceExecution,
  type Walk,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { RoutineBlockRecordMapper } from './mappers/RoutineBlockRecordMapper';
import {
  RoutineOccurrenceExecutionRecordMapper,
  routineExecutionOccurrenceKey,
} from './mappers/RoutineOccurrenceExecutionRecordMapper';
import {
  RoutineOccurrenceOverrideRecordMapper,
  occurrenceKey,
} from './mappers/RoutineOccurrenceOverrideRecordMapper';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import type { RoutineBlockRecord } from './records/RoutineBlockRecord';
import type { RoutineOccurrenceExecutionRecord } from './records/RoutineOccurrenceExecutionRecord';
import type { RoutineOccurrenceOverrideRecord } from './records/RoutineOccurrenceOverrideRecord';
import type { WalkRecord } from './records/WalkRecord';

export class IndexedDbRoutineWalkUnitOfWork implements RoutineWalkUnitOfWork {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async start(input: StartRoutineWalkCommitInput): Promise<Walk> {
    const transaction = await this.openTransaction();
    const completion = observeTransaction(transaction);
    try {
      const walkStore = transaction.objectStore(LIFE_OS_STORE.walks);
      const executionStore = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions);
      const blockStore = transaction.objectStore(LIFE_OS_STORE.routineBlocks);
      const overrideStore = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceOverrides);
      const source = input.plan.source;
      validateStartInput(input);

      const [blockRecord, overrideRecord, runningWalkRecords, pausedWalkRecords] =
        await Promise.all([
          observeRequest<RoutineBlockRecord | undefined>(
            blockStore.get(source.routineBlockId.toString()),
          ),
          observeRequest<RoutineOccurrenceOverrideRecord | undefined>(
            overrideStore
              .index('byOccurrence')
              .get(
                occurrenceKey(source.routineBlockId.toString(), source.occurrenceDate.toString()),
              ),
          ),
          observeRequest<WalkRecord[]>(walkStore.index('byStatus').getAll(WALK_STATUS.running)),
          observeRequest<WalkRecord[]>(walkStore.index('byStatus').getAll(WALK_STATUS.paused)),
        ]);
      validatePlan(blockRecord, overrideRecord, input);

      const activeRecords = [...runningWalkRecords, ...pausedWalkRecords];
      if (activeRecords.length > 1) {
        throw new DomainError(
          'walk.multiple_active',
          'Обнаружено несколько активных прогулок. Данные не изменены.',
        );
      }
      const activeRecord = activeRecords[0];
      if (activeRecord !== undefined) {
        const active = WalkRecordMapper.fromRecord(activeRecord);
        const activeSource = active.returnContext?.routineContext?.source ?? null;
        if (activeSource !== null && sameWalkRoutineOccurrenceReference(activeSource, source)) {
          await completion;
          return active;
        }
        throw new DomainError('walk.running_exists', 'Сначала завершите текущую прогулку.');
      }

      const [exactExecutionRecord, runningExecutionRecords] = await Promise.all([
        observeRequest<RoutineOccurrenceExecutionRecord | undefined>(
          executionStore
            .index('byOccurrence')
            .get(
              routineExecutionOccurrenceKey(
                source.routineBlockId.toString(),
                source.occurrenceDate.toString(),
              ),
            ),
        ),
        observeRequest<RoutineOccurrenceExecutionRecord[]>(
          executionStore.index('byStatus').getAll(ROUTINE_EXECUTION_STATUS.running),
        ),
      ]);
      const exactExecution =
        exactExecutionRecord === undefined
          ? null
          : RoutineOccurrenceExecutionRecordMapper.fromRecord(exactExecutionRecord);
      if (exactExecution !== null && exactExecution.status !== ROUTINE_EXECUTION_STATUS.running) {
        throw sourceNotStartable();
      }
      const otherRunning = runningExecutionRecords.some(
        (record) => exactExecution === null || record.id !== exactExecution.id.toString(),
      );
      if (otherRunning) {
        throw new DomainError(
          'routine_walk.another_routine_running',
          'Сначала завершите или прервите текущий блок распорядка.',
        );
      }
      if (
        (exactExecution === null && input.expectedExecutionVersion !== null) ||
        (exactExecution !== null &&
          (input.expectedExecutionVersion === null ||
            exactExecution.version !== input.expectedExecutionVersion))
      ) {
        throw versionConflict();
      }

      const writes: Promise<unknown>[] = [];
      if (exactExecution === null) {
        writes.push(
          observeRequest(
            executionStore.add(RoutineOccurrenceExecutionRecordMapper.toRecord(input.execution)),
          ),
        );
      }
      writes.push(observeRequest(walkStore.add(WalkRecordMapper.toRecord(input.walk))));
      await Promise.all(writes);
      await completion;
      return input.walk;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (error instanceof DomainError) throw error;
      throw transactionFailed('Связанная прогулка не была сохранена. Повторите попытку.', error);
    }
  }

  public async finish(input: FinishRoutineWalkCommitInput): Promise<void> {
    const transaction = await this.openTransaction();
    const completion = observeTransaction(transaction);
    try {
      const walkStore = transaction.objectStore(LIFE_OS_STORE.walks);
      const executionStore = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions);
      validateFinishInput(input);
      const [walkRecord, executionRecord] = await Promise.all([
        observeRequest<WalkRecord | undefined>(walkStore.get(input.walk.id.toString())),
        observeRequest<RoutineOccurrenceExecutionRecord | undefined>(
          executionStore
            .index('byOccurrence')
            .get(
              routineExecutionOccurrenceKey(
                input.execution.routineBlockId.toString(),
                input.execution.occurrenceDate.toString(),
              ),
            ),
        ),
      ]);
      if (walkRecord === undefined || executionRecord === undefined) throw versionConflict();
      const storedWalk = WalkRecordMapper.fromRecord(walkRecord);
      const storedExecution = RoutineOccurrenceExecutionRecordMapper.fromRecord(executionRecord);
      validateFinishSource(storedWalk, storedExecution, input);

      const writeWalk = validateStoredWalkForFinish(storedWalk, input);
      const writeExecution = validateStoredExecutionForFinish(storedExecution, input);
      const writes: Promise<unknown>[] = [];
      if (writeWalk)
        writes.push(observeRequest(walkStore.put(WalkRecordMapper.toRecord(input.walk))));
      if (writeExecution) {
        writes.push(
          observeRequest(
            executionStore.put(RoutineOccurrenceExecutionRecordMapper.toRecord(input.execution)),
          ),
        );
      }
      await Promise.all(writes);
      await completion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (error instanceof DomainError) throw error;
      throw transactionFailed('Завершение связанной прогулки не было сохранено.', error);
    }
  }

  private async openTransaction(): Promise<IDBTransaction> {
    try {
      const database = await this.indexedDb.open();
      return database.transaction(
        [
          LIFE_OS_STORE.walks,
          LIFE_OS_STORE.routineOccurrenceExecutions,
          LIFE_OS_STORE.routineBlocks,
          LIFE_OS_STORE.routineOccurrenceOverrides,
        ],
        'readwrite',
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      throw transactionFailed('Не удалось открыть транзакцию связанной прогулки.', error);
    }
  }
}

function validateStartInput(input: StartRoutineWalkCommitInput): void {
  const source = input.walk.returnContext?.routineContext?.source ?? null;
  if (
    input.walk.status !== WALK_STATUS.running ||
    source === null ||
    !sameWalkRoutineOccurrenceReference(source, input.plan.source) ||
    input.execution.status !== ROUTINE_EXECUTION_STATUS.running ||
    !input.execution.routineBlockId.equals(input.plan.source.routineBlockId) ||
    !input.execution.occurrenceDate.equals(input.plan.source.occurrenceDate)
  ) {
    throw versionConflict();
  }
}

function validatePlan(
  blockRecord: RoutineBlockRecord | undefined,
  overrideRecord: RoutineOccurrenceOverrideRecord | undefined,
  input: StartRoutineWalkCommitInput,
): void {
  if (
    blockRecord === undefined ||
    blockRecord.version !== input.plan.expectedRoutineBlockVersion ||
    (overrideRecord?.version ?? null) !== input.plan.expectedOverrideVersion
  ) {
    throw versionConflict();
  }
  const block = RoutineBlockRecordMapper.fromRecord(blockRecord);
  const override =
    overrideRecord === undefined
      ? null
      : RoutineOccurrenceOverrideRecordMapper.fromRecord(overrideRecord);
  const occurrence = resolveRoutineOccurrencesForDate(
    [block],
    override === null ? [] : [override],
    input.plan.source.effectiveDate,
  ).find((candidate) =>
    sameWalkRoutineOccurrenceReference(
      {
        routineBlockId: candidate.sourceBlockId,
        occurrenceDate: candidate.occurrenceDate,
        effectiveDate: candidate.effectiveDate,
      },
      input.plan.source,
    ),
  );
  if (
    occurrence === undefined ||
    occurrence.isSkipped ||
    occurrence.isRescheduledSource ||
    occurrence.effectiveAssignment.kind !== ROUTINE_BLOCK_ASSIGNMENT.walk
  ) {
    throw sourceNotStartable();
  }
}

function validateFinishInput(input: FinishRoutineWalkCommitInput): void {
  const executionStatus = executionStatusFor(input.terminalStatus);
  if (input.walk.status !== input.terminalStatus || input.execution.status !== executionStatus) {
    throw versionConflict();
  }
}

function validateFinishSource(
  storedWalk: Walk,
  storedExecution: RoutineOccurrenceExecution,
  input: FinishRoutineWalkCommitInput,
): void {
  const source = storedWalk.returnContext?.routineContext?.source ?? null;
  if (
    source === null ||
    !storedWalk.id.equals(input.walk.id) ||
    !storedExecution.id.equals(input.execution.id) ||
    !source.routineBlockId.equals(storedExecution.routineBlockId) ||
    !source.occurrenceDate.equals(storedExecution.occurrenceDate)
  ) {
    throw versionConflict();
  }
}

function validateStoredWalkForFinish(stored: Walk, input: FinishRoutineWalkCommitInput): boolean {
  if (isOppositeWalkTerminal(stored.status, input.terminalStatus)) throw terminalConflict();
  if (stored.status === input.terminalStatus) {
    if (
      stored.version !== input.walk.version ||
      stored.endedAt?.getTime() !== input.walk.endedAt?.getTime()
    ) {
      throw versionConflict();
    }
    return false;
  }
  if (
    (stored.status !== WALK_STATUS.running && stored.status !== WALK_STATUS.paused) ||
    stored.version !== input.expectedWalkVersion ||
    input.walk.version !== stored.version + 1
  ) {
    throw versionConflict();
  }
  return true;
}

function validateStoredExecutionForFinish(
  stored: RoutineOccurrenceExecution,
  input: FinishRoutineWalkCommitInput,
): boolean {
  const expectedStatus = executionStatusFor(input.terminalStatus);
  if (isOppositeExecutionTerminal(stored.status, expectedStatus)) throw terminalConflict();
  if (stored.status === expectedStatus) {
    if (
      stored.version !== input.execution.version ||
      stored.actualEndedAt?.getTime() !== input.execution.actualEndedAt?.getTime()
    ) {
      throw versionConflict();
    }
    return false;
  }
  if (
    stored.status !== ROUTINE_EXECUTION_STATUS.running ||
    stored.version !== input.expectedExecutionVersion ||
    input.execution.version !== stored.version + 1
  ) {
    throw versionConflict();
  }
  return true;
}

function executionStatusFor(
  terminalStatus: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned,
): typeof ROUTINE_EXECUTION_STATUS.completed | typeof ROUTINE_EXECUTION_STATUS.abandoned {
  return terminalStatus === WALK_STATUS.completed
    ? ROUTINE_EXECUTION_STATUS.completed
    : ROUTINE_EXECUTION_STATUS.abandoned;
}

function isOppositeWalkTerminal(
  stored: Walk['status'],
  expected: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned,
): boolean {
  return (
    (stored === WALK_STATUS.completed || stored === WALK_STATUS.abandoned) && stored !== expected
  );
}

function isOppositeExecutionTerminal(
  stored: RoutineOccurrenceExecution['status'],
  expected: typeof ROUTINE_EXECUTION_STATUS.completed | typeof ROUTINE_EXECUTION_STATUS.abandoned,
): boolean {
  return (
    (stored === ROUTINE_EXECUTION_STATUS.completed ||
      stored === ROUTINE_EXECUTION_STATUS.abandoned) &&
    stored !== expected
  );
}

function versionConflict(): DomainError {
  return new DomainError(
    'routine_walk.version_conflict',
    'Данные связанной прогулки изменились. Обновите экран и повторите действие.',
  );
}

function sourceNotStartable(): DomainError {
  return new DomainError(
    'routine_walk.source_not_startable',
    'Этот блок распорядка больше нельзя начать как прогулку.',
  );
}

function terminalConflict(): DomainError {
  return new DomainError(
    'routine_walk.terminal_conflict',
    'Прогулка и блок распорядка уже завершены несовместимыми способами.',
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
    // Транзакция уже завершилась или была отменена запросом.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Исходная ошибка операции важнее технической ошибки отмены.
  }
}

function transactionFailed(message: string, error: unknown): DomainError {
  return new DomainError('persistence.transaction_failed', message, { cause: error });
}
