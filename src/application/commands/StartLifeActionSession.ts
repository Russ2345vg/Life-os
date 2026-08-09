import {
  ActionSession,
  DAY_STATUS,
  LIFE_ACTION_STATUS,
  type EntityId,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { createWorkSessionJournalEntries } from '../journal/createJournalEntries';
import { lifeActionNotFound } from './lifeActionCommandResult';

export interface StartLifeActionSessionInput {
  readonly lifeActionId: EntityId;
}

export type StartLifeActionSessionResult = Readonly<{
  lifeAction: LifeAction;
  session: ActionSession;
}>;

export class StartLifeActionSession {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #dayRepository: DayRepository;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #journalUnitOfWork: JournalUnitOfWork | null;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    dayRepository: DayRepository,
    currentDateProvider: CurrentDateProvider,
    clock: Clock,
    idGenerator: IdGenerator,
    journalUnitOfWork?: JournalUnitOfWork,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#dayRepository = dayRepository;
    this.#currentDateProvider = currentDateProvider;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#journalUnitOfWork = journalUnitOfWork ?? null;
  }

  public async execute(
    input: StartLifeActionSessionInput,
  ): Promise<Result<StartLifeActionSessionResult, DomainError>> {
    const lifeAction = await this.#lifeActionRepository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    if (lifeAction.isArchived()) {
      return failure(
        new DomainError('action.unavailable', 'Архивированное действие недоступно для запуска.'),
      );
    }

    if (
      lifeAction.status !== LIFE_ACTION_STATUS.ready &&
      lifeAction.status !== LIFE_ACTION_STATUS.inProgress
    ) {
      return failure(
        new DomainError(
          'action.cannot_start_session',
          'Сессию можно начать только для готового или выполняемого действия.',
        ),
      );
    }

    const currentDate = this.#currentDateProvider.getCurrentDate();

    if (!lifeAction.isScheduledFor(currentDate)) {
      return failure(
        new DomainError(
          'action.not_scheduled_for_current_day',
          'Запустить можно только действие текущего дня.',
        ),
      );
    }

    const currentDay = await this.#dayRepository.findByDate(currentDate);

    if (currentDay === null || currentDay.status !== DAY_STATUS.open) {
      return failure(new DomainError('day.not_started', 'Сначала начните текущий день.'));
    }

    let unfinishedSession: ActionSession | null;

    try {
      unfinishedSession = await this.#actionSessionRepository.findUnfinished();
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
    }

    if (unfinishedSession !== null) {
      return failure(
        new DomainError(
          'session.unfinished_exists',
          'Нельзя начать новую сессию, пока другая сессия не завершена.',
        ),
      );
    }

    const startedAt = this.#clock.now();
    const expectedLifeActionVersion = lifeAction.version;

    if (lifeAction.status === LIFE_ACTION_STATUS.ready) {
      const lifeActionEventId = this.#idGenerator.generate();
      const sessionId = this.#idGenerator.generate();
      const sessionEventId = this.#idGenerator.generate();

      lifeAction.markInProgress(startedAt, lifeActionEventId);
      const session = ActionSession.start({
        id: sessionId,
        lifeActionId: lifeAction.id,
        startedAt,
        eventId: sessionEventId,
      });

      if (this.#journalUnitOfWork === null) {
        await this.#lifeActionRepository.save(lifeAction);
        await this.#actionSessionRepository.save(session);
      } else {
        await this.#journalUnitOfWork.commit({
          lifeActions: [{ lifeAction, expectedVersion: expectedLifeActionVersion }],
          workSessions: [{ workSession: session, expectedVersion: null }],
          journalEntries: createWorkSessionJournalEntries(session, lifeAction),
        });
      }

      return success(Object.freeze({ lifeAction, session }));
    }

    const sessionId = this.#idGenerator.generate();
    const sessionEventId = this.#idGenerator.generate();
    const session = ActionSession.start({
      id: sessionId,
      lifeActionId: lifeAction.id,
      startedAt,
      eventId: sessionEventId,
    });

    if (this.#journalUnitOfWork === null) {
      await this.#actionSessionRepository.save(session);
    } else {
      await this.#journalUnitOfWork.commit({
        workSessions: [{ workSession: session, expectedVersion: null }],
        journalEntries: createWorkSessionJournalEntries(session, lifeAction),
      });
    }

    return success(Object.freeze({ lifeAction, session }));
  }
}
