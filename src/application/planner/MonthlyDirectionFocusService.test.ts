import { describe, expect, it } from 'vitest';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { MonthlyDirectionFocusRepository } from '../ports/MonthlyDirectionFocusRepository';
import { Day, DayDate, Direction, EntityId } from '../../domain';
import type { MonthlyDirectionFocus } from '../../domain/planner/MonthlyDirectionFocus';
import { FakeClock, FakeDayRepository } from '../../test/helpers/Fakes';
import { MonthlyDirectionFocusService } from './MonthlyDirectionFocusService';

const september = DayDate.create('2026-09-29');
const october = DayDate.create('2026-10-01');
const now = new Date('2026-09-29T08:00:00.000Z');

describe('MonthlyDirectionFocusService', () => {
  it('returns the persisted focus for the whole calendar month', async () => {
    const repository = new FakeMonthlyDirectionFocusRepository();
    const directions = new FakeDirectionRepository(activeDirection('work'));
    const service = createService(repository, directions);

    await service.set(september, EntityId.create('work'));

    const state = await service.get(DayDate.create('2026-09-01'));
    expect(state.month).toBe('2026-09');
    expect(state.current?.directionId).toBe('work');
    expect(state.suggestion).toBeNull();
  });

  it('offers the latest active direction from an earlier month without activating it', async () => {
    const repository = new FakeMonthlyDirectionFocusRepository();
    const directions = new FakeDirectionRepository(activeDirection('work'));
    const service = createService(repository, directions);
    await service.set(september, EntityId.create('work'));

    const state = await service.get(october);

    expect(state.current).toBeNull();
    expect(state.suggestion).toEqual({ directionId: 'work', source: 'previous_month' });
  });

  it('stores an explicit empty choice and suppresses the previous-month suggestion', async () => {
    const repository = new FakeMonthlyDirectionFocusRepository();
    const directions = new FakeDirectionRepository(activeDirection('work'));
    const service = createService(repository, directions);
    await service.set(september, EntityId.create('work'));

    await service.set(october, null);
    const state = await service.get(october);

    expect(state.current?.directionId).toBeNull();
    expect(state.suggestion).toBeNull();
  });

  it('rejects an archived direction for a new monthly choice or suggestion', async () => {
    const repository = new FakeMonthlyDirectionFocusRepository();
    const archived = activeDirection('work').archive(new Date('2026-09-30T00:00:00.000Z'));
    const directions = new FakeDirectionRepository(archived);
    repository.seed(focus('2026-09', 'work'));
    const service = createService(repository, directions);

    await expect(service.set(october, EntityId.create('work'))).rejects.toMatchObject({
      code: 'monthly_direction_focus.direction_unavailable',
    });
    expect((await service.get(october)).suggestion).toBeNull();
  });

  it('uses the legacy direction of the current day only when no monthly history exists', async () => {
    const repository = new FakeMonthlyDirectionFocusRepository();
    const directions = new FakeDirectionRepository(activeDirection('health'));
    const days = new FakeDayRepository();
    days.seed(
      Day.rehydrate({
        id: EntityId.create('legacy-day'),
        date: september,
        status: 'open',
        createdAt: now,
        plannedAt: null,
        openedAt: now,
        firstActivityAt: null,
        completedAt: null,
        summary: null,
        sphereId: null,
        mainDirectionId: EntityId.create('health'),
        version: 1,
      }),
    );
    const service = createService(repository, directions, days);

    expect((await service.get(september)).suggestion).toEqual({
      directionId: 'health',
      source: 'legacy_day',
    });
  });
});

class FakeMonthlyDirectionFocusRepository implements MonthlyDirectionFocusRepository {
  readonly #records = new Map<string, MonthlyDirectionFocus>();

  public async findByMonth(month: string): Promise<MonthlyDirectionFocus | null> {
    return this.#records.get(month) ?? null;
  }

  public async findLatestBefore(month: string): Promise<MonthlyDirectionFocus | null> {
    return (
      [...this.#records.values()]
        .filter((record) => record.month < month)
        .sort((left, right) => right.month.localeCompare(left.month))[0] ?? null
    );
  }

  public async change(
    month: string,
    change: (current: MonthlyDirectionFocus | null) => MonthlyDirectionFocus,
  ): Promise<MonthlyDirectionFocus> {
    const next = change(this.#records.get(month) ?? null);
    this.#records.set(month, next);
    return next;
  }

  public seed(value: MonthlyDirectionFocus): void {
    this.#records.set(value.month, value);
  }
}

class FakeDirectionRepository implements DirectionRepository {
  readonly #directions: ReadonlyMap<string, Direction>;

  public constructor(...directions: readonly Direction[]) {
    this.#directions = new Map(directions.map((direction) => [direction.id.toString(), direction]));
  }

  public async findById(id: EntityId): Promise<Direction | null> {
    return this.#directions.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Direction[]> {
    return [...this.#directions.values()];
  }

  public async findBySphereId(): Promise<readonly Direction[]> {
    return [];
  }

  public async create(): Promise<boolean> {
    return false;
  }

  public async updateIfVersionMatches(): Promise<boolean> {
    return false;
  }

  public async updateManyIfVersionsMatch(): Promise<boolean> {
    return false;
  }
}

function createService(
  repository: MonthlyDirectionFocusRepository,
  directions: DirectionRepository,
  days = new FakeDayRepository(),
): MonthlyDirectionFocusService {
  return new MonthlyDirectionFocusService(repository, directions, days, new FakeClock(now));
}

function activeDirection(id: string): Direction {
  return Direction.create({ id: EntityId.create(id), name: id, now });
}

function focus(month: string, directionId: string | null): MonthlyDirectionFocus {
  return {
    id: `monthly-direction-focus:${month}`,
    month,
    directionId,
    updatedAt: now.toISOString(),
    version: 1,
    schemaVersion: 1,
  };
}
