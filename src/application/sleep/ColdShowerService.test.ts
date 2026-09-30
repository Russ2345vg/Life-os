import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import {
  createEmptySleepSchedule,
  type SleepScheduleState,
} from '../../domain/sleep/SleepSchedule';
import type { SleepScheduleRepository, SleepScheduleUpdate } from './SleepScheduleRepository';
import { ColdShowerService } from './ColdShowerService';

class JournalRepository implements SleepScheduleRepository {
  public state: SleepScheduleState | null = null;
  public async load() {
    return this.state;
  }
  public async save(state: SleepScheduleState) {
    this.state = state;
  }
  public async update(transform: SleepScheduleUpdate) {
    const next = transform(this.state);
    this.state = next;
    return next;
  }
}

describe('ColdShowerService', () => {
  it('uses the application calendar date even when the clock is on the previous UTC day', async () => {
    const repository = new JournalRepository();
    const service = new ColdShowerService(
      repository,
      new FakeClock(new Date('2026-09-27T23:30:00Z')),
      new FakeCurrentDateProvider(DayDate.create('2026-09-28')),
    );
    await service.record({ date: '2026-09-28', status: 'completed' });
    expect((await service.getEntries())[0]?.date).toBe('2026-09-28');
    expect(repository.state?.settings).toBeNull();
    await expect(service.record({ date: '2026-09-29', status: 'completed' })).rejects.toThrow();
    expect(await service.getEntries()).toHaveLength(1);
  });

  it('preserves other sleep fields when a historical day is corrected or removed', async () => {
    const repository = new JournalRepository();
    const event = {
      id: 'bedtime',
      cycleDate: '2026-09-27',
      kind: 'BEDTIME' as const,
      occurredAt: new Date('2026-09-27T12:00:00Z'),
    };
    repository.state = { ...createEmptySleepSchedule(), sleepEvents: [event] };
    const service = new ColdShowerService(
      repository,
      new FakeClock(new Date('2026-09-28T00:00:00Z')),
      new FakeCurrentDateProvider(DayDate.create('2026-09-28')),
    );
    await service.record({ date: '2026-09-27', status: 'skipped' });
    await service.record({ date: '2026-09-27', status: 'completed', energy: 4 });
    expect(await service.getEntries()).toHaveLength(1);
    await service.remove('2026-09-27');
    expect(await service.getEntries()).toEqual([]);
    expect(repository.state?.sleepEvents).toEqual([event]);
  });
});
