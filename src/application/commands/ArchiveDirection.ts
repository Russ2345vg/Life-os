import type { Direction } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import { changeDirection, type DirectionCommandInput } from './directionCommandSupport';

export type ArchiveDirectionInput = DirectionCommandInput;

export class ArchiveDirection {
  public constructor(
    readonly repository: DirectionRepository,
    readonly clock: Clock,
  ) {}

  public execute(input: ArchiveDirectionInput): Promise<Result<Direction, DomainError>> {
    return changeDirection(this.repository, this.clock, input, (direction, now) =>
      direction.archive(now),
    );
  }
}
