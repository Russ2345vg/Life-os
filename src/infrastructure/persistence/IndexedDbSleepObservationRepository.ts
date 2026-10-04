import type {
  SleepObservationPeriod,
  SleepObservationRepository,
} from '../../application/sleep/SleepObservationRepository';
import type { SleepObservation } from '../../domain/sleep/SleepObservation';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { SleepObservationRecordMapper } from './mappers/SleepObservationRecordMapper';

export class IndexedDbSleepObservationRepository implements SleepObservationRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async getByCycleDate(cycleDate: string): Promise<SleepObservation | null> {
    const database = await this.database.open();
    const record = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.sleepObservations,
      'readonly',
      (store) => store.index('byCycleDate').get(cycleDate),
    );
    return record === undefined ? null : SleepObservationRecordMapper.fromRecord(record);
  }

  public async list(period: SleepObservationPeriod): Promise<readonly SleepObservation[]> {
    const database = await this.database.open();
    const records = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.sleepObservations,
      'readonly',
      (store) => store.getAll(),
    );
    return records
      .map((record) => SleepObservationRecordMapper.fromRecord(record))
      .filter(({ cycleDate }) => cycleDate >= period.from && cycleDate <= period.to)
      .sort((left, right) => right.cycleDate.localeCompare(left.cycleDate));
  }

  public async save(observation: SleepObservation): Promise<void> {
    const database = await this.database.open();
    await executeIndexedDbRequest(database, LIFE_OS_STORE.sleepObservations, 'readwrite', (store) =>
      store.put(SleepObservationRecordMapper.toRecord(observation)),
    );
  }

  public subscribe(listener: () => void): () => void {
    return this.database.subscribeCommits((stores) => {
      if (stores.includes(LIFE_OS_STORE.sleepObservations)) listener();
    });
  }
}
