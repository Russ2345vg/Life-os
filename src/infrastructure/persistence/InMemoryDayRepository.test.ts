import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { InMemoryDayRepository } from './InMemoryDayRepository';

const DATE = DayDate.create('2026-08-01');
const NOW = new Date('2026-08-01T08:00:00.000+09:00');

describe('InMemoryDayRepository', () => {
  it('сохраняет день и находит его по календарной дате', async () => {
    const repository = new InMemoryDayRepository();
    const day = createDay('day-1');

    await repository.save(day);

    await expect(repository.findByDate(DATE)).resolves.toBe(day);
    await expect(repository.findByDate(DayDate.create('2026-08-02'))).resolves.toBeNull();
  });

  it('повторное сохранение обновляет существующую запись', async () => {
    const repository = new InMemoryDayRepository();
    const day = createDay('day-1');
    await repository.save(day);
    day.recordFirstActivity(NOW, EntityId.create('activity-event'));

    await repository.save(day);

    const storedDay = await repository.findByDate(DATE);
    expect(storedDay?.firstActivityAt).toEqual(NOW);
  });

  it('находит единственный открытый день и обнаруживает несколько открытых дней', async () => {
    const repository = new InMemoryDayRepository();
    const first = createDay('open-1', DATE);
    await repository.save(first);

    await expect(repository.findOpen()).resolves.toBe(first);

    await repository.save(createDay('open-2', DayDate.create('2026-08-02')));
    await expect(repository.findOpen()).rejects.toMatchObject({
      code: 'day.multiple_open_detected',
    });
  });

  it('не допускает другой день на ту же календарную дату', async () => {
    const repository = new InMemoryDayRepository();
    await repository.save(createDay('day-1'));

    await expect(repository.save(createDay('day-2'))).rejects.toMatchObject({
      code: 'day_repository.duplicate_date',
    });
    await expect(repository.save(createDay('day-3'))).rejects.toBeInstanceOf(DomainError);
  });
});

function createDay(id: string, date: DayDate = DATE): Day {
  return Day.openCurrent({
    id: EntityId.create(id),
    currentDate: date,
    occurredAt: NOW,
    createdEventId: EntityId.create(`${id}-created-event`),
    openedEventId: EntityId.create(`${id}-opened-event`),
  });
}
