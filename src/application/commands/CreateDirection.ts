import { Direction, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { directionFailure } from './directionCommandSupport';

export interface CreateDirectionInput {
  readonly sphereId?: EntityId | null;
  readonly name: string;
  readonly description?: string | null;
  readonly strategicIntent?: string | null;
  readonly desiredState?: string | null;
  readonly inScope?: string | null;
  readonly outOfScope?: string | null;
}

export class CreateDirection {
  public constructor(
    readonly repository: DirectionRepository,
    readonly clock: Clock,
    readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: CreateDirectionInput): Promise<Result<Direction, DomainError>> {
    try {
      const direction = Direction.create({
        id: this.idGenerator.generate(),
        ...(input.sphereId === undefined ? {} : { sphereId: input.sphereId }),
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.strategicIntent === undefined ? {} : { strategicIntent: input.strategicIntent }),
        ...(input.desiredState === undefined ? {} : { desiredState: input.desiredState }),
        ...(input.inScope === undefined ? {} : { inScope: input.inScope }),
        ...(input.outOfScope === undefined ? {} : { outOfScope: input.outOfScope }),
        now: this.clock.now(),
      });
      return (await this.repository.create(direction))
        ? success(direction)
        : failure(new DomainError('direction.id_conflict', 'Не удалось создать направление.'));
    } catch (error: unknown) {
      return directionFailure(error);
    }
  }
}
