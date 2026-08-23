import type { CommitTomorrowPlanInput, TomorrowPlanUnitOfWork } from '../../application';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { EveningCycleRecordMapper } from './mappers/EveningCycleRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { TomorrowPlanRecordMapper } from './mappers/TomorrowPlanRecordMapper';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import { RecommendationApplicationRecordMapper } from './mappers/RecommendationApplicationRecordMapper';
import type { EveningCycleRecord } from './records/EveningCycleRecord';
import type { RecommendationApplicationRecord } from './records/RecommendationApplicationRecord';
import type { TomorrowPlanRecord } from './records/TomorrowPlanRecord';

export class IndexedDbTomorrowPlanUnitOfWork implements TomorrowPlanUnitOfWork {
  readonly #database: LifeOsIndexedDb;

  public constructor(database: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#database = database;
  }

  public async commit(input: CommitTomorrowPlanInput): Promise<void> {
    const database = await this.#database.open();
    const transaction = database.transaction(
      [
        LIFE_OS_STORE.tomorrowPlans,
        LIFE_OS_STORE.days,
        LIFE_OS_STORE.decisions,
        LIFE_OS_STORE.lifeActions,
        LIFE_OS_STORE.eveningCycles,
        LIFE_OS_STORE.journal,
        LIFE_OS_STORE.recommendationApplications,
      ],
      'readwrite',
    );
    const completion = observeTransaction(transaction);
    try {
      const planStore = transaction.objectStore(LIFE_OS_STORE.tomorrowPlans);
      await validatePlan(planStore, input);
      if (input.eveningCycle !== undefined) await validateCycle(transaction, input);
      if (input.recommendationApplication !== undefined) {
        await validateRecommendationApplication(transaction, input);
      }

      const writes: Promise<unknown>[] = [];
      if (input.targetDay !== undefined) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.days)
              .add(DayRecordMapper.toRecord(input.targetDay)),
          ),
        );
      }
      if (input.newDecision !== undefined) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.decisions)
              .add(DecisionRecordMapper.toRecord(input.newDecision)),
          ),
        );
      }
      if (input.newLifeAction !== undefined) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.lifeActions)
              .add(LifeActionRecordMapper.toRecord(input.newLifeAction)),
          ),
        );
      }
      if (input.eveningCycle !== undefined) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.eveningCycles)
              .put(EveningCycleRecordMapper.toRecord(input.eveningCycle)),
          ),
        );
      }
      for (const entry of input.journalEntries ?? []) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.journal)
              .add(JournalEntryRecordMapper.toRecord(entry)),
          ),
        );
      }
      if (input.recommendationApplication !== undefined) {
        writes.push(
          observeRequest(
            transaction
              .objectStore(LIFE_OS_STORE.recommendationApplications)
              .put(
                RecommendationApplicationRecordMapper.toRecord(
                  input.recommendationApplication.application,
                ),
              ),
          ),
        );
      }
      writes.push(
        observeRequest(
          input.expectedPlanVersion === null
            ? planStore.add(TomorrowPlanRecordMapper.toRecord(input.plan))
            : planStore.put(TomorrowPlanRecordMapper.toRecord(input.plan)),
        ),
      );
      await Promise.all(writes);
      await completion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'tomorrow_plan.transaction_failed',
        'План завтра не был сохранён: атомарная операция отменена.',
        { cause: error },
      );
    }
  }
}

async function validateRecommendationApplication(
  transaction: IDBTransaction,
  input: CommitTomorrowPlanInput,
): Promise<void> {
  const completion = input.recommendationApplication!;
  const stored = await observeRequest<RecommendationApplicationRecord | undefined>(
    transaction
      .objectStore(LIFE_OS_STORE.recommendationApplications)
      .get(completion.application.recommendationId),
  );
  if (stored === undefined || stored.status !== completion.expectedStatus) {
    throw new DomainError(
      'recommendation.concurrent_change',
      'Состояние рекомендации изменилось в другом окне.',
    );
  }
}

async function validatePlan(store: IDBObjectStore, input: CommitTomorrowPlanInput): Promise<void> {
  const stored = await observeRequest<TomorrowPlanRecord | undefined>(
    store.get(input.plan.id.toString()),
  );
  if (input.expectedPlanVersion === null) {
    const sameCycle = await observeRequest<TomorrowPlanRecord | undefined>(
      store.index('byCycleId').get(input.plan.cycleId.toString()),
    );
    const sameTarget = await observeRequest<TomorrowPlanRecord | undefined>(
      store.index('byTargetDateKey').get(input.plan.targetDateKey.toString()),
    );
    if (stored !== undefined || sameCycle !== undefined || sameTarget !== undefined)
      throw conflict();
    return;
  }
  if (stored === undefined || stored.version !== input.expectedPlanVersion) throw conflict();
}

async function validateCycle(
  transaction: IDBTransaction,
  input: CommitTomorrowPlanInput,
): Promise<void> {
  const cycle = input.eveningCycle!;
  const stored = await observeRequest<EveningCycleRecord | undefined>(
    transaction.objectStore(LIFE_OS_STORE.eveningCycles).get(cycle.id.toString()),
  );
  if (
    input.expectedEveningCycleVersion === undefined ||
    stored === undefined ||
    stored.version !== input.expectedEveningCycleVersion
  ) {
    throw new DomainError(
      'evening_cycle.concurrent_change',
      'Вечерний цикл изменился в другом окне. Обновите данные и повторите операцию.',
    );
  }
}

function conflict(): DomainError {
  return new DomainError(
    'tomorrow_plan.concurrent_change',
    'План завтра изменился в другом окне. Обновите данные и повторите операцию.',
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
    /* transaction already settled */
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    /* expected after abort */
  }
}
