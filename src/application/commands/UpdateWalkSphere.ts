import type { EntityId, Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';

export interface UpdateWalkSphereInput {
  readonly walkId: EntityId;
  readonly expectedVersion: number;
  readonly sphereId: EntityId | null;
}

export class UpdateWalkSphere {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: UpdateWalkSphereInput): Promise<Result<Walk, DomainError>> {
    const stored = await this.repository.findById(input.walkId);
    if (stored === null) {
      return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
    }
    if (stored.version !== input.expectedVersion) {
      return failure(
        new DomainError('walk.version_conflict', 'Прогулка изменилась. Обновите данные.'),
      );
    }
    const updated = stored.changeSphere(input.sphereId, this.clock.now());
    if (updated === stored) return success(stored);
    const saved = await this.repository.updateIfVersionMatches(updated, input.expectedVersion);
    return saved
      ? success(updated)
      : failure(new DomainError('walk.version_conflict', 'Прогулка изменилась. Обновите данные.'));
  }
}
