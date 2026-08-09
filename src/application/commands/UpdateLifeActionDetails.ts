import {
  ActionExpectedResult,
  LIFE_ACTION_STATUS,
  LifeActionTitle,
  type EntityId,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface UpdateLifeActionDetailsInput {
  readonly lifeActionId: EntityId;
  readonly title: string;
  readonly description?: string;
  readonly expectedResult: string;
  readonly sphereId?: EntityId | null;
}

export class UpdateLifeActionDetails {
  readonly #repository: LifeActionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(repository: LifeActionRepository, clock: Clock, idGenerator: IdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: UpdateLifeActionDetailsInput,
  ): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#repository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    if (lifeAction.isArchived() || lifeAction.status !== LIFE_ACTION_STATUS.ready) {
      return failure(
        new DomainError('action.cannot_edit', 'Это действие уже нельзя редактировать.'),
      );
    }

    if (input.title.trim().length === 0) {
      return failure(new DomainError('action.title_required', 'Введите название действия.'));
    }

    if (input.expectedResult.trim().length === 0) {
      return failure(
        new DomainError('action.expected_result_required', 'Укажите ожидаемый результат.'),
      );
    }

    try {
      const title = LifeActionTitle.create(input.title);
      const description = normalizeDescription(input.description);
      const expectedResult = ActionExpectedResult.create(input.expectedResult);

      if (
        lifeAction.title.equals(title) &&
        lifeAction.description === description &&
        lifeAction.expectedResult?.equals(expectedResult) &&
        sameOptionalEntityId(lifeAction.sphereId, input.sphereId ?? lifeAction.sphereId)
      ) {
        return success(lifeAction);
      }

      lifeAction.updateDetails({
        title,
        description,
        expectedResult,
        ...(input.sphereId === undefined ? {} : { sphereId: input.sphereId }),
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

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function normalizeDescription(description: string | undefined): string | null {
  const normalized = description?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}
