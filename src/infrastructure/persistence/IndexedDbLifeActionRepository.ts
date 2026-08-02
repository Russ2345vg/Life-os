import type { LifeActionRepository } from '../../application';
import type { DayDate, EntityId, LifeAction } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import type { LifeActionRecord } from './records/LifeActionRecord';

export class IndexedDbLifeActionRepository implements LifeActionRepository {
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

    return LifeActionRecordMapper.fromRecord(storedRecord as LifeActionRecord);
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return this.findByIndex('byPlannedDate', date.toString());
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return this.findByIndex('byDecisionId', decisionId.toString());
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = LifeActionRecordMapper.toRecord(lifeAction);

    await executeIndexedDbRequest<IDBValidKey>(
      database,
      LIFE_OS_STORE.lifeActions,
      'readwrite',
      (store) => store.put(record),
    );
  }

  private async findByIndex(indexName: string, key: string): Promise<readonly LifeAction[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.lifeActions,
      'readonly',
      (store) => store.index(indexName).getAll(key),
    );

    return storedRecords.map((record) =>
      LifeActionRecordMapper.fromRecord(record as LifeActionRecord),
    );
  }
}
