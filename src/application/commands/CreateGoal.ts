import type { GoalMeasurement } from '../../domain/planner/GoalMeasurement';
import {
  type EntityId,
  Goal,
  GOAL_STATUS,
  type GoalCoverImage,
  type GoalCreationStatus,
  type GoalHorizon,
  type GoalIntentionLevel,
  type GoalProgress,
  type GoalStage,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { GoalRepository } from '../ports/GoalRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { goalFailure, validateGoalDirection } from './goalCommandSupport';

export interface CreateGoalInput {
  readonly measurement?: GoalMeasurement | null;
  readonly dueDate?: string | null;
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly whyImportant?: string | null;
  readonly whyNow?: string | null;
  readonly status?: GoalCreationStatus;
  readonly stage?: GoalStage;
  readonly intentionLevel?: GoalIntentionLevel | null;
  readonly horizon?: GoalHorizon | null;
  readonly progress?: GoalProgress | null;
  readonly achievementCriteria?: string | null;
  readonly nextProgress?: string | null;
  readonly coverImage?: GoalCoverImage | null;
}

export class CreateGoal {
  public constructor(
    readonly repository: GoalRepository,
    readonly directionRepository: DirectionRepository,
    readonly clock: Clock,
    readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: CreateGoalInput): Promise<Result<Goal, DomainError>> {
    const directionId = input.directionId ?? null;
    const status = input.status ?? GOAL_STATUS.future;
    const directionFailure = await validateGoalDirection(this.directionRepository, directionId);
    if (directionFailure !== null) return directionFailure;
    try {
      const goal = Goal.create({
        id: this.idGenerator.generate(),
        directionId,
        sphereId:
          directionId === null
            ? (input.sphereId ?? null)
            : ((await this.directionRepository.findById(directionId))?.sphereId ?? null),
        title: input.title,
        measurement: input.measurement ?? null,
        dueDate: input.dueDate ?? null,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.whyImportant === undefined ? {} : { whyImportant: input.whyImportant }),
        ...(input.whyNow === undefined ? {} : { whyNow: input.whyNow }),
        status,
        ...(input.stage === undefined ? {} : { stage: input.stage }),
        ...(input.intentionLevel === undefined ? {} : { intentionLevel: input.intentionLevel }),
        ...(input.horizon === undefined ? {} : { horizon: input.horizon }),
        ...(input.progress === undefined ? {} : { progress: input.progress }),
        ...(input.achievementCriteria === undefined
          ? {}
          : { achievementCriteria: input.achievementCriteria }),
        ...(input.nextProgress === undefined ? {} : { nextProgress: input.nextProgress }),
        ...(input.coverImage === undefined ? {} : { coverImage: input.coverImage }),
        now: this.clock.now(),
      });
      return (await this.repository.create(goal))
        ? success(goal)
        : failure(new DomainError('goal.id_conflict', 'Не удалось создать цель.'));
    } catch (error: unknown) {
      return goalFailure(error);
    }
  }
}
