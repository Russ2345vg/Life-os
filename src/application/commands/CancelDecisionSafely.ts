import {
  DecisionCancelReason,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type Decision,
  type EntityId,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { domainFailure } from './decisionCommandResult';

export interface CancelDecisionSafelyInput {
  readonly decisionId: EntityId;
}

export class CancelDecisionSafely {
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

  public async execute(input: CancelDecisionSafelyInput): Promise<Result<Decision, DomainError>> {
    const decision = await this.#decisionRepository.findById(input.decisionId);

    if (decision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    if (
      decision.isArchived() ||
      (decision.status !== DECISION_STATUS.planned &&
        decision.status !== DECISION_STATUS.inProgress)
    ) {
      return failure(new DomainError('decision.cannot_cancel', 'Это решение уже нельзя отменить.'));
    }

    const lifeActions = await this.#lifeActionRepository.findByDecisionId(decision.id);

    if (lifeActions.some(isUnfinished)) {
      return failure(
        new DomainError(
          'decision.actions_unfinished',
          'Сначала завершите или отмените незавершённые действия.',
        ),
      );
    }

    try {
      decision.cancel(
        this.#clock.now(),
        this.#idGenerator.generate(),
        DecisionCancelReason.create('Отменено пользователем'),
      );
      await this.#decisionRepository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}

function isUnfinished(lifeAction: LifeAction): boolean {
  return (
    lifeAction.status === LIFE_ACTION_STATUS.draft ||
    lifeAction.status === LIFE_ACTION_STATUS.ready ||
    lifeAction.status === LIFE_ACTION_STATUS.inProgress
  );
}
