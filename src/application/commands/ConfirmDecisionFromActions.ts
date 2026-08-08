import {
  ActualResultSummary,
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

export interface ConfirmDecisionFromActionsInput {
  readonly decisionId: EntityId;
  readonly actualResult: string;
}

export class ConfirmDecisionFromActions {
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
    input: ConfirmDecisionFromActionsInput,
  ): Promise<Result<Decision, DomainError>> {
    const decision = await this.#decisionRepository.findById(input.decisionId);

    if (decision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    if (
      decision.isArchived() ||
      decision.isDeleted() ||
      (decision.status !== DECISION_STATUS.planned &&
        decision.status !== DECISION_STATUS.inProgress)
    ) {
      return failure(
        new DomainError('decision.cannot_confirm', 'Это решение больше нельзя подтвердить.'),
      );
    }

    const lifeActions = await this.#lifeActionRepository.findByDecisionId(decision.id);
    const completedActions = lifeActions
      .filter((lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.completed)
      .sort(compareLifeActions);

    if (completedActions.length === 0) {
      return failure(
        new DomainError(
          'decision.no_completed_actions',
          'Для подтверждения нужно хотя бы одно завершённое действие.',
        ),
      );
    }

    if (lifeActions.some(isUnfinished)) {
      return failure(
        new DomainError('decision.actions_unfinished', 'Сначала завершите текущие действия.'),
      );
    }

    if (input.actualResult.trim().length === 0) {
      return failure(
        new DomainError(
          'decision.actual_result_required',
          'Укажите фактический результат решения.',
        ),
      );
    }

    try {
      const actualResult = ActualResultSummary.create(input.actualResult);
      const evidenceIds = completedActions.map((lifeAction) => lifeAction.id);
      decision.confirm(actualResult, evidenceIds, this.#clock.now(), this.#idGenerator.generate());
      await this.#decisionRepository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
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

function compareLifeActions(left: LifeAction, right: LifeAction): number {
  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  const leftId = left.id.toString();
  const rightId = right.id.toString();
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}
