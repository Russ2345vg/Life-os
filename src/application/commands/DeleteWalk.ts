import { WALK_STATUS, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { WalkRepository } from '../ports/WalkRepository';

export interface DeleteWalkInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export class DeleteWalk {
  public constructor(readonly repository: WalkRepository) {}

  public async execute(input: DeleteWalkInput): Promise<Result<void, DomainError>> {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      return failure(
        new DomainError('walk.invalid_expected_version', 'Версия прогулки указана неверно.'),
      );
    }

    const stored = await this.repository.findById(input.id);
    if (stored === null) {
      return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
    }
    if (stored.status !== WALK_STATUS.planned) {
      return failure(
        new DomainError('walk.cannot_delete_running', 'Идущую прогулку нельзя удалить.'),
      );
    }
    if (stored.version !== input.expectedVersion) return versionConflict();

    const deleted = await this.repository.deleteIfVersionMatches(input.id, input.expectedVersion);
    return deleted ? success(undefined) : versionConflict();
  }
}

function versionConflict() {
  return failure(
    new DomainError(
      'walk.version_conflict',
      'Прогулка изменилась в другой вкладке. Обновите данные и повторите удаление.',
    ),
  );
}
