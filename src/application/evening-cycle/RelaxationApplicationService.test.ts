import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  RELAXATION_PRACTICE,
  SCREEN_FREE_STATE,
  type EveningCycleMode,
} from '../../domain';
import type { Clock } from '../ports/Clock';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import { RelaxationApplicationService } from './RelaxationApplicationService';
import { SleepCheckApplicationService } from './SleepCheckApplicationService';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../evening-settings';

const TODAY = DayDate.create('2026-08-30');

describe('RelaxationApplicationService', () => {
  it('инициализирует NORMAL из настроек Evening Ritual', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    const service = new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
      {
        loadEveningRitualSettings: () => ({
          ...DEFAULT_EVENING_RITUAL_SETTINGS,
          defaultRelaxationPractice: RELAXATION_PRACTICE.breathing,
          defaultScreenFreeDuration: 30,
          adaptiveRelaxationEnabled: false,
        }),
      },
    );

    const initialized = await service.getOrInitialize(TODAY);

    expect(initialized.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(initialized.relaxation?.selectedPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(initialized.relaxation?.screenFreeDurationMinutes).toBe(30);
  });

  it('инициализирует встроенное чтение и сохраняет snapshot при refresh', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    const clock = new MutableClock(at('2026-08-30', '21:00:00'));
    const service = new RelaxationApplicationService(repository, clock);

    const initialized = await service.getOrInitialize(TODAY);
    const refreshed = await new RelaxationApplicationService(repository, clock).getOrInitialize(
      TODAY,
    );

    expect(initialized.relaxation).toMatchObject({
      defaultPractice: RELAXATION_PRACTICE.reading,
      selectedPractice: RELAXATION_PRACTICE.reading,
      practiceDurationMinutes: 15,
      screenFreeDurationMinutes: 25,
    });
    expect(refreshed.relaxation?.createdAt).toEqual(at('2026-08-30', '21:00:00'));
    expect(refreshed.version).toBe(initialized.version);
  });

  it.each([
    [EVENING_CYCLE_MODE.normal, 15, 25],
    [EVENING_CYCLE_MODE.quick, 5, 10],
    [EVENING_CYCLE_MODE.emergency, 5, 10],
  ] as const)('задаёт длительности режима %s', async (mode, practice, screenFree) => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30', mode));

    const initialized = await new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
    ).getOrInitialize(TODAY);

    expect(initialized.relaxation?.practiceDurationMinutes).toBe(practice);
    expect(initialized.relaxation?.screenFreeDurationMinutes).toBe(screenFree);
  });

  it('переносит последний prior default, но не временную замену текущего вечера', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-28'));
    await repository.createIfAbsent(relaxingCycle('2026-08-29'));
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    const clock = new MutableClock(at('2026-08-28', '21:00:00'));
    const service = new RelaxationApplicationService(repository, clock);
    await service.getOrInitialize(DayDate.create('2026-08-28'));
    await service.choosePractice(DayDate.create('2026-08-28'), RELAXATION_PRACTICE.breathing, true);
    clock.set(at('2026-08-29', '21:00:00'));
    const inherited = await service.getOrInitialize(DayDate.create('2026-08-29'));
    await service.choosePractice(
      DayDate.create('2026-08-29'),
      RELAXATION_PRACTICE.meditation,
      false,
    );
    clock.set(at('2026-08-30', '21:00:00'));
    const next = await service.getOrInitialize(TODAY);

    expect(inherited.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(next.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(next.relaxation?.selectedPractice).toBe(RELAXATION_PRACTICE.breathing);
  });

  it('не перекрывает новый configured default неявным default предыдущего вечера', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-29'));
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    const clock = new MutableClock(at('2026-08-29', '21:00:00'));
    await new RelaxationApplicationService(repository, clock).getOrInitialize(
      DayDate.create('2026-08-29'),
    );
    clock.set(at('2026-08-30', '21:00:00'));
    const service = new RelaxationApplicationService(repository, clock, {
      loadEveningRitualSettings: () => ({
        ...DEFAULT_EVENING_RITUAL_SETTINGS,
        defaultRelaxationPractice: RELAXATION_PRACTICE.breathing,
        adaptiveRelaxationEnabled: true,
      }),
    });

    const initialized = await service.getOrInitialize(TODAY);

    expect(initialized.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(initialized.relaxation?.selectedPractice).toBe(RELAXATION_PRACTICE.breathing);
  });

  it('getStored не инициализирует legacy history', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(cycle('2026-08-30', EVENING_CYCLE_STATE.shutdown));
    const service = new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
    );

    const stored = await service.getStored(TODAY);

    expect(stored?.relaxation).toBeNull();
    expect(stored?.version).toBe(1);
  });

  it('выполняет независимые команды и manual completion без таймера', async () => {
    const { service, clock } = await initializedContext();

    await service.completeHygiene(TODAY);
    await service.completeDrink(TODAY);
    await service.setPracticeDuration(TODAY, 10);
    await service.choosePractice(TODAY, RELAXATION_PRACTICE.stretching, false);
    await service.completePractice(TODAY);
    await service.startScreenFree(TODAY);
    await service.shortenScreenFree(TODAY);
    clock.set(at('2026-08-30', '21:09:59.999'));
    await expect(service.complete(TODAY)).rejects.toMatchObject({
      code: 'relaxation.not_ready',
    });
    clock.set(at('2026-08-30', '21:10:00'));

    const completed = await service.complete(TODAY);

    expect(completed.state).toBe(EVENING_CYCLE_STATE.sleepCheck);
    expect(completed.relaxation?.practiceTimerStartedAt).toBeNull();
    expect(completed.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.completed);
  });

  it('поддерживает optional timer и conscious screen-free skip', async () => {
    const { service } = await initializedContext();

    const timed = await service.startPracticeTimer(TODAY);
    await service.completePractice(TODAY);
    const skipped = await service.skipScreenFree(TODAY);

    expect(timed.relaxation?.practiceTimerStartedAt).toEqual(at('2026-08-30', '21:00:00'));
    expect(skipped.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.skipped);
  });

  it('в QUICK требует только гигиену и Relaxation 2–5 минут перед Sleep Check', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30', EVENING_CYCLE_MODE.quick));
    const clock = new MutableClock(at('2026-08-30', '21:00:00'));
    const service = new RelaxationApplicationService(repository, clock);
    await service.getOrInitialize(TODAY);

    await expect(service.setPracticeDuration(TODAY, 1)).rejects.toMatchObject({
      code: 'relaxation.short_duration_out_of_range',
    });
    await expect(service.setPracticeDuration(TODAY, 6)).rejects.toMatchObject({
      code: 'relaxation.short_duration_out_of_range',
    });
    await service.setPracticeDuration(TODAY, 2);
    await service.completeHygiene(TODAY);
    await service.completePractice(TODAY);
    await new SleepCheckApplicationService(repository, clock).setBeforeRatings(TODAY, 3, 3);

    const completed = await service.complete(TODAY);

    expect(completed.state).toBe(EVENING_CYCLE_STATE.sleepCheck);
    expect(completed.relaxation).toMatchObject({
      drinkCompletedAt: null,
      screenFreeState: SCREEN_FREE_STATE.pending,
      practiceDurationMinutes: 2,
    });
  });

  it('повторяет CAS один раз и затем сохраняет команду', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    repository.casMissesRemaining = 1;
    const service = new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
    );

    const initialized = await service.getOrInitialize(TODAY);

    expect(initialized.relaxation).not.toBeNull();
    expect(repository.saveAttempts).toBe(2);
  });

  it('после двух CAS misses возвращает relaxation.concurrent_change', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    repository.casMissesRemaining = 2;
    const service = new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
    );

    await expect(service.getOrInitialize(TODAY)).rejects.toMatchObject({
      code: 'relaxation.concurrent_change',
    });
    expect(repository.saveAttempts).toBe(2);
  });

  it('не маскирует persistence error', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle('2026-08-30'));
    repository.saveError = new Error('disk unavailable');
    const service = new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
    );

    await expect(service.getOrInitialize(TODAY)).rejects.toThrow('disk unavailable');
  });

  it('отклоняет инициализацию вне RELAXING', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(cycle('2026-08-30', EVENING_CYCLE_STATE.shutdown));
    const service = new RelaxationApplicationService(
      repository,
      new MutableClock(at('2026-08-30', '21:00:00')),
    );

    await expect(service.getOrInitialize(TODAY)).rejects.toMatchObject({
      code: 'relaxation.not_available',
    });
  });
});

async function initializedContext() {
  const repository = new TestEveningCycleRepository();
  await repository.createIfAbsent(relaxingCycle('2026-08-30'));
  const clock = new MutableClock(at('2026-08-30', '21:00:00'));
  const service = new RelaxationApplicationService(repository, clock);
  await service.getOrInitialize(TODAY);
  await new SleepCheckApplicationService(repository, clock).setBeforeRatings(TODAY, 3, 3);
  return { repository, clock, service };
}

class MutableClock implements Clock {
  public constructor(private current: Date) {}

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public set(value: Date): void {
    this.current = new Date(value.getTime());
  }
}

class TestEveningCycleRepository implements EveningCycleRepository {
  readonly #cycles = new Map<string, EveningCycle>();
  public casMissesRemaining = 0;
  public saveAttempts = 0;
  public saveError: Error | null = null;

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    return [...this.#cycles.values()].find((candidate) => candidate.id.equals(id)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#cycles.values()].find((candidate) => candidate.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#cycles.get(dateKey.toString()) ?? null;
  }

  public async findLatestWithSavedRelaxationDefaultBefore(
    dateKey: DayDate,
  ): Promise<EveningCycle | null> {
    return (
      [...this.#cycles.values()]
        .filter(
          (candidate) =>
            candidate.dateKey.isBefore(dateKey) &&
            candidate.relaxation?.defaultChangedForFuture === true,
        )
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async createIfAbsent(candidate: EveningCycle): Promise<EveningCycle> {
    const stored = await this.findByDateKey(candidate.dateKey);
    if (stored !== null) return stored;
    this.#cycles.set(candidate.dateKey.toString(), candidate);
    return candidate;
  }

  public async saveIfVersionMatches(
    candidate: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    this.saveAttempts += 1;
    if (this.saveError !== null) throw this.saveError;
    if (this.casMissesRemaining > 0) {
      this.casMissesRemaining -= 1;
      return false;
    }
    const stored = await this.findByDateKey(candidate.dateKey);
    if (stored === null || stored.version !== expectedVersion) return false;
    this.#cycles.set(candidate.dateKey.toString(), candidate);
    return true;
  }
}

function relaxingCycle(date: string, mode: EveningCycleMode = EVENING_CYCLE_MODE.normal) {
  return cycle(date, EVENING_CYCLE_STATE.relaxing, mode);
}

function cycle(
  date: string,
  state: (typeof EVENING_CYCLE_STATE)[keyof typeof EVENING_CYCLE_STATE],
  mode: EveningCycleMode = EVENING_CYCLE_MODE.normal,
): EveningCycle {
  return EveningCycle.rehydrate({
    id: EntityId.create(`cycle-${date}`),
    dayId: EntityId.create(`day-${date}`),
    dateKey: DayDate.create(date),
    state,
    mode,
    startedAt: at(date, '20:00:00'),
    updatedAt: at(date, '20:00:00'),
    completedAt: null,
    version: 1,
  });
}

function at(date: string, time: string): Date {
  return new Date(`${date}T${time.endsWith('Z') ? time : `${time}Z`}`);
}
