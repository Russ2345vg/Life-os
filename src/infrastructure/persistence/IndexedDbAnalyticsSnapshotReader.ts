import type {
  AnalyticsSnapshot,
  AnalyticsSnapshotReader,
} from '../../application/ports/AnalyticsSnapshotReader';
import { BalanceMonthlySnapshotRecordMapper } from './BalanceRecordMappers';
import { LIFE_OS_STORE, type LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import {
  ActionSessionRecordMapper,
  DiaryEntryRecordMapper,
  DirectionRecordMapper,
  GoalRecordMapper,
  LifeActionRecordMapper,
  MemoryEventRecordMapper,
  SleepObservationRecordMapper,
  SphereRecordMapper,
  WalkRecordMapper,
} from './mappers';
import { SleepScheduleRecordMapper } from './mappers/SleepScheduleRecordMapper';
import { ProgressContributionRecordMapper } from './PlanningRecordMappers';
import type { ActionSessionRecord } from './records/ActionSessionRecord';
import type { LifeActionRecord } from './records/LifeActionRecord';
import { done, request } from '../sync/attachments/AttachmentRegistration';

const stores = [
  LIFE_OS_STORE.lifeActions,
  LIFE_OS_STORE.actionSessions,
  LIFE_OS_STORE.goals,
  LIFE_OS_STORE.progressContributions,
  LIFE_OS_STORE.diaryEntries,
  LIFE_OS_STORE.balanceMonthlySnapshots,
  LIFE_OS_STORE.walks,
  LIFE_OS_STORE.memoryEvents,
  LIFE_OS_STORE.sleepSchedules,
  LIFE_OS_STORE.sleepObservations,
  LIFE_OS_STORE.spheres,
  LIFE_OS_STORE.directions,
] as const;

export class IndexedDbAnalyticsSnapshotReader implements AnalyticsSnapshotReader {
  constructor(private readonly database: LifeOsIndexedDb) {}

  subscribe(listener: () => void): () => void {
    return this.database.subscribeCommits((changed) => {
      if (changed.some((store) => stores.includes(store as (typeof stores)[number]))) listener();
    });
  }

  async read(): Promise<AnalyticsSnapshot> {
    const database = await this.database.open();
    const transaction = database.transaction(stores, 'readonly');
    const completed = done(transaction);
    void completed.catch(() => undefined);
    // Queue every request synchronously, before the transaction can become inactive.
    const requests = stores.map((store) =>
      request<unknown[]>(transaction.objectStore(store).getAll()),
    );
    const records = await Promise.all(requests);
    await completed;
    const [
      actions,
      sessions,
      goals,
      contributions,
      diary,
      balance,
      walks,
      memory,
      sleep,
      sleepObservations,
      spheres,
      directions,
    ] = records;
    return {
      actions: actions!.map((record) =>
        LifeActionRecordMapper.fromRecord(record as LifeActionRecord),
      ),
      sessions: sessions!.map((record) =>
        ActionSessionRecordMapper.fromRecord(record as ActionSessionRecord),
      ),
      goals: goals!.map(GoalRecordMapper.fromRecord),
      contributions: contributions!.map(ProgressContributionRecordMapper.fromRecord),
      diary: diary!.map(DiaryEntryRecordMapper.fromRecord),
      balance: balance!.map(BalanceMonthlySnapshotRecordMapper.fromRecord),
      walks: walks!.map(WalkRecordMapper.fromRecord),
      memory: memory!.map(MemoryEventRecordMapper.fromRecord),
      sleep: sleep!.length ? SleepScheduleRecordMapper.fromRecord(sleep![0]) : null,
      sleepObservations: sleepObservations!.map(SleepObservationRecordMapper.fromRecord),
      spheres: spheres!.map(SphereRecordMapper.fromRecord),
      directions: directions!.map(DirectionRecordMapper.fromRecord),
    };
  }
}
