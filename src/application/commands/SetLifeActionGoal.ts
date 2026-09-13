import type { EntityId, LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { GoalRepository } from '../ports/GoalRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface SetLifeActionGoalInput {
  readonly lifeActionId: EntityId;
  readonly goalId: EntityId | null;
}

export class SetLifeActionGoal {
  public constructor(
    readonly lifeActionRepository: LifeActionRepository,
    readonly goalRepository: GoalRepository,
    readonly journalUnitOfWork: JournalUnitOfWork,
  ) {}

  public async execute(input: SetLifeActionGoalInput): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.lifeActionRepository.findById(input.lifeActionId);
    if (lifeAction === null) return lifeActionNotFound();
    if (input.goalId !== null && (await this.goalRepository.findById(input.goalId)) === null) {
      return failure(new DomainError('goal.not_found', 'Цель не найдена.'));
    }

    try {
      const expectedVersion = lifeAction.version;
      if (!lifeAction.setGoal(input.goalId)) return success(lifeAction);
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
