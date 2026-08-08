import type { OpenDayConflictReader } from '../../application/ports/OpenDayConflictReader';
import { DAY_STATUS, type Day } from '../../domain';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import type { DayRecord } from './records/DayRecord';

export class IndexedDbOpenDayConflictReader implements OpenDayConflictReader {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findOpenDays(): Promise<readonly Day[]> {
    const database = await this.#indexedDb.open();
    const records = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.getAll(),
    );

    return records
      .map((record) => DayRecordMapper.fromRecord(record as DayRecord))
      .filter((day) => day.status === DAY_STATUS.open)
      .sort((left, right) => left.date.toString().localeCompare(right.date.toString()));
  }
}
