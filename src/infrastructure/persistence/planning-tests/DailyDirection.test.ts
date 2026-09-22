import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DayDate, Direction, EntityId } from '../../../domain';
import { EnsureCurrentDay } from '../../../application/commands/EnsureCurrentDay';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../../test/helpers/Fakes';
import { IndexedDbDirectionRepository } from '../IndexedDbDirectionRepository';
import { LifeOsIndexedDb } from '../indexed-db/LifeOsIndexedDb';
import { DayRecordMapper } from '../mappers/DayRecordMapper';
import { DailyDirection } from '../../../application/planner/DailyDirection';

const today = DayDate.create('2026-09-14');
const tomorrow = DayDate.create('2026-09-15');
const now = new Date('2026-09-14T08:00:00Z');

describe('daily main direction', () => {
  it('keeps independent selections for today and tomorrow across old-record mapping', async () => {
    const days = new FakeDayRepository();
    const database = new LifeOsIndexedDb(new IDBFactory());
    const directions = new IndexedDbDirectionRepository(database);
    await directions.create(Direction.create({ id: EntityId.create('health'), name: 'Тело', now }));
    await directions.create(Direction.create({ id: EntityId.create('work'), name: 'Работа', now }));
    const ensure = new EnsureCurrentDay(
      days,
      new FakeCurrentDateProvider(today),
      new FakeClock(now),
      new FakeIdGenerator(),
    );
    const daily = new DailyDirection(days, directions, ensure);
    expect(await daily.get(today)).toBeNull();
    await daily.set(today, EntityId.create('health'));
    await daily.set(tomorrow, EntityId.create('work'));
    expect((await daily.get(today))?.mainDirectionId?.toString()).toBe('health');
    expect((await daily.get(tomorrow))?.mainDirectionId?.toString()).toBe('work');
    const old = DayRecordMapper.toRecord((await daily.get(today))!);
    const legacy = { ...old };
    delete legacy.mainDirectionId;
    expect(DayRecordMapper.fromRecord(legacy).mainDirectionId).toBeNull();
    expect(DayRecordMapper.fromRecord(old).mainDirectionId?.toString()).toBe('health');
    database.close();
  });

  it('rejects an unavailable direction and does not create a day', async () => {
    const days = new FakeDayRepository();
    const ensure = new EnsureCurrentDay(
      days,
      new FakeCurrentDateProvider(today),
      new FakeClock(now),
      new FakeIdGenerator(),
    );
    const database = new LifeOsIndexedDb(new IDBFactory());
    const daily = new DailyDirection(days, new IndexedDbDirectionRepository(database), ensure);
    await expect(daily.set(today, EntityId.create('missing'))).rejects.toMatchObject({
      code: 'day.direction_unavailable',
    });
    expect(await daily.get(today)).toBeNull();
    database.close();
  });
});
