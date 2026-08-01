import { DECISION_STATUS, LifeAction, type EntityId, type LifeActionTitle } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import {
  decisionNotFoundForLifeAction,
  decisionUnavailableForLifeAction,
  lifeActionDomainFailure,
} from './lifeActionCommandResult';

export interface CreateLifeActionDraftInput {
  readonly title: LifeActionTitle;
  readonly description?: string;
  readonly decisionId?: EntityId;
}

export class CreateLifeActionDraft {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    decisionRepository: DecisionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#decisionRepository = decisionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: CreateLifeActionDraftInput,
  ): Promise<Result<LifeAction, DomainError>> {
    if (input.decisionId !== undefined) {
      const decision = await this.#decisionRepository.findById(input.decisionId);

      if (decision === null) {
        return decisionNotFoundForLifeAction();
      }

      const statusAllowsNewLifeAction =
        decision.status === DECISION_STATUS.draft ||
        decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress;

      if (decision.isArchived() || !statusAllowsNewLifeAction) {
        return decisionUnavailableForLifeAction();
      }
    }

    try {
      const lifeAction = LifeAction.createDraft({
        id: this.#idGenerator.generate(),
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
        createdAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });

      await this.#lifeActionRepository.save(lifeAction);
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
