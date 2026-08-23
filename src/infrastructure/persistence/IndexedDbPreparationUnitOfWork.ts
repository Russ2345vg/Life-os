import type { CommitPreparationInput, PreparationUnitOfWork } from '../../application';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { EveningCycleRecordMapper } from './mappers/EveningCycleRecordMapper';
import { PreparationPlanRecordMapper } from './mappers/PreparationPlanRecordMapper';
import type { EveningCycleRecord } from './records/EveningCycleRecord';
import type { PreparationPlanRecord } from './records/PreparationPlanRecord';

export class IndexedDbPreparationUnitOfWork implements PreparationUnitOfWork {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async commit(input: CommitPreparationInput): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(
      [LIFE_OS_STORE.preparationPlans, LIFE_OS_STORE.eveningCycles],
      'readwrite',
    );
    const completion = observeTransaction(transaction);
    try {
      const planStore = transaction.objectStore(LIFE_OS_STORE.preparationPlans);
      await validatePlan(planStore, input);
      if (input.eveningCycle !== undefined) await validateCycle(transaction, input);
      await observeRequest(
        input.expectedPlanVersion === null
          ? planStore.add(PreparationPlanRecordMapper.toRecord(input.plan))
          : planStore.put(PreparationPlanRecordMapper.toRecord(input.plan)),
      );
      if (input.eveningCycle !== undefined) {
        await observeRequest(
          transaction
            .objectStore(LIFE_OS_STORE.eveningCycles)
            .put(EveningCycleRecordMapper.toRecord(input.eveningCycle)),
        );
      }
      await completion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'preparation.transaction_failed',
        'Подготовка не сохранена: атомарная операция отменена.',
        { cause: error },
      );
    }
  }
}

async function validatePlan(store: IDBObjectStore, input: CommitPreparationInput): Promise<void> {
  const stored = await observeRequest<PreparationPlanRecord | undefined>(
    store.get(input.plan.id.toString()),
  );
  if (input.expectedPlanVersion === null) {
    const sameCycle = await observeRequest<PreparationPlanRecord | undefined>(
      store.index('byCycleId').get(input.plan.cycleId.toString()),
    );
    if (stored !== undefined || sameCycle !== undefined) throw conflict();
    return;
  }
  if (stored === undefined || stored.version !== input.expectedPlanVersion) throw conflict();
}

async function validateCycle(
  transaction: IDBTransaction,
  input: CommitPreparationInput,
): Promise<void> {
  const stored = await observeRequest<EveningCycleRecord | undefined>(
    transaction.objectStore(LIFE_OS_STORE.eveningCycles).get(input.eveningCycle!.id.toString()),
  );
  if (
    stored === undefined ||
    input.expectedEveningCycleVersion === undefined ||
    stored.version !== input.expectedEveningCycleVersion
  ) {
    throw conflict();
  }
}

function conflict(): DomainError {
  return new DomainError(
    'preparation.concurrent_change',
    'Подготовка изменилась в другом окне. Повторите операцию.',
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
    // Already settled.
  }
}
async function settle(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after abort.
  }
}
