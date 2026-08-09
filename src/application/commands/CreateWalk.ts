import { Walk, type DayDate, type EntityId, type WalkType } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { WalkRepository } from '../ports/WalkRepository';

export interface CreateWalkInput {
  readonly date: DayDate;
  readonly type: WalkType;
  readonly sphereId?: EntityId | null;
}

export class CreateWalk {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
    readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: CreateWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const walk = Walk.create({
        id: this.idGenerator.generate(),
        date: input.date,
        type: input.type,
        sphereId: input.sphereId ?? null,
        now: this.clock.now(),
      });
      await this.repository.save(walk);
      return success(walk);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
