import type { Decision, EntityId, LifeAction } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface RoutineActionDetails {
  readonly lifeAction: LifeAction;
  readonly decision: Decision | null;
}

export class GetRoutineActionDetails {
  public constructor(
    readonly lifeActionRepository: LifeActionRepository,
    readonly decisionRepository: DecisionRepository,
  ) {}

  public async execute(actionId: EntityId): Promise<RoutineActionDetails | null> {
    const lifeAction = await this.lifeActionRepository.findById(actionId);
    if (lifeAction === null) return null;
    return {
      lifeAction,
      decision:
        lifeAction.decisionId === null
          ? null
          : await this.decisionRepository.findById(lifeAction.decisionId),
    };
  }
}
