import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { IndexedDbSleepScheduleRepository } from './IndexedDbSleepScheduleRepository';
import { LifeOsIndexedDb, LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { createEmptySleepSchedule } from '../../domain/sleep/SleepSchedule';
import { ColdShowerService } from '../../application/sleep/ColdShowerService';

describe('ColdShowerService and persistence', () => {
  it('works without alarm settings, uses the application day and survives reopening', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbSleepScheduleRepository(database);
      const clock = new FakeClock(new Date('2026-09-27T23:30:00Z'));
      const dates = new FakeCurrentDateProvider(DayDate.create('2026-09-28'));
      const service = new ColdShowerService(repository, clock, dates);
      await service.record({ date: '2026-09-28', status: 'completed' });
      await service.record({ date: '2026-09-27', status: 'skipped', skipReason: 'forgot' });
      const reopened = new ColdShowerService(
        new IndexedDbSleepScheduleRepository(database),
        clock,
        dates,
      );
      expect(await reopened.getEntries()).toHaveLength(2);
      expect((await repository.load())?.settings).toBeNull();
      await expect(service.record({ date: '2026-09-29', status: 'completed' })).rejects.toThrow();
      expect(await reopened.getEntries()).toHaveLength(2);
      await reopened.remove('2026-09-27');
      expect(await reopened.getEntries()).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('preserves concurrent sleep edits and makes identical writes idempotent', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbSleepScheduleRepository(database);
      const clock = new FakeClock(new Date('2026-09-28T00:00:00Z'));
      const dates = new FakeCurrentDateProvider(DayDate.create('2026-09-28'));
      const service = new ColdShowerService(repository, clock, dates);
      await Promise.all([
        service.record({ date: '2026-09-28', status: 'completed', energy: 5 }),
        repository.update((current) => ({
          ...(current ?? createEmptySleepSchedule()),
          version: (current?.version ?? 0) + 1,
          sleepEvents: [
            { id: 'event', cycleDate: '2026-09-27', kind: 'BEDTIME', occurredAt: clock.now() },
          ],
        })),
      ]);
      const before = await repository.load();
      clock.setTime(new Date('2026-09-28T01:00:00Z'));
      await service.record({ date: '2026-09-28', status: 'completed' });
      expect(await repository.load()).toEqual(before);
      expect(before?.sleepEvents).toHaveLength(1);
      expect(before?.coldShowerEntries?.[0]?.energy).toBe(5);
    } finally {
      database.close();
    }
  });

  it('reads legacy records and rejects malformed or duplicate persisted entries', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbSleepScheduleRepository(database);
      await repository.save(createEmptySleepSchedule());
      const clock = new FakeClock(new Date('2026-09-28T00:00:00Z'));
      const dates = new FakeCurrentDateProvider(DayDate.create('2026-09-28'));
      const service = new ColdShowerService(repository, clock, dates);
      expect(await service.getEntries()).toEqual([]);
      await service.record({
        date: '2026-09-28',
        status: 'completed',
        energy: 4,
        feeling: 'better',
      });
      expect((await service.getEntries())[0]).toMatchObject({
        energy: 4,
        feeling: 'better',
        recordedAt: clock.now(),
      });
      const opened = await database.open();
      const read = opened
        .transaction(LIFE_OS_STORE.sleepSchedules)
        .objectStore(LIFE_OS_STORE.sleepSchedules)
        .get('sleep-schedule');
      const record = await new Promise<Record<string, unknown>>((resolve) => {
        read.onsuccess = () => resolve(read.result as Record<string, unknown>);
      });
      const entries = record.coldShowerEntries as readonly Record<string, unknown>[];
      for (const broken of [null, [{ ...entries[0], energy: 6 }], [entries[0], entries[0]]]) {
        const transaction = opened.transaction(LIFE_OS_STORE.sleepSchedules, 'readwrite');
        transaction
          .objectStore(LIFE_OS_STORE.sleepSchedules)
          .put({ ...record, coldShowerEntries: broken });
        await new Promise<void>((resolve) => {
          transaction.oncomplete = () => resolve();
        });
        await expect(repository.load()).rejects.toThrow();
      }
    } finally {
      database.close();
    }
  });
});
