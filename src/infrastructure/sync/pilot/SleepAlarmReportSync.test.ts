import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import { SleepScheduleService } from '../../../application/sleep/SleepScheduleService';
import { isCurrentAndroidAlarmReport } from '../../../application/sleep/WakeAlarmConfirmation';
import {
  UnsupportedWakeAlarmGateway,
  unavailableWakeAlarmStatus,
  type WakeAlarmSchedule,
} from '../../../application/sleep/WakeAlarmGateway';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { IndexedDbSleepScheduleRepository } from '../../persistence/IndexedDbSleepScheduleRepository';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncOutboxRecord, SyncSettingsRecord } from '../../persistence/records';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';

describe('Android alarm report through production sleep_schedule sync', () => {
  it('captures the native report, applies it on Windows, reopens and keeps stale evidence historical', async () => {
    const phone = new LifeOsIndexedDb(new IDBFactory());
    const factory = new IDBFactory();
    const windows = new LifeOsIndexedDb(factory);
    const now = new Date('2026-10-10T12:00:00Z');
    const clock = new FakeClock(now);
    try {
      await enableCapture(phone);
      const service = new SleepScheduleService(
        new IndexedDbSleepScheduleRepository(phone),
        clock,
        new FakeIdGenerator('phone'),
        new ConfirmingGateway(),
      );
      await service.saveSettings({
        bedtime: '22:30',
        wakeTime: '07:15',
        timeZone: 'Asia/Chita',
        enabled: true,
      });
      const saved = (await service.syncAlarm()).state;
      const connection = await phone.open();
      const records = await request<SyncOutboxRecord[]>(
        connection
          .transaction(LIFE_OS_SYNC_STORE.outbox)
          .objectStore(LIFE_OS_SYNC_STORE.outbox)
          .getAll(),
      );
      const payload = records
        .map((record) => parsePilotSyncPayload(record.serializedPayload))
        .filter((item) => item.entityType === 'sleep_schedule')
        .sort((left, right) => left.revision - right.revision)
        .at(-1)!;
      expect(payload.record?.androidAlarmReport).toMatchObject({
        source: 'ANDROID',
        outcome: 'CONFIRMED',
        checkedAt: now.toISOString(),
      });
      await new IndexedDbPilotSyncStore(windows).applyPulled(
        'space',
        1,
        payload,
        'report-transport',
        { kind: 'fast_forward', winner: 'incoming' },
      );
      const windowsService = new SleepScheduleService(
        new IndexedDbSleepScheduleRepository(windows),
        clock,
        new FakeIdGenerator('windows'),
      );
      const received = (await windowsService.syncAlarm()).state;
      expect(received.androidAlarmReport).toEqual(saved.androidAlarmReport);
      expect(isCurrentAndroidAlarmReport(received, now)).toBe(true);
      await windowsService.setNearestWakeTime('09:00');
      const changed = await windowsService.getState();
      expect(changed.androidAlarmReport).toEqual(saved.androidAlarmReport);
      expect(isCurrentAndroidAlarmReport(changed, now)).toBe(false);
      windows.close();
      const reopened = new LifeOsIndexedDb(factory);
      try {
        expect(
          (await new IndexedDbSleepScheduleRepository(reopened).load())?.androidAlarmReport,
        ).toEqual(saved.androidAlarmReport);
      } finally {
        reopened.close();
      }
    } finally {
      phone.close();
      windows.close();
    }
  });
});

class ConfirmingGateway extends UnsupportedWakeAlarmGateway {
  private schedule: WakeAlarmSchedule | undefined;
  public override async reconcile(schedule?: WakeAlarmSchedule) {
    this.schedule = schedule;
    return this.status();
  }
  public override async status() {
    return {
      ...unavailableWakeAlarmStatus(),
      supported: true,
      state: this.schedule?.nextOccurrence ? ('SCHEDULED' as const) : ('READY' as const),
      exactAlarmGranted: true,
      notificationsGranted: true,
      fullScreenGranted: true,
      acknowledgedSettingsVersion: this.schedule?.settingsVersion ?? null,
      nextOccurrenceId: this.schedule?.nextOccurrence?.id ?? null,
      nextScheduledAt: this.schedule?.nextOccurrence?.scheduledAt ?? null,
    };
  }
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
    createdAt: '2026-10-10T00:00:00.000Z',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: '2026-10-10T00:00:00.000Z',
    snapshotId: 'synthetic-snapshot',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '2026-10-10T00:00:00.000Z',
  } satisfies SyncSettingsRecord);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  let remainingId = 100;
  indexedDb.configureSyncMutationCapture(
    new IndexedDbPilotMutationRecorder({
      // getAll orders by event ID, deliberately opposite to mutation revision here.
      createId: () => `event-${remainingId--}`,
      now: () => new Date('2026-10-10T12:00:00Z'),
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
