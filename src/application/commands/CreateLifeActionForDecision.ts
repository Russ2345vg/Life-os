import {
  ActionExpectedResult,
  DECISION_STATUS,
  LifeAction,
  LifeActionTitle,
  type DayDate,
  type EntityId,
} from '../../domain';
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

export interface CreateLifeActionForDecisionInput {
  readonly decisionId: EntityId;
  readonly title: string;
  readonly description?: string;
  readonly expectedResult: string;
  readonly plannedDate: DayDate;
  readonly sphereId?: EntityId | null;
}

export class CreateLifeActionForDecision {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: CreateLifeActionForDecisionInput,
  ): Promise<Result<LifeAction, DomainError>> {
    const decision = await this.#decisionRepository.findById(input.decisionId);

    if (decision === null) {
      return decisionNotFoundForLifeAction();
    }

    const statusAllowsNewLifeAction =
      decision.status === DECISION_STATUS.draft ||
      decision.status === DECISION_STATUS.planned ||
      decision.status === DECISION_STATUS.inProgress;

    if (decision.isArchived() || decision.isDeleted() || !statusAllowsNewLifeAction) {
      return decisionUnavailableForLifeAction();
    }

    try {
      const occurredAt = this.#clock.now();
      const lifeAction = LifeAction.createDraft({
        id: this.#idGenerator.generate(),
        title: LifeActionTitle.create(input.title),
        ...(input.description === undefined ? {} : { description: input.description }),
        decisionId: input.decisionId,
        sphereId: input.sphereId === undefined ? decision.sphereId : input.sphereId,
        createdAt: occurredAt,
        eventId: this.#idGenerator.generate(),
      });

      lifeAction.makeReady({
        expectedResult: ActionExpectedResult.create(input.expectedResult),
        plannedDate: input.plannedDate,
        occurredAt,
        eventId: this.#idGenerator.generate(),
      });

      await this.#lifeActionRepository.save(lifeAction);
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
