import type {
  EntityId,
  Goal,
  GoalCoverImage,
  GoalEditableStatus,
  GoalHorizon,
  GoalIntentionLevel,
  GoalProgress,
  GoalStage,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { GoalRepository } from '../ports/GoalRepository';
import {
  goalFailure,
  goalVersionConflict,
  validateGoalExpectedVersion,
} from './goalCommandSupport';

export interface UpdateGoalInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
  readonly title: string;
  readonly description?: string | null;
  readonly whyImportant?: string | null;
  readonly whyNow?: string | null;
  readonly status?: GoalEditableStatus;
  readonly stage?: GoalStage;
  readonly intentionLevel?: GoalIntentionLevel | null;
  readonly horizon?: GoalHorizon | null;
  readonly progress?: GoalProgress | null;
  readonly achievementCriteria?: string | null;
  readonly nextProgress?: string | null;
  readonly coverImage?: GoalCoverImage | null;
}

export class UpdateGoal {
  public constructor(
    readonly repository: GoalRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: UpdateGoalInput): Promise<Result<Goal, DomainError>> {
    const invalidVersion = validateGoalExpectedVersion(input.expectedVersion);
    if (invalidVersion !== null) return invalidVersion;
    const stored = await this.repository.findById(input.id);
    if (stored === null) return failure(new DomainError('goal.not_found', 'Цель не найдена.'));
    if (stored.version !== input.expectedVersion) return goalVersionConflict();
    try {
      const updated = stored.update(
        {
          title: input.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.whyImportant === undefined ? {} : { whyImportant: input.whyImportant }),
          ...(input.whyNow === undefined ? {} : { whyNow: input.whyNow }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.stage === undefined ? {} : { stage: input.stage }),
          ...(input.intentionLevel === undefined ? {} : { intentionLevel: input.intentionLevel }),
          ...(input.horizon === undefined ? {} : { horizon: input.horizon }),
          ...(input.progress === undefined ? {} : { progress: input.progress }),
          ...(input.achievementCriteria === undefined
            ? {}
            : { achievementCriteria: input.achievementCriteria }),
          ...(input.nextProgress === undefined ? {} : { nextProgress: input.nextProgress }),
          ...(input.coverImage === undefined ? {} : { coverImage: input.coverImage }),
        },
        this.clock.now(),
      );
      return (await this.repository.updateIfVersionMatches(updated, input.expectedVersion))
        ? success(updated)
        : goalVersionConflict();
    } catch (error: unknown) {
      return goalFailure(error);
    }
  }
}
