import type { DecisionRepository } from '../../application';
import type { DayDate, Decision, EntityId } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import type { DecisionRecord } from './records/DecisionRecord';

export class IndexedDbDecisionRepository implements DecisionRepository {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    const database = await this.#indexedDb.open();
    const storedRecord = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.get(id.toString()),
    );

    if (storedRecord === undefined) {
      return null;
    }

    return DecisionRecordMapper.fromRecord(storedRecord as DecisionRecord);
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.index('byPlannedDate').getAll(date.toString()),
    );

    return storedRecords.map((record) => DecisionRecordMapper.fromRecord(record as DecisionRecord));
  }

  public async save(decision: Decision): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = DecisionRecordMapper.toRecord(decision);

    await executeIndexedDbRequest<IDBValidKey>(
      database,
      LIFE_OS_STORE.decisions,
      'readwrite',
      (store) => store.put(record),
    );
  }
}
