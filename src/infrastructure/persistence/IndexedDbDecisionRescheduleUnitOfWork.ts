import type {
  CommitDecisionRescheduleInput,
  DecisionRescheduleUnitOfWork,
} from '../../application/ports/DecisionRescheduleUnitOfWork';
import {
  ACTION_SESSION_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import type { ActionSessionRecord } from './records/ActionSessionRecord';
import type { DecisionRecord } from './records/DecisionRecord';
import type { LifeActionRecord } from './records/LifeActionRecord';

export class IndexedDbDecisionRescheduleUnitOfWork implements DecisionRescheduleUnitOfWork {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async commit(input: CommitDecisionRescheduleInput): Promise<void> {
    const database = await this.#indexedDb.open();
    let transaction: IDBTransaction;

    try {
      transaction = database.transaction(
        [
          LIFE_OS_STORE.decisions,
          LIFE_OS_STORE.lifeActions,
          LIFE_OS_STORE.actionSessions,
          LIFE_OS_STORE.journal,
        ],
        'readwrite',
      );
    } catch (error: unknown) {
      throw transactionFailed(error);
    }

    const completion = observeTransaction(transaction);

    try {
      const decisionStore = transaction.objectStore(LIFE_OS_STORE.decisions);
      const actionStore = transaction.objectStore(LIFE_OS_STORE.lifeActions);
      const sessionStore = transaction.objectStore(LIFE_OS_STORE.actionSessions);
      const journalStore = transaction.objectStore(LIFE_OS_STORE.journal);
      const [storedDecision, targetDecisions, storedActions, runningSessions, pausedSessions] =
        await Promise.all([
          observeRequest<DecisionRecord | undefined>(
            decisionStore.get(input.decision.id.toString()),
          ),
          observeRequest<DecisionRecord[]>(
            decisionStore.index('byPlannedDate').getAll(input.newDate.toString()),
          ),
          Promise.all(
            input.movedLifeActions.map((change) =>
              observeRequest<LifeActionRecord | undefined>(
                actionStore.get(change.lifeAction.id.toString()),
              ),
            ),
          ),
          observeRequest<ActionSessionRecord[]>(
            sessionStore.index('byStatus').getAll(ACTION_SESSION_STATUS.running),
          ),
          observeRequest<ActionSessionRecord[]>(
            sessionStore.index('byStatus').getAll(ACTION_SESSION_STATUS.paused),
          ),
        ]);

      validateStoredDecision(storedDecision, input);
      validateTargetCapacity(targetDecisions, input);
      validateStoredActions(storedActions, input);
      validateNoUnfinishedLinkedSession([...runningSessions, ...pausedSessions], input);

      const writes: Promise<unknown>[] = [
        observeRequest(decisionStore.put(DecisionRecordMapper.toRecord(input.decision))),
      ];
      for (const change of input.movedLifeActions) {
        writes.push(
          observeRequest(actionStore.put(LifeActionRecordMapper.toRecord(change.lifeAction))),
        );
      }

      for (const entry of input.journalEntries ?? []) {
        writes.push(observeRequest(journalStore.add(JournalEntryRecordMapper.toRecord(entry))));
      }

      await Promise.all(writes);
      await completion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (error instanceof DomainError) {
        throw error;
      }
      throw transactionFailed(error);
    }
  }
}

function validateStoredDecision(
  stored: DecisionRecord | undefined,
  input: CommitDecisionRescheduleInput,
): void {
  if (
    stored === undefined ||
    stored.version !== input.expectedDecisionVersion ||
    stored.plannedDate !== input.previousDate.toString() ||
    stored.deletedAt != null ||
    stored.archivedAt !== null ||
    (stored.status !== DECISION_STATUS.planned && stored.status !== DECISION_STATUS.inProgress)
  ) {
    throw new DomainError(
      'decision.reschedule_conflict',
      'Решение изменилось в другой вкладке. Обновите карточку и повторите перенос.',
    );
  }
}

function validateTargetCapacity(
  records: readonly DecisionRecord[],
  input: CommitDecisionRescheduleInput,
): void {
  if (input.decision.kind !== DECISION_KIND.main) {
    return;
  }

  const activeMain = records.filter(
    (record) =>
      record.id !== input.decision.id.toString() &&
      record.kind === DECISION_KIND.main &&
      record.archivedAt === null &&
      record.deletedAt == null &&
      (record.status === DECISION_STATUS.planned || record.status === DECISION_STATUS.inProgress),
  );

  if (
    activeMain.length >= 3 ||
    activeMain.some((record) => record.order === input.decision.order)
  ) {
    throw new DomainError(
      'decision.main_limit_reached',
      'На выбранную дату уже назначены три главных решения или занята выбранная позиция.',
    );
  }
}

function validateStoredActions(
  records: readonly (LifeActionRecord | undefined)[],
  input: CommitDecisionRescheduleInput,
): void {
  input.movedLifeActions.forEach((change, index) => {
    const stored = records[index];
    if (
      stored === undefined ||
      stored.version !== change.expectedVersion ||
      stored.decisionId !== input.decision.id.toString() ||
      stored.plannedDate !== input.previousDate.toString() ||
      (stored.status !== LIFE_ACTION_STATUS.ready &&
        stored.status !== LIFE_ACTION_STATUS.inProgress)
    ) {
      throw new DomainError(
        'decision.action_reschedule_conflict',
        'Одно из связанных действий изменилось. Обновите карточку и повторите перенос.',
      );
    }
  });
}

function validateNoUnfinishedLinkedSession(
  sessions: readonly ActionSessionRecord[],
  input: CommitDecisionRescheduleInput,
): void {
  const linkedIds = new Set(input.linkedLifeActionIds.map(String));
  if (sessions.some((session) => linkedIds.has(session.lifeActionId))) {
    throw new DomainError(
      'decision.session_unfinished',
      'Сначала завершите активную или приостановленную рабочую сессию.',
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
    // Исходная предметная ошибка важнее ошибки отмены.
  }
}

function transactionFailed(error: unknown): DomainError {
  return new DomainError(
    'persistence.transaction_failed',
    'Атомарный перенос решения не был выполнен.',
    { cause: error },
  );
}
