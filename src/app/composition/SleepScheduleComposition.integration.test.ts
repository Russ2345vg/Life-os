import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

describe('sleep schedule application composition', () => {
  it('persists the current preparation list and cycle across application reopen', async () => {
    const factory = new IDBFactory();
    const date = DayDate.create('2026-09-20');
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(date),
      idGenerator: new FakeIdGenerator('sleep-composition'),
    });
    await first.sleepSchedule.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await first.sleepSchedule.openCurrentNight();
    await first.sleepSchedule.addCustomItem('personal', 'Подготовить сумку');
    await first.sleepSchedule.completeItem('base-room-air');
    first.close();

    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(date),
      idGenerator: new FakeIdGenerator('sleep-reopened'),
    });
    const state = await reopened.sleepSchedule.openCurrentNight();

    expect(state.preparationItems.some(({ title }) => title === 'Подготовить сумку')).toBe(true);
    expect(state.nightCycles).toHaveLength(1);
    expect(state.nightCycles[0]?.preparationItems[0]?.status).toBe('DONE');
    reopened.close();
  });
});
