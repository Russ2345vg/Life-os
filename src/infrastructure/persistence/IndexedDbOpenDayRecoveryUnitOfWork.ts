import type {
  CommitOpenDayRecoveryInput,
  OpenDayRecoveryUnitOfWork,
} from '../../application/ports/OpenDayRecoveryUnitOfWork';
import { DAY_STATUS } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import type { ActionSessionRecord } from './records/ActionSessionRecord';
import type { DayRecord } from './records/DayRecord';
import type { LifeActionRecord } from './records/LifeActionRecord';

export class IndexedDbOpenDayRecoveryUnitOfWork implements OpenDayRecoveryUnitOfWork {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async commit(input: CommitOpenDayRecoveryInput): Promise<void> {
    const database = await this.#indexedDb.open();
    let transaction: IDBTransaction;

    try {
      transaction = database.transaction(
        [LIFE_OS_STORE.days, LIFE_OS_STORE.lifeActions, LIFE_OS_STORE.actionSessions],
        'readwrite',
      );
    } catch (error: unknown) {
      throw transactionFailed(error);
    }

    const transactionCompletion = observeTransaction(transaction);

    try {
      const dayStore = transaction.objectStore(LIFE_OS_STORE.days);
      const lifeActionStore = transaction.objectStore(LIFE_OS_STORE.lifeActions);
      const sessionStore = transaction.objectStore(LIFE_OS_STORE.actionSessions);
      const [storedDays, storedLifeActions, storedSessions] = await Promise.all([
        observeRequest<DayRecord[]>(dayStore.getAll()),
        observeRequest<LifeActionRecord[]>(lifeActionStore.getAll()),
        observeRequest<ActionSessionRecord[]>(sessionStore.getAll()),
      ]);

      const openDays = storedDays.filter((record) => record.status === DAY_STATUS.open);
      validateExpectedOpenDays(openDays, input);
      validateUnfinishedSession(storedLifeActions, storedSessions, openDays, input);
      validateCompletedDays(openDays, input);

      await Promise.all(
        input.completedDays.map((day) =>
          observeRequest(dayStore.put(DayRecordMapper.toRecord(day))),
        ),
      );
      await transactionCompletion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(transactionCompletion);

      if (error instanceof DomainError) {
        throw error;
      }

      throw transactionFailed(error);
    }
  }
}

function validateExpectedOpenDays(
  openDays: readonly DayRecord[],
  input: CommitOpenDayRecoveryInput,
): void {
  if (openDays.length !== input.expectedOpenDays.length) {
    throw recoveryConflict();
  }

  const expectedById = new Map(
    input.expectedOpenDays.map((item) => [item.dayId.toString(), item.version]),
  );
  const matches = openDays.every((record) => expectedById.get(record.id) === record.version);

  if (!matches) {
    throw recoveryConflict();
  }

  if (
    input.keepOpenDayId !== null &&
    !openDays.some((record) => record.id === input.keepOpenDayId!.toString())
  ) {
    throw new DomainError(
      'day.recovery_invalid_keep_day',
      'Выбранный день больше не является активным.',
    );
  }
}

function validateUnfinishedSession(
  lifeActions: readonly LifeActionRecord[],
  sessions: readonly ActionSessionRecord[],
  openDays: readonly DayRecord[],
  input: CommitOpenDayRecoveryInput,
): void {
  const unfinished = sessions.filter(
    (session) => session.status === 'running' || session.status === 'paused',
  );

  if (unfinished.length > 1) {
    throw new DomainError(
      'action_session.multiple_unfinished_detected',
      'Обнаружено несколько незавершённых рабочих сессий.',
    );
  }

  const session = unfinished[0];
  if (session === undefined) {
    return;
  }

  const action = lifeActions.find((item) => item.id === session.lifeActionId);
  if (action === undefined || action.plannedDate === null) {
    throw new DomainError(
      'day.recovery_orphaned_session',
      'Незавершённая сессия не может быть безопасно связана с активным днём.',
    );
  }

  const sessionDay = openDays.find((day) => day.date === action.plannedDate);
  if (sessionDay === undefined) {
    throw new DomainError(
      'day.recovery_orphaned_session',
      'Незавершённая сессия относится к дню вне найденного конфликта.',
    );
  }

  if (input.keepOpenDayId === null || sessionDay.id !== input.keepOpenDayId.toString()) {
    throw new DomainError(
      'day.recovery_session_blocked',
      'Нельзя закрыть день с активной или приостановленной рабочей сессией.',
    );
  }
}

function validateCompletedDays(
  openDays: readonly DayRecord[],
  input: CommitOpenDayRecoveryInput,
): void {
  const expectedCompletedIds = new Set(
    openDays
      .filter(
        (record) => input.keepOpenDayId === null || record.id !== input.keepOpenDayId.toString(),
      )
      .map((record) => record.id),
  );

  if (expectedCompletedIds.size !== input.completedDays.length) {
    throw recoveryConflict();
  }

  for (const day of input.completedDays) {
    if (!expectedCompletedIds.has(day.id.toString()) || day.status !== DAY_STATUS.completed) {
      throw recoveryConflict();
    }
  }
}

function recoveryConflict(): DomainError {
  return new DomainError(
    'day.recovery_conflict',
    'Активные дни изменились. Обновите восстановление и повторите операцию.',
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
    // Транзакция уже завершилась или была отменена.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Исходная ошибка операции важнее ошибки отмены транзакции.
  }
}

function transactionFailed(error: unknown): DomainError {
  return new DomainError(
    'persistence.transaction_failed',
    'Транзакция восстановления активных дней не была выполнена.',
    { cause: error },
  );
}
