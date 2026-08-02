import { DomainError } from '../../../shared/errors/DomainError';

interface FulfilledRequest<T> {
  readonly status: 'fulfilled';
  readonly value: T;
}

interface RejectedRequest {
  readonly status: 'rejected';
  readonly reason: unknown;
}

type RequestOutcome<T> = FulfilledRequest<T> | RejectedRequest;

interface FulfilledTransaction {
  readonly status: 'fulfilled';
}

interface RejectedTransaction {
  readonly status: 'rejected';
  readonly reason: unknown;
}

type TransactionOutcome = FulfilledTransaction | RejectedTransaction;

export async function executeIndexedDbRequest<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  let transaction: IDBTransaction;

  try {
    transaction = database.transaction(storeName, mode);
  } catch (error: unknown) {
    throw transactionFailed(error);
  }

  const transactionOutcome = observeTransaction(transaction);
  let request: IDBRequest<T>;

  try {
    request = createRequest(transaction.objectStore(storeName));
  } catch (error: unknown) {
    transaction.abort();
    await transactionOutcome;
    throw transactionFailed(error);
  }

  const [settledRequest, settledTransaction] = await Promise.all([
    observeRequest(request),
    transactionOutcome,
  ]);

  if (settledRequest.status === 'rejected') {
    throw persistenceOperationError(settledRequest.reason);
  }

  if (settledTransaction.status === 'rejected') {
    throw persistenceOperationError(settledTransaction.reason);
  }

  return settledRequest.value;
}

function observeRequest<T>(request: IDBRequest<T>): Promise<RequestOutcome<T>> {
  return new Promise((resolve) => {
    request.addEventListener('success', () => {
      resolve({ status: 'fulfilled', value: request.result });
    });
    request.addEventListener('error', () => {
      resolve({ status: 'rejected', reason: request.error });
    });
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<TransactionOutcome> {
  return new Promise((resolve) => {
    transaction.addEventListener('complete', () => {
      resolve({ status: 'fulfilled' });
    });
    transaction.addEventListener('abort', () => {
      resolve({ status: 'rejected', reason: transaction.error });
    });
    transaction.addEventListener('error', () => {
      resolve({ status: 'rejected', reason: transaction.error });
    });
  });
}

function persistenceOperationError(error: unknown): DomainError {
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
    'Транзакция IndexedDB не была завершена.',
    { cause: error },
  );
}

function isDomExceptionNamed(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}
