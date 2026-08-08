import { LIFE_ACTION_STATUS, type Decision, type LifeAction } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface RoutineActionOption {
  readonly lifeAction: LifeAction;
  readonly decision: Decision | null;
}

export class GetRoutineActionOptions {
  public constructor(
    readonly lifeActionRepository: LifeActionRepository,
    readonly decisionRepository: DecisionRepository,
  ) {}

  public async execute(): Promise<readonly RoutineActionOption[]> {
    const actions = (await this.lifeActionRepository.findAll?.()) ?? [];
    const available = actions.filter(
      (action) =>
        !action.isArchived() &&
        (action.status === LIFE_ACTION_STATUS.draft ||
          action.status === LIFE_ACTION_STATUS.ready ||
          action.status === LIFE_ACTION_STATUS.inProgress),
    );

    return Promise.all(
      available.map(async (lifeAction) => ({
        lifeAction,
        decision:
          lifeAction.decisionId === null
            ? null
            : await this.decisionRepository.findById(lifeAction.decisionId),
      })),
    );
  }
}
