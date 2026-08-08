import { describe, expect, it } from 'vitest';
import { Day, DayDate, DAY_STATUS, EntityId } from '../../domain';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import { EnsureCurrentDay } from './EnsureCurrentDay';

const TODAY = DayDate.create('2026-08-01');
const YESTERDAY = DayDate.create('2026-07-31');
const NOW = new Date('2026-08-01T08:00:00.000+09:00');

describe('EnsureCurrentDay', () => {
  it('создаёт и сохраняет текущий запланированный день, если день отсутствует', async () => {
    const context = createContext();

    const day = await context.command.execute();

    expect(day.date.equals(TODAY)).toBe(true);
    expect(day.status).toBe(DAY_STATUS.planned);
    expect(day.createdAt).toEqual(NOW);
    expect(day.plannedAt).toEqual(NOW);
    expect(day.openedAt).toBeNull();
    expect(context.repository.size).toBe(1);
    expect(context.repository.saveCount).toBe(1);
    expect(context.idGenerator.generatedCount).toBe(2);
    expect(day.getUncommittedEvents().map((event) => event.eventType)).toEqual(['day.created']);
  });

  it('возвращает существующий запланированный день без автоматического открытия', async () => {
    const context = createContext();
    const plannedDay = Day.plan({
      id: EntityId.create('planned-day'),
      date: TODAY,
      currentDate: YESTERDAY,
      occurredAt: new Date('2026-07-31T20:00:00.000+09:00'),
      createdEventId: EntityId.create('planned-created-event'),
    });
    plannedDay.clearUncommittedEvents();
    context.repository.seed(plannedDay);

    const result = await context.command.execute();

    expect(result).toBe(plannedDay);
    expect(result.status).toBe(DAY_STATUS.planned);
    expect(result.openedAt).toBeNull();
    expect(result.getUncommittedEvents()).toHaveLength(0);
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('возвращает уже открытый день без изменений', async () => {
    const context = createContext();
    const openDay = createOpenDay();
    const openedAt = openDay.openedAt;
    openDay.clearUncommittedEvents();
    context.repository.seed(openDay);

    const result = await context.command.execute();

    expect(result).toBe(openDay);
    expect(result.openedAt).toEqual(openedAt);
    expect(result.getUncommittedEvents()).toHaveLength(0);
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('возвращает завершённый день без повторного открытия', async () => {
    const context = createContext();
    const completedDay = createOpenDay();
    completedDay.complete(NOW, EntityId.create('completed-event'));
    completedDay.clearUncommittedEvents();
    context.repository.seed(completedDay);

    const result = await context.command.execute();

    expect(result).toBe(completedDay);
    expect(result.status).toBe(DAY_STATUS.completed);
    expect(result.getUncommittedEvents()).toHaveLength(0);
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('два последовательных вызова возвращают одну сущность и одну запись', async () => {
    const context = createContext();

    const firstResult = await context.command.execute();
    const secondResult = await context.command.execute();

    expect(secondResult).toBe(firstResult);
    expect(secondResult.id.equals(firstResult.id)).toBe(true);
    expect(context.repository.size).toBe(1);
    expect(context.repository.saveCount).toBe(1);
    expect(context.idGenerator.generatedCount).toBe(2);
    expect(secondResult.getUncommittedEvents()).toHaveLength(1);
  });
});

function createContext(): {
  command: EnsureCurrentDay;
  repository: FakeDayRepository;
  idGenerator: FakeIdGenerator;
} {
  const repository = new FakeDayRepository();
  const idGenerator = new FakeIdGenerator('ensure');
  const command = new EnsureCurrentDay(
    repository,
    new FakeCurrentDateProvider(TODAY),
    new FakeClock(NOW),
    idGenerator,
  );

  return { command, repository, idGenerator };
}

function createOpenDay(): Day {
  return Day.openCurrent({
    id: EntityId.create('existing-day'),
    currentDate: TODAY,
    occurredAt: NOW,
    createdEventId: EntityId.create('existing-created-event'),
    openedEventId: EntityId.create('existing-opened-event'),
  });
}
