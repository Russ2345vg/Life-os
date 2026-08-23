import { describe, expect, it } from 'vitest';
import {
  DAY_STATUS,
  Day,
  DayDate,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_STATE,
  EVENING_CYCLE_MODE,
  EVENING_MODE_REASON,
} from '../../domain';
import type { DayRepository, EveningCycleRepository } from '../ports';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { EveningCycleApplicationService } from './EveningCycleApplicationService';

const DATE = DayDate.create('2026-08-14');
const BEFORE_MIDNIGHT = new Date('2026-08-14T23:55:00.000+09:00');
const AFTER_MIDNIGHT = new Date('2026-08-15T00:08:00.000+09:00');

describe('EveningCycleApplicationService', () => {
  it('создаёт один цикл и возвращает один cycleId всем повторным входам', async () => {
    const context = await createContext();

    const first = await context.service.start(DATE);
    const second = await context.service.start(DATE);
    const third = await new EveningCycleApplicationService(
      context.cycles,
      context.days,
      context.clock,
      new FakeIdGenerator('second-ui'),
    ).start(DATE);

    expect(first.id.equals(second.id)).toBe(true);
    expect(second.id.equals(third.id)).toBe(true);
    expect(first.state).toBe(EVENING_CYCLE_STATE.windingDown);
    expect(context.cycles.size).toBe(1);
  });

  it('безопасно создаёт и открывает отсутствующий Day через application service', async () => {
    const days = new MemoryDayRepository();
    const cycles = new MemoryEveningCycleRepository();
    const service = new EveningCycleApplicationService(
      cycles,
      days,
      new FakeClock(BEFORE_MIDNIGHT),
      new FakeIdGenerator('empty-day'),
    );

    const cycle = await service.start(DATE);

    expect((await days.findByDate(DATE))?.status).toBe(DAY_STATUS.open);
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.windingDown);
    expect(cycles.size).toBe(1);
  });

  it('возобновляет сохранённое состояние после пересоздания application service', async () => {
    const context = await createContext();
    await context.service.start(DATE);
    await context.service.beginResolving(DATE);
    const reflecting = await context.service.completeResolving(DATE);

    const restored = new EveningCycleApplicationService(
      context.cycles,
      context.days,
      context.clock,
      new FakeIdGenerator('restored'),
    );
    const cycle = await restored.start(DATE);

    expect(reflecting.state).toBe(EVENING_CYCLE_STATE.reflecting);
    expect(cycle.id.equals(reflecting.id)).toBe(true);
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.reflecting);
  });

  it('не меняет dateKey при пересечении полуночи', async () => {
    const context = await createContext();
    await context.service.start(DATE);
    context.clock.setTime(AFTER_MIDNIGHT);
    const cycle = await context.service.beginResolving(DATE);

    expect(cycle.dateKey.equals(DATE)).toBe(true);
    expect(cycle.updatedAt).toEqual(AFTER_MIDNIGHT);
  });

  it('восстанавливает завершённый старый день только как COMPLETED', async () => {
    const days = new MemoryDayRepository();
    const completedDay = createOpenDay();
    completedDay.complete(AFTER_MIDNIGHT, id('day-completed'), 'Итог');
    await days.save(completedDay);
    const service = new EveningCycleApplicationService(
      new MemoryEveningCycleRepository(),
      days,
      new FakeClock(AFTER_MIDNIGHT),
      new FakeIdGenerator('completed-recovery'),
    );

    const recovered = await service.start(DATE);

    expect(completedDay.status).toBe(DAY_STATUS.completed);
    expect(recovered.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(recovered.completedAt).toEqual(AFTER_MIDNIGHT);
    expect((await service.start(DATE)).id.equals(recovered.id)).toBe(true);
  });
  it.each([EVENING_CYCLE_MODE.quick, EVENING_CYCLE_MODE.emergency] as const)(
    'запускает новый цикл сразу в режиме %s',
    async (mode) => {
      const context = await createContext();
      const cycle = await context.service.start(DATE, mode, EVENING_MODE_REASON.userSelected);
      expect(cycle.mode).toBe(mode);
      expect(cycle.state).toBe(EVENING_CYCLE_STATE.windingDown);
    },
  );

  it('поддерживает разрешённые переключения без перезапуска', async () => {
    const context = await createContext();
    const started = await context.service.start(DATE);
    await context.service.beginResolving(DATE);
    const quick = await context.service.selectMode(DATE, EVENING_CYCLE_MODE.quick);
    const normal = await context.service.selectMode(DATE, EVENING_CYCLE_MODE.normal);
    const emergency = await context.service.selectMode(DATE, EVENING_CYCLE_MODE.emergency);

    expect(quick.id.equals(started.id)).toBe(true);
    expect(quick.state).toBe(EVENING_CYCLE_STATE.resolving);
    expect(normal.state).toBe(EVENING_CYCLE_STATE.resolving);
    expect(emergency.mode).toBe(EVENING_CYCLE_MODE.emergency);
  });

  it('оба UI-сервиса видят один сохранённый QUICK после recovery', async () => {
    const context = await createContext();
    await context.service.start(DATE);
    await context.service.selectMode(DATE, EVENING_CYCLE_MODE.quick);
    const secondUi = new EveningCycleApplicationService(
      context.cycles,
      context.days,
      context.clock,
      new FakeIdGenerator('second-ui'),
    );

    expect((await secondUi.get(DATE))?.mode).toBe(EVENING_CYCLE_MODE.quick);
    expect((await secondUi.start(DATE)).mode).toBe(EVENING_CYCLE_MODE.quick);
  });
});

async function createContext() {
  const days = new MemoryDayRepository();
  const cycles = new MemoryEveningCycleRepository();
  const clock = new FakeClock(BEFORE_MIDNIGHT);
  await days.save(createOpenDay());
  return {
    days,
    cycles,
    clock,
    service: new EveningCycleApplicationService(
      cycles,
      days,
      clock,
      new FakeIdGenerator('evening-cycle'),
    ),
  };
}

function createOpenDay(): Day {
  return Day.openCurrent({
    id: id('day'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-14T08:00:00.000+09:00'),
    createdEventId: id('day-created'),
    openedEventId: id('day-opened'),
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

class MemoryDayRepository implements DayRepository {
  readonly #items = new Map<string, Day>();

  public async findByDate(date: DayDate): Promise<Day | null> {
    return this.#items.get(date.toString()) ?? null;
  }

  public async findOpen(): Promise<Day | null> {
    return [...this.#items.values()].find((day) => day.status === DAY_STATUS.open) ?? null;
  }

  public async save(day: Day): Promise<void> {
    this.#items.set(day.date.toString(), day);
  }

  public async saveIfVersionMatches(day: Day, expectedVersion: number): Promise<boolean> {
    const stored = this.#items.get(day.date.toString());
    if (stored === undefined || stored.version !== expectedVersion) return false;
    this.#items.set(day.date.toString(), day);
    return true;
  }
}

class MemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #items = new Map<string, EveningCycle>();

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.id.equals(id)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#items.get(dateKey.toString()) ?? null;
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#items.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = await this.findByDateKey(cycle.dateKey);
    if (stored === null || stored.version !== expectedVersion) return false;
    this.#items.set(cycle.dateKey.toString(), cycle);
    return true;
  }

  public get size(): number {
    return this.#items.size;
  }
}
