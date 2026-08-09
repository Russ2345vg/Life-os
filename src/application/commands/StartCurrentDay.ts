import {
  DAY_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type Day,
  type DayDate,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { createDayJournalEntries } from '../journal/createJournalEntries';

export interface StartCurrentDayResult {
  readonly day: Day;
  readonly firstLifeAction: LifeAction | null;
}

export class StartCurrentDay {
  readonly #dayRepository: DayRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #journalUnitOfWork: JournalUnitOfWork | null;

  public constructor(
    dayRepository: DayRepository,
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    currentDateProvider: CurrentDateProvider,
    clock: Clock,
    idGenerator: IdGenerator,
    journalUnitOfWork?: JournalUnitOfWork,
  ) {
    this.#dayRepository = dayRepository;
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#currentDateProvider = currentDateProvider;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#journalUnitOfWork = journalUnitOfWork ?? null;
  }

  public async execute(): Promise<Result<StartCurrentDayResult, DomainError>> {
    const currentDate = this.#currentDateProvider.getCurrentDate();
    const day = await this.#dayRepository.findByDate(currentDate);

    if (day === null) {
      return failure(new DomainError('day.not_found', 'Текущий день не найден.'));
    }

    if (day.status === DAY_STATUS.completed) {
      return failure(
        new DomainError('day.cannot_start', 'Завершённый день нельзя начать повторно.'),
      );
    }

    if (day.status === DAY_STATUS.open) {
      const firstLifeAction = await this.findFirstLifeAction(currentDate);
      return success(Object.freeze({ day, firstLifeAction }));
    }

    let openDay: Day | null;

    try {
      openDay = await this.#dayRepository.findOpen();
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
    }

    if (openDay !== null && !openDay.id.equals(day.id)) {
      return failure(
        new DomainError('day.another_open_exists', 'Сначала завершите ранее начатый день.'),
      );
    }

    const decisions = await this.#decisionRepository.findByDate(currentDate);
    const hasMainDecision = decisions.some(
      (decision) =>
        decision.kind === DECISION_KIND.main &&
        !decision.isDeleted() &&
        (decision.status === DECISION_STATUS.planned ||
          decision.status === DECISION_STATUS.inProgress),
    );

    if (!hasMainDecision) {
      return failure(
        new DomainError(
          'day.main_decision_required',
          'Чтобы начать день, добавьте хотя бы одно главное решение.',
        ),
      );
    }

    const firstLifeAction = await this.findFirstLifeAction(currentDate);
    const expectedDayVersion = day.version;

    try {
      day.open(currentDate, this.#clock.now(), this.#idGenerator.generate());
      if (this.#journalUnitOfWork === null) {
        await this.#dayRepository.save(day);
      } else {
        await this.#journalUnitOfWork.commit({
          days: [{ day, expectedVersion: expectedDayVersion }],
          journalEntries: createDayJournalEntries(day),
        });
      }
      return success(Object.freeze({ day, firstLifeAction }));
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
    }
  }

  private async findFirstLifeAction(currentDate: DayDate): Promise<LifeAction | null> {
    const lifeActions = await this.#lifeActionRepository.findByDate(currentDate);
    const candidates = [...lifeActions]
      .filter(
        (lifeAction) =>
          lifeAction.status === LIFE_ACTION_STATUS.inProgress ||
          lifeAction.status === LIFE_ACTION_STATUS.ready,
      )
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === LIFE_ACTION_STATUS.inProgress ? -1 : 1;
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      });

    return candidates[0] ?? null;
  }
}
