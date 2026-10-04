import type { MorningCycleRepository } from '../../application/morning/MorningCycleRepository';
import type { DayDate, MorningCycle } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { MorningCycleRecordMapper } from './mappers/MorningCycleRecordMapper';

export class IndexedDbMorningCycleRepository implements MorningCycleRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findByDate(date: DayDate): Promise<MorningCycle | null> {
    const database = await this.database.open();
    const record = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.morningCycles,
      'readonly',
      (store) => store.index('byDateKey').get(date.toString()),
    );
    return record === undefined ? null : MorningCycleRecordMapper.fromRecord(record);
  }

  public async latestBefore(date: DayDate): Promise<MorningCycle | null> {
    const database = await this.database.open();
    const records = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.morningCycles,
      'readonly',
      (store) => store.getAll(),
    );
    const previous = records
      .map((record) => MorningCycleRecordMapper.fromRecord(record))
      .filter((cycle) => cycle.dateKey.toString() < date.toString())
      .sort((left, right) => right.dateKey.toString().localeCompare(left.dateKey.toString()))[0];
    return previous ?? null;
  }

  public async save(cycle: MorningCycle): Promise<void> {
    const database = await this.database.open();
    await executeIndexedDbRequest(database, LIFE_OS_STORE.morningCycles, 'readwrite', (store) =>
      store.put(MorningCycleRecordMapper.toRecord(cycle)),
    );
  }

  public subscribe(listener: () => void): () => void {
    return this.database.subscribeCommits((stores) => {
      if (stores.includes(LIFE_OS_STORE.morningCycles)) listener();
    });
  }
}
