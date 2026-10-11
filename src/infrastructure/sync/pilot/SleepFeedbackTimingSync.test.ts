import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import { SleepScheduleService } from '../../../application/sleep/SleepScheduleService';
import { SleepObservationService } from '../../../application/sleep/SleepObservationService';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { IndexedDbSleepScheduleRepository } from '../../persistence/IndexedDbSleepScheduleRepository';
import { IndexedDbSleepObservationRepository } from '../../persistence/IndexedDbSleepObservationRepository';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncOutboxRecord, SyncSettingsRecord } from '../../persistence/records';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';

describe('sleep feedback and timing through production sync', () => {
  it('captures latest revisions, applies, confirms and resets without inventing hours', async () => {
    const phone = new LifeOsIndexedDb(new IDBFactory());
    const factory = new IDBFactory();
    const windows = new LifeOsIndexedDb(factory);
    const clock = new FakeClock(new Date('2026-10-11T01:00:00Z'));
    try {
      await enableCapture(phone);
      const schedules = new IndexedDbSleepScheduleRepository(phone);
      const observations = new IndexedDbSleepObservationRepository(phone);
      const scheduleService = new SleepScheduleService(
        schedules,
        clock,
        new FakeIdGenerator('phone'),
      );
      const service = new SleepObservationService(observations, schedules, clock);
      await scheduleService.saveSettings({
        bedtime: '23:00',
        wakeTime: '07:00',
        timeZone: 'Asia/Chita',
        enabled: true,
      });
      await scheduleService.addCustomItem('personal', 'Растяжка');
      const chosen = (await scheduleService.getState()).preparationItems.find(
        (item) => item.title === 'Растяжка',
      )!;
      await scheduleService.savePreparationTiming({
        totalPreparationMinutes: 30,
        stretchingItemId: chosen.id,
        stretchingMinutes: 10,
      });
      await service.setMorningFeedback({
        cycleDate: '2026-10-10',
        feedback: { sleepQuality: 'GOOD' },
      });
      await service.setMorningFeedback({ cycleDate: '2026-10-10', feedback: { energy: 'TIRED' } });
      const store = new IndexedDbPilotSyncStore(windows);
      await applyLatest(phone, store, 'sleep_schedule', 1);
      await applyLatest(phone, store, 'sleep_observation', 2);
      const received = await new IndexedDbSleepObservationRepository(windows).getByCycleDate(
        '2026-10-10',
      );
      expect(received).toMatchObject({
        wentToBedAt: null,
        wokeAt: null,
        confirmedAt: null,
        morningFeedback: { sleepQuality: 'GOOD', energy: 'TIRED', recordedAt: clock.now() },
      });
      expect(
        (await new IndexedDbSleepScheduleRepository(windows).load())?.preparationTiming,
      ).toEqual({
        totalPreparationMinutes: 30,
        stretchingItemId: chosen.id,
        stretchingMinutes: 10,
      });
      clock.setTime(new Date('2026-10-11T01:01:00Z'));
      await service.confirm({
        cycleDate: '2026-10-10',
        wentToBedAt: new Date('2026-10-10T14:00:00Z'),
        wokeAt: new Date('2026-10-10T22:00:00Z'),
      });
      await service.setMorningFeedback({
        cycleDate: '2026-10-10',
        feedback: { sleepQuality: 'OK' },
      });
      await applyLatest(phone, store, 'sleep_observation', 3);
      expect(
        await new IndexedDbSleepObservationRepository(windows).getByCycleDate('2026-10-10'),
      ).toMatchObject({
        wentToBedAt: new Date('2026-10-10T14:00:00Z'),
        confirmedAt: clock.now(),
        morningFeedback: { sleepQuality: 'OK', energy: 'TIRED' },
      });
      clock.setTime(new Date('2026-10-11T01:02:00Z'));
      await service.clearMorningFeedback('2026-10-10');
      await applyLatest(phone, store, 'sleep_observation', 4);
      windows.close();
      const reopened = new LifeOsIndexedDb(factory);
      try {
        const final = await new IndexedDbSleepObservationRepository(reopened).getByCycleDate(
          '2026-10-10',
        );
        expect(final).not.toHaveProperty('morningFeedback');
        expect(final?.wokeAt?.toISOString()).toBe('2026-10-10T22:00:00.000Z');
        expect(
          (await new IndexedDbSleepScheduleRepository(reopened).load())?.preparationTiming
            ?.stretchingMinutes,
        ).toBe(10);
      } finally {
        reopened.close();
      }
    } finally {
      phone.close();
      windows.close();
    }
  });
});

async function applyLatest(
  source: LifeOsIndexedDb,
  target: IndexedDbPilotSyncStore,
  entityType: 'sleep_observation' | 'sleep_schedule',
  serverRevision: number,
) {
  const connection = await source.open();
  const records = await request<SyncOutboxRecord[]>(
    connection
      .transaction(LIFE_OS_SYNC_STORE.outbox)
      .objectStore(LIFE_OS_SYNC_STORE.outbox)
      .getAll(),
  );
  const payload = records
    .map((record) => parsePilotSyncPayload(record.serializedPayload))
    .filter((item) => item.entityType === entityType)
    .sort((a, b) => a.revision - b.revision)
    .at(-1)!;
  await target.applyPulled('space', serverRevision, payload, 'feedback-timing-transport', {
    kind: 'fast_forward',
    winner: 'incoming',
  });
}
async function enableCapture(indexedDb: LifeOsIndexedDb) {
  const connection = await indexedDb.open();
  const tx = connection.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
  tx.objectStore(LIFE_OS_SYNC_STORE.settings).put({
    id: 'sync',
    enabled: false,
    deviceId: 'phone',
    deviceName: 'Synthetic phone',
    platform: 'android',
    publicKey: 'synthetic',
    createdAt: '2026-10-11T01:00:00.000Z',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: '2026-10-11T01:00:00.000Z',
    snapshotId: 'synthetic-snapshot',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '2026-10-11T01:00:00.000Z',
  } satisfies SyncSettingsRecord);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  let remaining = 100;
  indexedDb.configureSyncMutationCapture(
    new IndexedDbPilotMutationRecorder({
      createId: () => `event-${remaining--}`,
      now: () => new Date('2026-10-11T01:00:00Z'),
    }),
    LIFE_OS_SYNC_REGISTRY,
  );
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
