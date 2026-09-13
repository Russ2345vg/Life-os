import type {
  CommitJournalStateInput,
  JournalUnitOfWork,
} from '../../application/ports/JournalUnitOfWork';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import { ProjectGoalCompatibility as ProjectRecordMapper } from './mappers/ProjectGoalCompatibility';
import type { GoalRecord } from './records/GoalRecord';
import type { DecisionRecord } from './records/DecisionRecord';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';

interface VersionedRecord {
  readonly version: number;
}

export class IndexedDbJournalUnitOfWork implements JournalUnitOfWork {
  readonly #indexedDb: LifeOsIndexedDb;
  readonly #mutationRecorder: IndexedDbPilotMutationRecorder;

  public constructor(
    indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb(),
    mutationRecorder: IndexedDbPilotMutationRecorder = new IndexedDbPilotMutationRecorder(),
  ) {
    this.#indexedDb = indexedDb;
    this.#mutationRecorder = mutationRecorder;
  }

  public async commit(input: CommitJournalStateInput): Promise<void> {
    const database = await this.#indexedDb.open();
    const stores = collectStores(input);
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(stores, 'readwrite');
    } catch (error: unknown) {
      throw transactionFailed(error);
    }
    const completion = observeTransaction(transaction);

    try {
      await validateExpectedState(transaction, input);
      const writes: Promise<unknown>[] = [];
      for (const change of input.days ?? []) {
        writes.push(
          observeRequest(
            transaction.objectStore(LIFE_OS_STORE.days).put(DayRecordMapper.toRecord(change.day)),
          ),
        );
      }
      for (const change of input.decisions ?? []) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.decisions)
              .put(DecisionRecordMapper.toRecord(change.decision)),
          ),
        );
      }
      for (const change of input.lifeActions ?? []) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.lifeActions)
              .put(LifeActionRecordMapper.toRecord(change.lifeAction)),
          ),
        );
      }
      for (const change of input.workSessions ?? []) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.actionSessions)
              .put(ActionSessionRecordMapper.toRecord(change.workSession)),
          ),
        );
      }
      let pilotMutationRecorded = false;
      for (const change of input.directions ?? []) {
        const record = DirectionRecordMapper.toRecord(change.direction);
        writes.push(observeRequest(transaction.objectStore(LIFE_OS_STORE.directions).put(record)));
        pilotMutationRecorded =
          (await this.#mutationRecorder.recordUpsert(transaction, 'direction', record)) ||
          pilotMutationRecorded;
      }
      for (const change of input.projects ?? []) {
        const previous = await observeRequest<GoalRecord | undefined>(
          transaction.objectStore(LIFE_OS_STORE.goals).get(change.project.id.toString()),
        );
        const record = ProjectRecordMapper.toRecord(change.project, previous);
        writes.push(observeRequest(transaction.objectStore(LIFE_OS_STORE.goals).put(record)));
        pilotMutationRecorded =
          (await this.#mutationRecorder.recordUpsert(transaction, 'goal', record)) ||
          pilotMutationRecorded;
      }
      const journalStore = transaction.objectStore(LIFE_OS_STORE.journal);
      for (const entry of input.journalEntries) {
        writes.push(observeRequest(journalStore.add(JournalEntryRecordMapper.toRecord(entry))));
      }
      await Promise.all(writes);
      await completion;
      this.#mutationRecorder.notifyCommitted(pilotMutationRecorded);
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw transactionFailed(error);
    }
  }
}

async function validateExpectedState(
  transaction: IDBTransaction,
  input: CommitJournalStateInput,
): Promise<void> {
  const checks: Promise<void>[] = [];
  for (const change of input.days ?? []) {
    checks.push(
      validateVersion(
        transaction.objectStore(LIFE_OS_STORE.days),
        change.day.id.toString(),
        change.expectedVersion,
      ),
    );
  }
  for (const change of input.decisions ?? []) {
    const store = transaction.objectStore(LIFE_OS_STORE.decisions);
    checks.push(validateVersion(store, change.decision.id.toString(), change.expectedVersion));
    if (change.expectedVersion === null) {
      checks.push(
        validateUniqueDecisionCreation(store, DecisionRecordMapper.toRecord(change.decision)),
      );
    }
  }
  for (const change of input.lifeActions ?? []) {
    checks.push(
      validateVersion(
        transaction.objectStore(LIFE_OS_STORE.lifeActions),
        change.lifeAction.id.toString(),
        change.expectedVersion,
      ),
    );
  }
  for (const change of input.workSessions ?? []) {
    const store = transaction.objectStore(LIFE_OS_STORE.actionSessions);
    checks.push(validateVersion(store, change.workSession.id.toString(), change.expectedVersion));
    if (change.expectedVersion === null) checks.push(validateNoUnfinishedSession(store));
  }
  for (const change of input.directions ?? []) {
    checks.push(
      validateVersion(
        transaction.objectStore(LIFE_OS_STORE.directions),
        change.direction.id.toString(),
        change.expectedVersion,
      ),
    );
  }
  for (const change of input.projects ?? []) {
    checks.push(
      validateVersion(
        transaction.objectStore(LIFE_OS_STORE.goals),
        change.project.id.toString(),
        change.expectedVersion,
      ),
    );
  }
  await Promise.all(checks);
}

async function validateVersion(
  store: IDBObjectStore,
  id: string,
  expectedVersion: number | null,
): Promise<void> {
  const stored = await observeRequest<VersionedRecord | undefined>(store.get(id));
  const matches =
    expectedVersion === null ? stored === undefined : stored?.version === expectedVersion;
  if (!matches) {
    throw new DomainError('persistence.version_conflict', 'Состояние изменилось в другой вкладке.');
  }
}

async function validateUniqueDecisionCreation(
  store: IDBObjectStore,
  candidate: DecisionRecord,
): Promise<void> {
  if (candidate.plannedDate === null) return;
  const records = await observeRequest<DecisionRecord[]>(
    store.index('byPlannedDate').getAll(candidate.plannedDate),
  );
  if (
    records.some(
      (record) =>
        record.id !== candidate.id &&
        record.title === candidate.title &&
        record.kind === candidate.kind &&
        record.archivedAt === null &&
        record.deletedAt == null &&
        record.status !== 'cancelled',
    )
  ) {
    throw new DomainError('decision.duplicate_for_date', 'Такое решение уже существует.');
  }
}

async function validateNoUnfinishedSession(store: IDBObjectStore): Promise<void> {
  const [running, paused] = await Promise.all([
    observeRequest<unknown[]>(store.index('byStatus').getAll('running')),
    observeRequest<unknown[]>(store.index('byStatus').getAll('paused')),
  ]);
  if (running.length > 0 || paused.length > 0) {
    throw new DomainError('session.unfinished_exists', 'Другая рабочая сессия уже выполняется.');
  }
}

function collectStores(input: CommitJournalStateInput): string[] {
  const stores = new Set<string>([LIFE_OS_STORE.journal]);
  if ((input.days?.length ?? 0) > 0) stores.add(LIFE_OS_STORE.days);
  if ((input.decisions?.length ?? 0) > 0) stores.add(LIFE_OS_STORE.decisions);
  if ((input.lifeActions?.length ?? 0) > 0) stores.add(LIFE_OS_STORE.lifeActions);
  if ((input.workSessions?.length ?? 0) > 0) stores.add(LIFE_OS_STORE.actionSessions);
  if ((input.directions?.length ?? 0) > 0) stores.add(LIFE_OS_STORE.directions);
  if ((input.projects?.length ?? 0) > 0) stores.add(LIFE_OS_STORE.goals);
  if ((input.directions?.length ?? 0) > 0 || (input.projects?.length ?? 0) > 0) {
    for (const store of PILOT_MUTATION_STORES) stores.add(store);
  }
  return [...stores];
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
    // Transaction already completed.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after abort.
  }
}

function transactionFailed(error: unknown): DomainError {
  return new DomainError(
    'persistence.transaction_failed',
    'Состояние и событие журнала не были сохранены.',
    { cause: error },
  );
}
