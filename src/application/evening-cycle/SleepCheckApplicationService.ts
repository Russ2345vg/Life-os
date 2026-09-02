import {
  type CorrectiveActionKind,
  type DayDate,
  type EveningCycle,
  type SleepCheckAnswerValue,
  type SleepCheckQuestionId,
  type SubjectiveRating,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import { cloneEveningCycle } from './EveningCycleApplicationService';

type SleepCheckMutation = (cycle: EveningCycle, occurredAt: Date) => boolean;

export class SleepCheckApplicationService {
  readonly #cycles: EveningCycleRepository;
  readonly #clock: Clock;

  public constructor(cycles: EveningCycleRepository, clock: Clock) {
    this.#cycles = cycles;
    this.#clock = clock;
  }

  public getStored(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#cycles.findByDateKey(dateKey);
  }

  public setBeforeRatings(
    dateKey: DayDate,
    calm: SubjectiveRating,
    sleepReadiness: SubjectiveRating,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.setBeforeRelaxationRatings(calm, sleepReadiness, occurredAt),
    );
  }

  public setAfterRatings(
    dateKey: DayDate,
    calm: SubjectiveRating,
    sleepReadiness: SubjectiveRating,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.setAfterRelaxationRatings(calm, sleepReadiness, occurredAt),
    );
  }

  public answerQuestion(
    dateKey: DayDate,
    questionId: SleepCheckQuestionId,
    answer: SleepCheckAnswerValue,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.answerSleepCheckQuestion(questionId, answer, occurredAt),
    );
  }

  public chooseCorrectiveAction(
    dateKey: DayDate,
    questionId: SleepCheckQuestionId,
    action: CorrectiveActionKind,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.chooseSleepCheckCorrectiveAction(questionId, action, occurredAt),
    );
  }

  public completeCorrectiveAction(
    dateKey: DayDate,
    questionId: SleepCheckQuestionId,
    capturedThought: string | null = null,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.completeSleepCheckCorrectiveAction(questionId, capturedThought, occurredAt),
    );
  }

  public retryQuestion(
    dateKey: DayDate,
    questionId: SleepCheckQuestionId,
    answer: SleepCheckAnswerValue,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.retrySleepCheckQuestion(questionId, answer, occurredAt),
    );
  }

  public complete(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.completeSleepCheck(occurredAt));
  }

  private async mutate(dateKey: DayDate, mutation: SleepCheckMutation): Promise<EveningCycle> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.#cycles.findByDateKey(dateKey);
      if (stored === null) {
        throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
      }
      const cycle = cloneEveningCycle(stored);
      const expectedVersion = cycle.version;
      mutation(cycle, this.#clock.now());
      if (cycle.version === expectedVersion) return cycle;
      if (await this.#cycles.saveIfVersionMatches(cycle, expectedVersion)) return cycle;
    }
    throw new DomainError(
      'sleep_check.concurrent_change',
      'Проверка сна изменилась в другом окне. Обновите данные и повторите операцию.',
    );
  }
}
