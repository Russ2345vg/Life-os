import type { DayRepository } from '../../application';
import { DAY_STATUS, type Day, type DayDate } from '../../domain';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import type { DayRecord } from './records/DayRecord';
import { DomainError } from '../../shared/errors/DomainError';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

export class IndexedDbDayRepository implements DayRepository {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findByDate(date: DayDate): Promise<Day | null> {
    const database = await this.#indexedDb.open();
    const storedRecord = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.index('byDate').get(date.toString()),
    );

    if (storedRecord === undefined) {
      return null;
    }

    return DayRecordMapper.fromRecord(storedRecord as DayRecord);
  }

  public async findOpen(): Promise<Day | null> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.getAll(),
    );
    const openDays = storedRecords
      .map((record) => DayRecordMapper.fromRecord(record as DayRecord))
      .filter((day) => day.status === DAY_STATUS.open);

    if (openDays.length > 1) {
      throw new DomainError(
        'day.multiple_open_detected',
        'Обнаружено несколько одновременно открытых дней.',
      );
    }

    return openDays[0] ?? null;
  }

  public async save(day: Day): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = DayRecordMapper.toRecord(day);

    await executeIndexedDbRequest<IDBValidKey>(database, LIFE_OS_STORE.days, 'readwrite', (store) =>
      store.put(record),
    );
  }
}
