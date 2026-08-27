import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId, MORNING_CYCLE_STATE, MorningCycle } from '../../domain';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import { MorningCycleApplicationService } from './MorningCycleApplicationService';

const TODAY = DayDate.create('2026-08-23');
const YESTERDAY = DayDate.create('2026-08-22');
const TOMORROW = DayDate.create('2026-08-24');
const NOW = new Date('2026-08-23T07:12:00.000+09:00');

describe('MorningCycleApplicationService', () => {
  it('создаёт и запускает единственный цикл текущего дня идемпотентно', async () => {
    const context = await createContext();

    const first = await context.service.start(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.start(TODAY);

    expect(second.id.equals(first.id)).toBe(true);
    expect(second.startedAt).toEqual(NOW);
    expect(context.repository.all()).toHaveLength(1);
  });

  it('сохраняет один факт воды при повторном нажатии', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const first = await context.service.completeWater(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.completeWater(TODAY);

    expect(second.waterCompletedAt).toEqual(first.waterCompletedAt);
    expect(second.waterAmountMl).toBe(250);
    expect(context.repository.all()).toHaveLength(1);
  });

  it('не изменяет прошлую или будущую дату', async () => {
    const context = await createContext();

    await expect(context.service.start(TOMORROW)).rejects.toMatchObject({
      code: 'morning_cycle.current_date_required',
    });
    expect(context.repository.all()).toHaveLength(0);
  });

  it('требует существующий день и запущенное утро для воды', async () => {
    const withoutDay = await createContext(false);
    await expect(withoutDay.service.start(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.day_not_found',
    });

    const context = await createContext();
    await expect(context.service.completeWater(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.not_found',
    });
  });

  it('отделяет сегодняшний активный запуск от незавершённого вчерашнего', async () => {
    const context = await createContext();
    const yesterday = morningCycle('yesterday-cycle', 'yesterday-day', YESTERDAY);
    yesterday.start(new Date('2026-08-22T07:00:00.000+09:00'));
    await context.repository.createIfAbsent(yesterday);
    const today = await context.service.start(TODAY);

    const current = await context.service.getCurrentContext();

    expect(current.current?.id.equals(today.id)).toBe(true);
    expect(current.previousUnfinished?.id.equals(yesterday.id)).toBe(true);
    expect(current.current?.dateKey.equals(TODAY)).toBe(true);
    expect(current.previousUnfinished?.dateKey.equals(YESTERDAY)).toBe(true);
  });

  it('идемпотентно закрывает вчерашний запуск, не создавая новый', async () => {
    const context = await createContext();
    const yesterday = morningCycle('yesterday-cycle', 'yesterday-day', YESTERDAY);
    yesterday.start(new Date('2026-08-22T07:00:00.000+09:00'));
    await context.repository.createIfAbsent(yesterday);

    const first = await context.service.abandonUnfinished(YESTERDAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.abandonUnfinished(YESTERDAY);

    expect(second.id.equals(first.id)).toBe(true);
    expect(second.state).toBe(MORNING_CYCLE_STATE.abandoned);
    expect(second.finishedAt).toEqual(first.finishedAt);
    expect(second.isActive()).toBe(false);
    expect(context.repository.all()).toHaveLength(1);
    expect((await context.service.getCurrentContext()).previousUnfinished).toBeNull();
  });

  it('идемпотентно завершает сегодняшний запуск и исключает его из active context', async () => {
    const context = await createContext();
    await context.service.start(TODAY);
    await context.service.markReadyToWork(TODAY);

    const first = await context.service.finish(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.finish(TODAY);

    expect(second.state).toBe(MORNING_CYCLE_STATE.finished);
    expect(second.finishedAt).toEqual(first.finishedAt);
    expect(second.isActive()).toBe(false);
    expect((await context.service.getCurrentContext()).current).toBeNull();
  });

  it('не позволяет специальной команде закрывать сегодняшний или будущий запуск', async () => {
    const context = await createContext();

    await expect(context.service.abandonUnfinished(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.previous_date_required',
    });
    await expect(context.service.abandonUnfinished(TOMORROW)).rejects.toMatchObject({
      code: 'morning_cycle.previous_date_required',
    });
  });
});

class FakeMorningCycleRepository implements MorningCycleRepository {
  readonly #byDate = new Map<string, MorningCycle>();

  public async findByDayId(dayId: EntityId): Promise<MorningCycle | null> {
    return [...this.#byDate.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<MorningCycle | null> {
    return this.#byDate.get(dateKey.toString()) ?? null;
  }

  public async findLatestUnfinishedBefore(dateKey: DayDate): Promise<MorningCycle | null> {
    return (
      [...this.#byDate.values()]
        .filter((cycle) => cycle.dateKey.isBefore(dateKey) && cycle.isActive())
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async createIfAbsent(cycle: MorningCycle): Promise<MorningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#byDate.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: MorningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = await this.findByDateKey(cycle.dateKey);
    if (
      stored === null ||
      !stored.id.equals(cycle.id) ||
      !stored.dayId.equals(cycle.dayId) ||
      stored.version !== expectedVersion
    ) {
      return false;
    }
    this.#byDate.set(cycle.dateKey.toString(), cycle);
    return true;
  }

  public all(): readonly MorningCycle[] {
    return [...this.#byDate.values()];
  }
}

function morningCycle(id: string, dayId: string, date: DayDate): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create(id),
    dayId: EntityId.create(dayId),
    dateKey: date,
    occurredAt: new Date(`${date.toString()}T06:50:00.000+09:00`),
  });
}

async function createContext(seedDay = true) {
  const dayRepository = new FakeDayRepository();
  if (seedDay) {
    dayRepository.seed(
      Day.createCurrentPlanned({
        id: EntityId.create('today'),
        currentDate: TODAY,
        occurredAt: new Date('2026-08-23T00:01:00.000+09:00'),
        createdEventId: EntityId.create('day-created'),
      }),
    );
  }
  const repository = new FakeMorningCycleRepository();
  const clock = new FakeClock(NOW);
  return {
    repository,
    clock,
    service: new MorningCycleApplicationService(
      repository,
      dayRepository,
      new FakeCurrentDateProvider(TODAY),
      clock,
      new FakeIdGenerator('morning'),
    ),
  };
}
