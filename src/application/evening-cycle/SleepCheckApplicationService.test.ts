import { describe, expect, it } from 'vitest';
import {
  CORRECTIVE_ACTION,
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  RELAXATION_PRACTICE,
  RelaxationSnapshot,
  SLEEP_CHECK_ANSWER,
  SLEEP_CHECK_QUESTION,
} from '../../domain';
import type { Clock } from '../ports/Clock';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import { DomainError } from '../../shared/errors/DomainError';
import { cloneEveningCycle } from './EveningCycleApplicationService';
import { SleepCheckApplicationService } from './SleepCheckApplicationService';

const DATE = DayDate.create('2026-08-30');

describe('SleepCheckApplicationService', () => {
  it('сохраняет обе пары ratings и полный positive flow с исходным dateKey после полуночи', async () => {
    const repository = new TestEveningCycleRepository();
    await repository.createIfAbsent(relaxingCycle());
    const clock = new MutableClock(at('22:00:00'));
    const service = new SleepCheckApplicationService(repository, clock);

    const before = await service.setBeforeRatings(DATE, 2, 3);
    finishRelaxation(before, at('22:10:00'));
    await repository.saveIfVersionMatches(before, before.version - 5);
    clock.set(at('22:11:00'));
    await service.setAfterRatings(DATE, 4, 5);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.calmMind, SLEEP_CHECK_ANSWER.yes);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.holdingThought, SLEEP_CHECK_ANSWER.no);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.readyForSleep, SLEEP_CHECK_ANSWER.yes);
    clock.set(new Date('2026-08-31T00:05:00.000+09:00'));

    const completed = await service.complete(DATE);
    const refreshed = await service.getStored(DATE);

    expect(completed.state).toBe(EVENING_CYCLE_STATE.shutdown);
    expect(completed.dateKey.equals(DATE)).toBe(true);
    expect(refreshed?.sleepCheck).toMatchObject({
      calmBefore: 2,
      sleepReadinessBefore: 3,
      calmAfter: 4,
      sleepReadinessAfter: 5,
    });
  });

  it('сохраняет только первое corrective action, capture и один retry', async () => {
    const { service } = await sleepCheckContext();
    await service.setAfterRatings(DATE, 3, 3);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.calmMind, SLEEP_CHECK_ANSWER.yes);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.holdingThought, SLEEP_CHECK_ANSWER.yes);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.readyForSleep, SLEEP_CHECK_ANSWER.no);
    await service.chooseCorrectiveAction(
      DATE,
      SLEEP_CHECK_QUESTION.holdingThought,
      CORRECTIVE_ACTION.captureThought,
    );
    await service.completeCorrectiveAction(
      DATE,
      SLEEP_CHECK_QUESTION.holdingThought,
      'Вернуться к смете завтра',
    );
    const retried = await service.retryQuestion(
      DATE,
      SLEEP_CHECK_QUESTION.holdingThought,
      SLEEP_CHECK_ANSWER.yes,
    );

    expect(retried.sleepCheck?.correctiveAction).toMatchObject({
      questionId: SLEEP_CHECK_QUESTION.holdingThought,
      action: CORRECTIVE_ACTION.captureThought,
      capturedThought: 'Вернуться к смете завтра',
    });
    expect(retried.sleepCheck?.retriedAnswers).toHaveLength(1);
    expect(retried.sleepCheck?.readyToComplete).toBe(true);
  });

  it('делает одинаковую повторную команду no-op без дополнительного save', async () => {
    const repository = new CountingRepository();
    await repository.createIfAbsent(sleepCheckCycle());
    const service = new SleepCheckApplicationService(repository, new MutableClock(at('22:20:00')));
    await service.setAfterRatings(DATE, 4, 4);
    const saves = repository.saveAttempts;

    const repeated = await service.setAfterRatings(DATE, 4, 4);

    expect(repeated.sleepCheck?.calmAfter).toBe(4);
    expect(repository.saveAttempts).toBe(saves);
  });

  it('после одного CAS miss повторно применяет intent, после двух возвращает scoped conflict', async () => {
    const repository = new CountingRepository();
    await repository.createIfAbsent(sleepCheckCycle());
    const service = new SleepCheckApplicationService(repository, new MutableClock(at('22:20:00')));
    repository.casMissesRemaining = 1;

    const saved = await service.setAfterRatings(DATE, 4, 4);
    expect(saved.sleepCheck?.calmAfter).toBe(4);
    expect(repository.saveAttempts).toBe(2);

    const secondRepository = new CountingRepository();
    await secondRepository.createIfAbsent(sleepCheckCycle());
    secondRepository.casMissesRemaining = 2;
    await expect(
      new SleepCheckApplicationService(
        secondRepository,
        new MutableClock(at('22:20:00')),
      ).setAfterRatings(DATE, 4, 4),
    ).rejects.toMatchObject({ code: 'sleep_check.concurrent_change' });
  });

  it('не скрывает raw persistence error и не пытается повторно сохранить его как CAS miss', async () => {
    const repository = new CountingRepository();
    await repository.createIfAbsent(sleepCheckCycle());
    const expected = new DomainError('persistence.write_failed', 'Сбой записи');
    repository.saveError = expected;
    const service = new SleepCheckApplicationService(repository, new MutableClock(at('22:20:00')));

    await expect(service.setAfterRatings(DATE, 4, 4)).rejects.toBe(expected);
    expect(repository.saveAttempts).toBe(1);
  });

  it('отклоняет конфликтующий повторный ответ без дополнительного save', async () => {
    const repository = new CountingRepository();
    await repository.createIfAbsent(sleepCheckCycle());
    const service = new SleepCheckApplicationService(repository, new MutableClock(at('22:20:00')));
    await service.setAfterRatings(DATE, 4, 4);
    await service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.calmMind, SLEEP_CHECK_ANSWER.yes);
    const saves = repository.saveAttempts;

    await expect(
      service.answerQuestion(DATE, SLEEP_CHECK_QUESTION.calmMind, SLEEP_CHECK_ANSWER.no),
    ).rejects.toMatchObject({ code: 'sleep_check.answer_already_recorded' });
    expect(repository.saveAttempts).toBe(saves);
  });
});

async function sleepCheckContext() {
  const repository = new TestEveningCycleRepository();
  await repository.createIfAbsent(sleepCheckCycle());
  return {
    repository,
    service: new SleepCheckApplicationService(repository, new MutableClock(at('22:20:00'))),
  };
}

function relaxingCycle(): EveningCycle {
  return EveningCycle.rehydrate({
    id: EntityId.create('cycle-r6'),
    dayId: EntityId.create('day-r6'),
    dateKey: DATE,
    state: EVENING_CYCLE_STATE.relaxing,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: at('20:00:00'),
    updatedAt: at('20:00:00'),
    completedAt: null,
    relaxation: RelaxationSnapshot.start({
      defaultPractice: RELAXATION_PRACTICE.reading,
      practiceDurationMinutes: 15,
      screenFreeDurationMinutes: 25,
      occurredAt: at('21:00:00'),
    }),
    version: 1,
  });
}

function sleepCheckCycle(): EveningCycle {
  const cycle = relaxingCycle();
  cycle.setBeforeRelaxationRatings(2, 3, at('21:01:00'));
  finishRelaxation(cycle, at('22:10:00'));
  return cycle;
}

function finishRelaxation(cycle: EveningCycle, occurredAt: Date): void {
  cycle.completeRelaxationDrink(occurredAt);
  cycle.completeRelaxationHygiene(occurredAt);
  cycle.completeRelaxationPractice(occurredAt);
  cycle.skipRelaxationScreenFree(occurredAt);
  cycle.completeRelaxation(occurredAt);
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
  readonly #cycles: EveningCycle[] = [];

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    const stored = this.#cycles.find((cycle) => cycle.id.equals(id));
    return stored === undefined ? null : cloneEveningCycle(stored);
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    const stored = this.#cycles.find((cycle) => cycle.dayId.equals(dayId));
    return stored === undefined ? null : cloneEveningCycle(stored);
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    const stored = this.#cycles.find((cycle) => cycle.dateKey.equals(dateKey));
    return stored === undefined ? null : cloneEveningCycle(stored);
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const stored = this.#cycles.find((candidate) => candidate.dateKey.equals(cycle.dateKey));
    if (stored !== undefined) return cloneEveningCycle(stored);
    const copy = cloneEveningCycle(cycle);
    this.#cycles.push(copy);
    return cloneEveningCycle(copy);
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const index = this.#cycles.findIndex((candidate) => candidate.id.equals(cycle.id));
    if (index < 0 || this.#cycles[index]!.version !== expectedVersion) return false;
    this.#cycles[index] = cloneEveningCycle(cycle);
    return true;
  }
}

class CountingRepository extends TestEveningCycleRepository {
  public casMissesRemaining = 0;
  public saveAttempts = 0;
  public saveError: Error | null = null;
  public override async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    this.saveAttempts += 1;
    if (this.saveError !== null) throw this.saveError;
    if (this.casMissesRemaining > 0) {
      this.casMissesRemaining -= 1;
      return false;
    }
    return super.saveIfVersionMatches(cycle, expectedVersion);
  }
}

function at(time: string): Date {
  return new Date(`2026-08-30T${time}.000+09:00`);
}
