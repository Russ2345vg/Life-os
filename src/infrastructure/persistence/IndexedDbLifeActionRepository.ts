import type { LifeActionRepository, LifeActionsByDecisionIdsReader } from '../../application';
import type { DayDate, EntityId, LifeAction } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import type { LifeActionRecord } from './records/LifeActionRecord';
import { assertChangedActionTimeWindows } from '../../domain/life-action/ActionTimeWindows';

export class IndexedDbLifeActionRepository
  implements LifeActionRepository, LifeActionsByDecisionIdsReader
{
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findById(id: EntityId): Promise<LifeAction | null> {
    const database = await this.#indexedDb.open();
    const storedRecord = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.lifeActions,
      'readonly',
      (store) => store.get(id.toString()),
    );

    if (storedRecord === undefined) {
      return null;
    }

    const action = LifeActionRecordMapper.fromRecord(storedRecord as LifeActionRecord);
    return action.isDeleted() ? null : action;
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return this.findByIndex('byPlannedDate', date.toString());
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return this.findByIndex('byDecisionId', decisionId.toString());
  }

  public async findByDecisionIds(decisionIds: readonly EntityId[]): Promise<readonly LifeAction[]> {
    if (decisionIds.length === 0) return [];

    const acceptedIds = new Set(decisionIds.map((decisionId) => decisionId.toString()));
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.lifeActions,
      'readonly',
      (store) => store.getAll(),
    );

    return storedRecords
      .map((record) => LifeActionRecordMapper.fromRecord(record as LifeActionRecord))
      .filter((lifeAction) => !lifeAction.isDeleted())
      .filter((lifeAction) =>
        lifeAction.decisionId === null ? false : acceptedIds.has(lifeAction.decisionId.toString()),
      );
  }

  public async findAll(): Promise<readonly LifeAction[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.lifeActions,
      'readonly',
      (store) => store.getAll(),
    );

    return storedRecords
      .map((record) => LifeActionRecordMapper.fromRecord(record as LifeActionRecord))
      .filter((action) => !action.isDeleted());
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = LifeActionRecordMapper.toRecord(lifeAction);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(
          this.#indexedDb.balanceTransactionStores([LIFE_OS_STORE.lifeActions]),
          'readwrite',
        ),
        store = tx.objectStore(LIFE_OS_STORE.lifeActions);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      const get = store.getAll();
      get.onsuccess = () => {
        const previous = get.result as LifeActionRecord[];
        const final = new Map(previous.map((action) => [action.id, action]));
        const merged = { ...final.get(record.id), ...record };
        final.set(record.id, merged);
        try {
          assertChangedActionTimeWindows(previous, [...final.values()]);
        } catch (error: unknown) {
          reject(error);
          tx.abort();
          return;
        }
        const put = store.put(merged);
        put.onsuccess = () => {
          void this.#indexedDb.refreshBalanceSnapshots(tx).catch((error: unknown) => {
            try {
              tx.abort();
            } catch {
              /* Refresh already aborted the transaction. */
            }
            reject(error);
          });
        };
      };
    });
  }

  private async findByIndex(indexName: string, key: string): Promise<readonly LifeAction[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.lifeActions,
      'readonly',
      (store) => store.index(indexName).getAll(key),
    );

    return storedRecords
      .map((record) => LifeActionRecordMapper.fromRecord(record as LifeActionRecord))
      .filter((action) => !action.isDeleted());
  }
}
