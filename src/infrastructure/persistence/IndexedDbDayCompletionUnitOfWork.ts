import type {
  CommitDayCompletionInput,
  DayCompletionUnitOfWork,
} from '../../application/ports/DayCompletionUnitOfWork';
import { DECISION_KIND, DECISION_STATUS, LIFE_ACTION_STATUS } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import type { DayRecord } from './records/DayRecord';
import type { DecisionRecord } from './records/DecisionRecord';
import type { LifeActionRecord } from './records/LifeActionRecord';

export class IndexedDbDayCompletionUnitOfWork implements DayCompletionUnitOfWork {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async commit(input: CommitDayCompletionInput): Promise<void> {
    const database = await this.#indexedDb.open();
    let transaction: IDBTransaction;

    try {
      transaction = database.transaction(
        [
          LIFE_OS_STORE.days,
          LIFE_OS_STORE.lifeActions,
          LIFE_OS_STORE.decisions,
          LIFE_OS_STORE.journal,
        ],
        'readwrite',
      );
    } catch (error: unknown) {
      throw transactionFailed(error);
    }

    const transactionCompletion = observeTransaction(transaction);

    try {
      const dayStore = transaction.objectStore(LIFE_OS_STORE.days);
      const actionStore = transaction.objectStore(LIFE_OS_STORE.lifeActions);
      const decisionStore = transaction.objectStore(LIFE_OS_STORE.decisions);
      const journalStore = transaction.objectStore(LIFE_OS_STORE.journal);
      const dayPromise = observeRequest<DayRecord | undefined>(
        dayStore.get(input.day.id.toString()),
      );
      const actionPromises = input.lifeActions.map((change) =>
        observeRequest<LifeActionRecord | undefined>(
          actionStore.get(change.lifeAction.id.toString()),
        ),
      );
      const tomorrowDecisionsPromise = observeRequest<DecisionRecord[]>(
        decisionStore.index('byPlannedDate').getAll(input.tomorrowDate.toString()),
      );
      const [storedDay, storedActions, storedTomorrowDecisions] = await Promise.all([
        dayPromise,
        Promise.all(actionPromises),
        tomorrowDecisionsPromise,
      ]);

      validateStoredDay(storedDay, input);
      validateStoredActions(storedActions, input);
      validateTomorrowDecisionLimit(storedTomorrowDecisions, input);

      const writes: Promise<unknown>[] = [
        observeRequest(dayStore.put(DayRecordMapper.toRecord(input.day))),
      ];

      for (const change of input.lifeActions) {
        writes.push(
          observeRequest(actionStore.put(LifeActionRecordMapper.toRecord(change.lifeAction))),
        );
      }

      for (const decision of input.newTomorrowDecisions) {
        writes.push(observeRequest(decisionStore.add(DecisionRecordMapper.toRecord(decision))));
      }

      for (const entry of input.journalEntries ?? []) {
        writes.push(observeRequest(journalStore.add(JournalEntryRecordMapper.toRecord(entry))));
      }

      await Promise.all(writes);
      await transactionCompletion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(transactionCompletion);

      if (error instanceof DomainError) {
        throw error;
      }

      throw persistenceOperationFailed(error);
    }
  }
}

function validateStoredDay(
  storedDay: DayRecord | undefined,
  input: CommitDayCompletionInput,
): void {
  if (
    storedDay === undefined ||
    storedDay.version !== input.expectedDayVersion ||
    storedDay.status !== 'open' ||
    storedDay.date !== input.day.date.toString()
  ) {
    throw new DomainError(
      'day.completion_conflict',
      'Состояние дня изменилось. Обновите вечерний контроль и повторите операцию.',
    );
  }
}

function validateStoredActions(
  storedActions: readonly (LifeActionRecord | undefined)[],
  input: CommitDayCompletionInput,
): void {
  input.lifeActions.forEach((change, index) => {
    const stored = storedActions[index];

    if (
      stored === undefined ||
      stored.version !== change.expectedVersion ||
      stored.plannedDate !== input.day.date.toString() ||
      (stored.status !== LIFE_ACTION_STATUS.ready &&
        stored.status !== LIFE_ACTION_STATUS.inProgress)
    ) {
      throw new DomainError(
        'day.action_completion_conflict',
        'Одно из действий изменилось. Обновите вечерний контроль и повторите операцию.',
      );
    }
  });
}

function validateTomorrowDecisionLimit(
  storedTomorrowDecisions: readonly DecisionRecord[],
  input: CommitDayCompletionInput,
): void {
  const existingMainCount = storedTomorrowDecisions.filter(
    (record) =>
      record.archivedAt === null &&
      record.kind === DECISION_KIND.main &&
      (record.status === DECISION_STATUS.planned || record.status === DECISION_STATUS.inProgress),
  ).length;
  const newMainCount = input.newTomorrowDecisions.filter(
    (decision) => decision.kind === DECISION_KIND.main,
  ).length;

  if (existingMainCount + newMainCount > 3) {
    throw new DomainError(
      'decision.main_limit_reached',
      'На завтра уже подготовлены три главных решения.',
    );
  }
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

function persistenceOperationFailed(error: unknown): DomainError {
  if (isDomExceptionNamed(error, 'ConstraintError')) {
    return new DomainError(
      'persistence.constraint_violation',
      'Запись нарушает ограничение хранилища IndexedDB.',
      { cause: error },
    );
  }

  return transactionFailed(error);
}

function transactionFailed(error: unknown): DomainError {
  return new DomainError(
    'persistence.transaction_failed',
    'Транзакция завершения дня не была выполнена.',
    { cause: error },
  );
}

function isDomExceptionNamed(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}
