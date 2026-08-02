import { ActionSession, LIFE_ACTION_STATUS, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface StartActionSessionInput {
  readonly lifeActionId: EntityId;
}

export class StartActionSession {
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    actionSessionRepository: ActionSessionRepository,
    lifeActionRepository: LifeActionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#actionSessionRepository = actionSessionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: StartActionSessionInput,
  ): Promise<Result<ActionSession, DomainError>> {
    const lifeAction = await this.#lifeActionRepository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return failure(new DomainError('action.not_found', 'Действие не найдено.'));
    }

    if (lifeAction.isArchived()) {
      return failure(
        new DomainError(
          'session.action_unavailable',
          'Для архивированного действия нельзя начать сессию.',
        ),
      );
    }

    if (lifeAction.status !== LIFE_ACTION_STATUS.inProgress) {
      return failure(
        new DomainError(
          'session.action_not_in_progress',
          'Сессию можно начать только для выполняемого действия.',
        ),
      );
    }

    const startedAt = this.#clock.now();
    const sessionId = this.#idGenerator.generate();
    const eventId = this.#idGenerator.generate();
    const session = ActionSession.start({
      id: sessionId,
      lifeActionId: lifeAction.id,
      startedAt,
      eventId,
    });

    await this.#actionSessionRepository.save(session);
    return success(session);
  }
}
