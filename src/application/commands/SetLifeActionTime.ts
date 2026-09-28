import type { EntityId, LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface SetLifeActionTimeInput {
  readonly lifeActionId: EntityId;
  readonly estimateMinutes: number | null;
  readonly scheduledStartMinute: number | null;
  readonly scheduledDurationMinutes: number | null;
  readonly expectedVersion?: number;
}

export class SetLifeActionTime {
  public constructor(
    readonly repository: LifeActionRepository,
    readonly unitOfWork: JournalUnitOfWork,
  ) {}

  public async execute(input: SetLifeActionTimeInput): Promise<Result<LifeAction, DomainError>> {
    const action = await this.repository.findById(input.lifeActionId);
    if (action === null) return lifeActionNotFound();
    try {
      if (input.expectedVersion !== undefined && action.version !== input.expectedVersion)
        throw new DomainError(
          'persistence.version_conflict',
          'Действие изменилось. Откройте планирование времени заново.',
        );
      const expectedVersion = action.version;
      if (!action.setTimePlanning(input)) return success(action);
      await this.unitOfWork.commit({
        lifeActions: [{ lifeAction: action, expectedVersion }],
        journalEntries: [],
      });
      return success(action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
