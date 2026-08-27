import {
  Walk,
  type DayDate,
  type EntityId,
  type WalkIntent,
  type WalkLinkedEntity,
  type WalkReflectionTemplate,
  type WalkReturnContext,
  type WalkStateSnapshot,
  type WalkType,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { WalkRepository } from '../ports/WalkRepository';
import { walkReflectionTemplateForIntent, walkTypeForIntent } from '../walk/WalkCreationDefaults';

interface CreateWalkBaseInput {
  readonly date: DayDate;
  readonly sphereId?: EntityId | null;
  readonly beforeState?: WalkStateSnapshot | null;
  readonly linkedEntity?: WalkLinkedEntity | null;
  readonly returnContext?: WalkReturnContext | null;
  readonly reflectionTemplate?: WalkReflectionTemplate;
}

export type CreateWalkInput = CreateWalkBaseInput &
  (
    | { readonly intent: WalkIntent; readonly type?: never }
    | { readonly type: WalkType; readonly intent?: never }
  );

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
        type: input.intent ? walkTypeForIntent(input.intent) : input.type,
        sphereId: input.sphereId ?? null,
        intent: input.intent ?? null,
        reflectionTemplate: input.intent
          ? walkReflectionTemplateForIntent(input.intent, input.reflectionTemplate)
          : (input.reflectionTemplate ?? null),
        beforeState: input.beforeState ?? null,
        linkedEntity: input.linkedEntity ?? null,
        returnContext: input.returnContext ?? null,
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
