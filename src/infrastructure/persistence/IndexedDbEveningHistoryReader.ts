import type {
  EveningHistoryReadRange,
  EveningHistoryReader,
  EveningHistorySourceData,
} from '../../application';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import {
  EveningCycleRecordMapper,
  PreparationPlanRecordMapper,
  TomorrowPlanRecordMapper,
} from './mappers';
import type { EveningCycleRecord, PreparationPlanRecord, TomorrowPlanRecord } from './records';

export class IndexedDbEveningHistoryReader implements EveningHistoryReader {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async read(range: EveningHistoryReadRange): Promise<EveningHistorySourceData> {
    const database = await this.database.open();
    const transaction = database.transaction(
      [LIFE_OS_STORE.eveningCycles, LIFE_OS_STORE.tomorrowPlans, LIFE_OS_STORE.preparationPlans],
      'readonly',
    );
    const [cycleRecords, tomorrowRecords, preparationRecords] = await Promise.all([
      observeRequest<EveningCycleRecord[]>(
        transaction
          .objectStore(LIFE_OS_STORE.eveningCycles)
          .index('byDateKey')
          .getAll(IDBKeyRange.bound(range.startDate.toString(), range.endDate.toString())),
      ),
      observeRequest<TomorrowPlanRecord[]>(
        transaction.objectStore(LIFE_OS_STORE.tomorrowPlans).getAll(),
      ),
      observeRequest<PreparationPlanRecord[]>(
        transaction.objectStore(LIFE_OS_STORE.preparationPlans).getAll(),
      ),
    ]);
    const cycleIds = new Set(cycleRecords.map((record) => record.id));

    return Object.freeze({
      cycles: Object.freeze(cycleRecords.map(EveningCycleRecordMapper.fromRecord)),
      tomorrowPlans: Object.freeze(
        tomorrowRecords
          .filter((record) => cycleIds.has(record.cycleId))
          .map(TomorrowPlanRecordMapper.fromRecord),
      ),
      preparationPlans: Object.freeze(
        preparationRecords
          .filter((record) => cycleIds.has(record.cycleId))
          .map(PreparationPlanRecordMapper.fromRecord),
      ),
    });
  }
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}
