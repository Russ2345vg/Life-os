import { describe, expect, it } from 'vitest';
import { DayDate, Direction, EntityId } from '../../../domain';
import { EnsureCurrentDay } from '../../../application/commands/EnsureCurrentDay';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../../test/helpers/Fakes';
import { InMemoryDirectionRepository } from '../InMemoryDirectionRepository';
import { DayRecordMapper } from '../mappers/DayRecordMapper';
import { DailyDirection } from '../../../application/planner/DailyDirection';

const today = DayDate.create('2026-09-14');
const tomorrow = DayDate.create('2026-09-15');
const now = new Date('2026-09-14T08:00:00Z');

describe('daily main direction', () => {
  it('keeps independent selections for today and tomorrow across old-record mapping', async () => {
    const days = new FakeDayRepository();
    const directions = new InMemoryDirectionRepository([
      Direction.create({ id: EntityId.create('health'), name: 'Тело', now }),
      Direction.create({ id: EntityId.create('work'), name: 'Работа', now }),
    ]);
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
  });

  it('rejects an unavailable direction and does not create a day', async () => {
    const days = new FakeDayRepository();
    const ensure = new EnsureCurrentDay(
      days,
      new FakeCurrentDateProvider(today),
      new FakeClock(now),
      new FakeIdGenerator(),
    );
    const daily = new DailyDirection(days, new InMemoryDirectionRepository(), ensure);
    await expect(daily.set(today, EntityId.create('missing'))).rejects.toMatchObject({
      code: 'day.direction_unavailable',
    });
    expect(await daily.get(today)).toBeNull();
  });
});
