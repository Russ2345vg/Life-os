import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId, type MorningCycle } from '../../domain';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import { MorningCycleApplicationService } from './MorningCycleApplicationService';

const TODAY = DayDate.create('2026-08-23');
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
});

class FakeMorningCycleRepository implements MorningCycleRepository {
  readonly #byDate = new Map<string, MorningCycle>();

  public async findByDayId(dayId: EntityId): Promise<MorningCycle | null> {
    return [...this.#byDate.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<MorningCycle | null> {
    return this.#byDate.get(dateKey.toString()) ?? null;
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
