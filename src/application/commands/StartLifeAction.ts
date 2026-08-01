import type { EntityId, LifeAction } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface StartLifeActionInput {
  readonly lifeActionId: EntityId;
}

export class StartLifeAction {
  readonly #repository: LifeActionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(repository: LifeActionRepository, clock: Clock, idGenerator: IdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: StartLifeActionInput): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#repository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    try {
      lifeAction.markInProgress(this.#clock.now(), this.#idGenerator.generate());
      await this.#repository.save(lifeAction);
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
