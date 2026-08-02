import { ActionSession, LIFE_ACTION_STATUS, type EntityId, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
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
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
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

      await this.#lifeActionRepository.save(lifeAction);
      await this.#actionSessionRepository.save(session);

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

    await this.#actionSessionRepository.save(session);

    return success(Object.freeze({ lifeAction, session }));
  }
}
