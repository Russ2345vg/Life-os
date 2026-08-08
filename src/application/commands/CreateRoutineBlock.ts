import { RoutineBlock } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import {
  routineBlockDetails,
  routineBlockFailure,
  type RoutineBlockDetailsInput,
} from './routineBlockCommandSupport';

export type CreateRoutineBlockInput = RoutineBlockDetailsInput;

export class CreateRoutineBlock {
  public constructor(
    readonly repository: RoutineBlockRepository,
    readonly clock: Clock,
    readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: CreateRoutineBlockInput): Promise<Result<RoutineBlock, DomainError>> {
    try {
      const block = RoutineBlock.create({
        id: this.idGenerator.generate(),
        ...routineBlockDetails(input),
        now: this.clock.now(),
      });
      await this.repository.save(block);
      return success(block);
    } catch (error: unknown) {
      return routineBlockFailure(error);
    }
  }
}
