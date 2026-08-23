import type {
  CommitOpenLoopResolutionInput,
  OpenLoopResolutionUnitOfWork,
} from '../../application';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { EveningCycleRecordMapper } from './mappers/EveningCycleRecordMapper';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import type { ActionSessionRecord } from './records/ActionSessionRecord';
import type { DecisionRecord } from './records/DecisionRecord';
import type { EveningCycleRecord } from './records/EveningCycleRecord';
import type { LifeActionRecord } from './records/LifeActionRecord';

export class IndexedDbOpenLoopResolutionUnitOfWork implements OpenLoopResolutionUnitOfWork {
  readonly #database: LifeOsIndexedDb;

  public constructor(database: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#database = database;
  }

  public async commit(input: CommitOpenLoopResolutionInput): Promise<void> {
    const database = await this.#database.open();
    const transaction = database.transaction(
      [
        LIFE_OS_STORE.eveningCycles,
        LIFE_OS_STORE.decisions,
        LIFE_OS_STORE.lifeActions,
        LIFE_OS_STORE.actionSessions,
        LIFE_OS_STORE.journal,
      ],
      'readwrite',
    );
    const completion = observeTransaction(transaction);
    try {
      const cycleStore = transaction.objectStore(LIFE_OS_STORE.eveningCycles);
      const decisionStore = transaction.objectStore(LIFE_OS_STORE.decisions);
      const actionStore = transaction.objectStore(LIFE_OS_STORE.lifeActions);
      const sessionStore = transaction.objectStore(LIFE_OS_STORE.actionSessions);
      const journalStore = transaction.objectStore(LIFE_OS_STORE.journal);
      const [storedCycle, storedDecisions, storedActions, storedSessions] = await Promise.all([
        observeRequest<EveningCycleRecord | undefined>(
          cycleStore.get(input.eveningCycle.id.toString()),
        ),
        Promise.all(
          input.decisions.map((change) =>
            observeRequest<DecisionRecord | undefined>(
              decisionStore.get(change.decision.id.toString()),
            ),
          ),
        ),
        Promise.all(
          input.lifeActions.map((change) =>
            observeRequest<LifeActionRecord | undefined>(
              actionStore.get(change.lifeAction.id.toString()),
            ),
          ),
        ),
        Promise.all(
          input.sessions.map((change) =>
            observeRequest<ActionSessionRecord | undefined>(
              sessionStore.get(change.session.id.toString()),
            ),
          ),
        ),
      ]);
      assertVersion(storedCycle, input.expectedEveningCycleVersion, 'evening_cycle');
      input.decisions.forEach((change, index) =>
        assertVersion(storedDecisions[index], change.expectedVersion, 'decision'),
      );
      input.lifeActions.forEach((change, index) =>
        assertVersion(storedActions[index], change.expectedVersion, 'life_action'),
      );
      input.sessions.forEach((change, index) =>
        assertVersion(storedSessions[index], change.expectedVersion, 'action_session'),
      );

      const writes: Promise<unknown>[] = [
        observeRequest(cycleStore.put(EveningCycleRecordMapper.toRecord(input.eveningCycle))),
        ...input.decisions.map((change) =>
          observeRequest(decisionStore.put(DecisionRecordMapper.toRecord(change.decision))),
        ),
        ...input.lifeActions.map((change) =>
          observeRequest(actionStore.put(LifeActionRecordMapper.toRecord(change.lifeAction))),
        ),
        ...input.sessions.map((change) =>
          observeRequest(sessionStore.put(ActionSessionRecordMapper.toRecord(change.session))),
        ),
        ...(input.journalEntries ?? []).map((entry) =>
          observeRequest(journalStore.add(JournalEntryRecordMapper.toRecord(entry))),
        ),
      ];
      await Promise.all(writes);
      await completion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'open_loop.persistence_failed',
        'Не удалось атомарно сохранить результат разбора.',
        { cause: error },
      );
    }
  }
}

function assertVersion(
  record: { readonly version: number } | undefined,
  expectedVersion: number,
  entity: string,
): void {
  if (record === undefined || record.version !== expectedVersion) {
    throw new DomainError(
      'open_loop.concurrent_change',
      `Состояние ${entity} изменилось. Обновите разбор и повторите действие.`,
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
    // Транзакция уже завершилась.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Исходная ошибка важнее ошибки отмены.
  }
}
