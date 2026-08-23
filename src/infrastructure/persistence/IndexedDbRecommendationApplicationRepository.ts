import type {
  RecommendationApplication,
  RecommendationApplicationRepository,
  RecommendationApplicationStatus,
} from '../../application';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { RecommendationApplicationRecordMapper } from './mappers/RecommendationApplicationRecordMapper';
import type { RecommendationApplicationRecord } from './records/RecommendationApplicationRecord';

export class IndexedDbRecommendationApplicationRepository implements RecommendationApplicationRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findByRecommendationId(
    recommendationId: string,
  ): Promise<RecommendationApplication | null> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.recommendationApplications, 'readonly');
    const record = await observeRequest<RecommendationApplicationRecord | undefined>(
      transaction.objectStore(LIFE_OS_STORE.recommendationApplications).get(recommendationId),
    );
    return record === undefined ? null : RecommendationApplicationRecordMapper.fromRecord(record);
  }

  public async findByRecommendationIds(
    recommendationIds: readonly string[],
  ): Promise<readonly RecommendationApplication[]> {
    const uniqueIds = [...new Set(recommendationIds)];
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.recommendationApplications, 'readonly');
    const store = transaction.objectStore(LIFE_OS_STORE.recommendationApplications);
    const records = await Promise.all(
      uniqueIds.map((id) =>
        observeRequest<RecommendationApplicationRecord | undefined>(store.get(id)),
      ),
    );
    return records.flatMap((record) =>
      record === undefined ? [] : [RecommendationApplicationRecordMapper.fromRecord(record)],
    );
  }

  public async createIfAbsent(
    application: RecommendationApplication,
  ): Promise<RecommendationApplication> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.recommendationApplications, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.recommendationApplications);
    const completion = observeTransaction(transaction);
    try {
      const existing = await observeRequest<RecommendationApplicationRecord | undefined>(
        store.get(application.recommendationId),
      );
      if (existing !== undefined) {
        await completion;
        return RecommendationApplicationRecordMapper.fromRecord(existing);
      }
      await observeRequest(store.add(RecommendationApplicationRecordMapper.toRecord(application)));
      await completion;
      return application;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      const existing = await this.findByRecommendationId(application.recommendationId);
      if (existing !== null) return existing;
      throw error;
    }
  }

  public async saveIfStatusMatches(
    application: RecommendationApplication,
    expectedStatus: RecommendationApplicationStatus,
  ): Promise<boolean> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.recommendationApplications, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.recommendationApplications);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<RecommendationApplicationRecord | undefined>(
        store.get(application.recommendationId),
      );
      if (stored === undefined || stored.status !== expectedStatus) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(store.put(RecommendationApplicationRecordMapper.toRecord(application)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
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
    // Transaction already settled.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after an optimistic abort or a concurrent add.
  }
}
