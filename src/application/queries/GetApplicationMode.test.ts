import { describe, expect, it } from 'vitest';
import {
  Day,
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
} from '../../domain';
import type { DayRepository } from '../ports/DayRepository';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import { APPLICATION_MODE, GetApplicationMode } from './GetApplicationMode';

const TODAY = DayDate.create('2026-08-06');
const PREVIOUS = DayDate.create('2026-08-05');
const STALE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-06T00:05:00.000+09:00');

describe('GetApplicationMode', () => {
  it('восстанавливает незавершённый SHUTDOWN как EVENING после запуска', async () => {
    const context = await createContext(plannedDay(TODAY));
    await context.cycles.createIfAbsent(cycle(PREVIOUS, EVENING_CYCLE_STATE.shutdown));
    await expect(context.query.execute()).resolves.toMatchObject({
      mode: APPLICATION_MODE.evening,
      cycleDate: PREVIOUS,
    });
  });

  it('восстанавливает незавершённый цикл старше суток после закрытия приложения', async () => {
    const context = await createContext(plannedDay(TODAY));
    await context.cycles.createIfAbsent(cycle(STALE, EVENING_CYCLE_STATE.shutdown));

    await expect(context.query.execute()).resolves.toMatchObject({
      mode: APPLICATION_MODE.evening,
      cycleDate: STALE,
    });
  });

  it('никогда не восстанавливает завершённый цикл как активный', async () => {
    const context = await createContext(plannedDay(TODAY));
    await context.cycles.createIfAbsent(cycle(PREVIOUS, EVENING_CYCLE_STATE.completed));
    await expect(context.query.execute()).resolves.toMatchObject({
      mode: APPLICATION_MODE.recovery,
      cycleDate: PREVIOUS,
    });
  });

  it('переходит в RECOVERY после завершения текущего дня', async () => {
    const day = openDay(TODAY);
    day.complete(NOW, id('completed-event'), 'Итог');
    const context = await createContext(day);
    await context.cycles.createIfAbsent(cycle(TODAY, EVENING_CYCLE_STATE.completed, day.id));
    expect((await context.query.execute()).mode).toBe(APPLICATION_MODE.recovery);
  });

  it('считает открытый новый день ACTIVE_DAY после завершённого прошлого цикла', async () => {
    const context = await createContext(openDay(TODAY));
    await context.cycles.createIfAbsent(cycle(PREVIOUS, EVENING_CYCLE_STATE.completed));
    expect((await context.query.execute()).mode).toBe(APPLICATION_MODE.activeDay);
  });
});

async function createContext(day: Day) {
  const days = new MemoryDayRepository();
  const cycles = new MemoryEveningCycleRepository();
  await days.save(day);
  return {
    cycles,
    query: new GetApplicationMode(days, cycles, { getCurrentDate: () => TODAY }),
  };
}

class MemoryDayRepository implements DayRepository {
  readonly #items = new Map<string, Day>();

  public async findByDate(date: DayDate): Promise<Day | null> {
    return this.#items.get(date.toString()) ?? null;
  }
  public async findOpen(): Promise<Day | null> {
    return [...this.#items.values()].find((day) => day.status === 'open') ?? null;
  }
  public async save(day: Day): Promise<void> {
    this.#items.set(day.date.toString(), day);
  }
  public async saveIfVersionMatches(day: Day, expectedVersion: number): Promise<boolean> {
    const stored = await this.findByDate(day.date);
    if (stored === null || stored.version !== expectedVersion) return false;
    await this.save(day);
    return true;
  }
}

class MemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #items = new Map<string, EveningCycle>();

  public async findById(cycleId: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.id.equals(cycleId)) ?? null;
  }
  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }
  public async findByDateKey(date: DayDate): Promise<EveningCycle | null> {
    return this.#items.get(date.toString()) ?? null;
  }
  public async findLatestUnfinishedOnOrBefore(dateKey: DayDate): Promise<EveningCycle | null> {
    return (
      [...this.#items.values()]
        .filter(
          (item) =>
            !item.dateKey.isAfter(dateKey) &&
            item.state !== EVENING_CYCLE_STATE.notStarted &&
            item.state !== EVENING_CYCLE_STATE.completed,
        )
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
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
}

function plannedDay(date: DayDate): Day {
  return Day.createCurrentPlanned({
    id: id(`day-${date.toString()}`),
    currentDate: date,
    occurredAt: NOW,
    createdEventId: id(`created-${date.toString()}`),
  });
}

function openDay(date: DayDate): Day {
  return Day.openCurrent({
    id: id(`day-${date.toString()}`),
    currentDate: date,
    occurredAt: NOW,
    createdEventId: id(`created-${date.toString()}`),
    openedEventId: id(`opened-${date.toString()}`),
  });
}

function cycle(
  date: DayDate,
  state: 'SHUTDOWN' | 'COMPLETED',
  dayId = id(`day-${date.toString()}`),
): EveningCycle {
  return EveningCycle.rehydrate({
    id: id(`cycle-${date.toString()}`),
    dayId,
    dateKey: date,
    state,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: new Date('2026-08-05T23:50:00.000+09:00'),
    updatedAt: NOW,
    completedAt: state === EVENING_CYCLE_STATE.completed ? NOW : null,
    version: 1,
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
