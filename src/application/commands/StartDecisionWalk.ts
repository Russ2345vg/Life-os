import {
  WALK_INTENT,
  WALK_MODE,
  WALK_REFLECTION_TEMPLATE,
  type EntityId,
  type Walk,
  type WalkReflectionTemplate,
  type WalkStateSnapshot,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Result } from '../../shared/result/Result';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { GetActiveWalk } from '../queries/GetActiveWalk';
import type { GetDecisionById } from '../queries/GetDecisionById';
import type { CreateWalk } from './CreateWalk';
import type { StartWalk } from './StartWalk';

export const DECISION_WALK_DEFAULT_QUESTION = 'Что мне нужно понять, чтобы принять это решение?';

export interface StartDecisionWalkInput {
  readonly decisionId: EntityId;
  readonly timerTargetMinutes: number;
  readonly reflectionQuestion?: string;
  readonly reflectionTemplate?: WalkReflectionTemplate;
  readonly beforeState?: WalkStateSnapshot | null;
}

interface StartDecisionWalkDependencies {
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getActiveWalk: Pick<GetActiveWalk, 'execute'>;
  readonly createWalk: Pick<CreateWalk, 'execute'>;
  readonly startWalk: Pick<StartWalk, 'execute'>;
  readonly currentDateProvider: CurrentDateProvider;
}

/** Adds source context only. All execution invariants remain in the existing Walk commands. */
export class StartDecisionWalk {
  public constructor(private readonly dependencies: StartDecisionWalkDependencies) {}

  public async execute(input: StartDecisionWalkInput): Promise<Result<Walk, DomainError>> {
    const source = await this.dependencies.getDecisionById.execute(input.decisionId);
    if (!source.ok || source.value.isDeleted()) {
      return failure(new DomainError('decision.not_found', 'Связанное решение больше недоступно'));
    }
    // Avoid creating a planned Walk for a known active session. StartWalk's CAS is authoritative.
    if (await this.dependencies.getActiveWalk.execute()) {
      return failure(
        new DomainError('walk.another_running', 'Сначала завершите текущую прогулку.'),
      );
    }
    const entity = { type: 'decision', id: source.value.id } as const;
    const created = await this.dependencies.createWalk.execute({
      date: this.dependencies.currentDateProvider.getCurrentDate(),
      intent: WALK_INTENT.reflection,
      reflectionTemplate: input.reflectionTemplate ?? WALK_REFLECTION_TEMPLATE.decision,
      beforeState: input.beforeState ?? null,
      linkedEntity: entity,
      returnContext: { origin: 'decision', entity, nextStep: null },
    });
    if (!created.ok) return created;
    return this.dependencies.startWalk.execute({
      walkId: created.value.id,
      mode: WALK_MODE.timer,
      timerTargetMinutes: input.timerTargetMinutes,
      reflectionQuestion: input.reflectionQuestion?.trim() || DECISION_WALK_DEFAULT_QUESTION,
    });
  }
}
