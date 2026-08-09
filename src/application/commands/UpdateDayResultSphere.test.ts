import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId } from '../../domain';
import { InMemoryDayRepository } from '../../infrastructure';
import { UpdateDayResultSphere } from './UpdateDayResultSphere';

const DATE = DayDate.create('2026-08-08');

describe('UpdateDayResultSphere', () => {
  it('changes and removes the completed day result sphere', async () => {
    const day = completedDay();
    const repository = new InMemoryDayRepository();
    await repository.save(day);
    const command = new UpdateDayResultSphere(repository);

    const changed = await command.execute({
      dayId: day.id,
      date: day.date,
      expectedVersion: day.version,
      sphereId: EntityId.create('sphere-growth'),
    });
    expect(changed.ok && changed.value.sphereId?.toString()).toBe('sphere-growth');

    if (!changed.ok) throw changed.error;
    const removed = await command.execute({
      dayId: day.id,
      date: day.date,
      expectedVersion: changed.value.version,
      sphereId: null,
    });
    expect(removed.ok && removed.value.sphereId).toBeNull();
  });

  it('rejects a stale version and leaves the result unchanged', async () => {
    const day = completedDay();
    const repository = new InMemoryDayRepository();
    await repository.save(day);

    const result = await new UpdateDayResultSphere(repository).execute({
      dayId: day.id,
      date: day.date,
      expectedVersion: day.version + 1,
      sphereId: EntityId.create('sphere-growth'),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'day.version_conflict' } });
    expect((await repository.findByDate(DATE))?.sphereId?.toString()).toBe('sphere-work');
  });
});

function completedDay(): Day {
  const day = Day.openCurrent({
    id: EntityId.create('completed-day'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-08T07:00:00.000Z'),
    createdEventId: EntityId.create('day-created'),
    openedEventId: EntityId.create('day-opened'),
  });
  day.complete(
    new Date('2026-08-08T18:00:00.000Z'),
    EntityId.create('day-completed'),
    'Итог дня',
    EntityId.create('sphere-work'),
  );
  return day;
}
