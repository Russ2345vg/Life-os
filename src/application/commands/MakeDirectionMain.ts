import { DIRECTION_STATUS, type Direction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository, DirectionVersionedUpdate } from '../ports/DirectionRepository';
import {
  directionFailure,
  directionVersionConflict,
  type DirectionCommandInput,
} from './directionCommandSupport';

export type MakeDirectionMainInput = DirectionCommandInput;

export class MakeDirectionMain {
  public constructor(
    readonly repository: DirectionRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: MakeDirectionMainInput): Promise<Result<Direction, DomainError>> {
    const directions = await this.repository.findAll();
    const stored = directions.find((direction) => direction.id.equals(input.id));
    if (stored === undefined) {
      return failure(new DomainError('direction.not_found', 'Направление не найдено.'));
    }
    if (stored.version !== input.expectedVersion) return directionVersionConflict();
    if (stored.status !== DIRECTION_STATUS.active) {
      return failure(
        new DomainError(
          'direction.archived_cannot_be_main',
          'Архивное направление нельзя сделать главным.',
        ),
      );
    }

    try {
      const now = this.clock.now();
      const changedTarget = stored.makeMain(now);
      const updates: DirectionVersionedUpdate[] = [];
      if (changedTarget !== stored) {
        updates.push({ direction: changedTarget, expectedVersion: stored.version });
      }
      for (const direction of directions) {
        if (!direction.id.equals(stored.id) && direction.isMain) {
          updates.push({
            direction: direction.removeMain(now),
            expectedVersion: direction.version,
          });
        }
      }
      if (updates.length === 0) return success(stored);
      return (await this.repository.updateManyIfVersionsMatch(updates))
        ? success(changedTarget)
        : directionVersionConflict();
    } catch (error: unknown) {
      return directionFailure(error);
    }
  }
}
