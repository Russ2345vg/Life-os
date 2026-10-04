import type { EntityId, LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { GoalRepository } from '../ports/GoalRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface SetLifeActionGoalInput {
  readonly lifeActionId: EntityId;
  readonly goalId: EntityId | null;
  readonly directionId?: EntityId | null;
}

export class SetLifeActionGoal {
  public constructor(
    readonly lifeActionRepository: LifeActionRepository,
    readonly goalRepository: GoalRepository,
    readonly journalUnitOfWork: JournalUnitOfWork,
    readonly directionRepository: DirectionRepository,
  ) {}

  public async execute(input: SetLifeActionGoalInput): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.lifeActionRepository.findById(input.lifeActionId);
    if (lifeAction === null) return lifeActionNotFound();
    const goal = input.goalId === null ? null : await this.goalRepository.findById(input.goalId);
    if (input.goalId !== null && goal === null) {
      return failure(new DomainError('goal.not_found', 'Цель не найдена.'));
    }

    const directionId = input.directionId === undefined ? null : input.directionId;
    if (goal && directionId && !goal.directionId?.equals(directionId))
      return failure(
        new DomainError('life_action.context_conflict', 'Цель принадлежит другому направлению.'),
      );
    const effectiveDirectionId = goal ? null : directionId;
    const direction = effectiveDirectionId
      ? await this.directionRepository.findById(effectiveDirectionId)
      : null;
    if (effectiveDirectionId && (!direction || direction.status === 'archived'))
      return failure(new DomainError('direction.not_found', 'Направление недоступно.'));

    try {
      const expectedVersion = lifeAction.version;
      if (
        !(input.directionId === undefined
          ? lifeAction.setGoal(input.goalId)
          : lifeAction.setContext(
              input.goalId,
              input.goalId ? null : directionId,
              goal?.sphereId ?? direction?.sphereId ?? null,
            ))
      )
        return success(lifeAction);
      await this.journalUnitOfWork.commit({
        lifeActions: [{ lifeAction, expectedVersion }],
        journalEntries: [],
      });
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
