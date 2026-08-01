import type { ActionExpectedResult, DayDate, EntityId, LifeAction } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface MakeLifeActionReadyInput {
  readonly lifeActionId: EntityId;
  readonly expectedResult: ActionExpectedResult;
  readonly plannedDate: DayDate;
}

export class MakeLifeActionReady {
  readonly #repository: LifeActionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(repository: LifeActionRepository, clock: Clock, idGenerator: IdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: MakeLifeActionReadyInput): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#repository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    try {
      lifeAction.makeReady({
        expectedResult: input.expectedResult,
        plannedDate: input.plannedDate,
        occurredAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });
      await this.#repository.save(lifeAction);
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
