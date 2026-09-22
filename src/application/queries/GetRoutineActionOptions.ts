import { LIFE_ACTION_STATUS, type Decision, type LifeAction } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { PlanningRepository } from '../ports/PlanningRepository';
import {
  selectActionOptions,
  selectRecurringActionRepresentatives,
} from '../planner/actionSelection';

export interface RoutineActionOption {
  readonly lifeAction: LifeAction;
  readonly decision: Decision | null;
}

export class GetRoutineActionOptions {
  public constructor(
    readonly lifeActionRepository: LifeActionRepository,
    readonly decisionRepository: DecisionRepository,
    readonly planningRepository?: PlanningRepository,
  ) {}

  public async choices() {
    const state = await this.planningRepository?.read();
    return selectActionOptions(
      state?.actions ?? (await this.lifeActionRepository.findAll?.()) ?? [],
      state?.rules ?? [],
    );
  }
  public async execute(): Promise<readonly RoutineActionOption[]> {
    const [actions = [], decisions] = await Promise.all([
      this.lifeActionRepository.findAll?.(),
      this.decisionRepository.findAll?.(),
    ]);
    const available = selectRecurringActionRepresentatives(
      actions.filter(
        (action) =>
          !action.isArchived() &&
          (action.status === LIFE_ACTION_STATUS.draft ||
            action.status === LIFE_ACTION_STATUS.ready ||
            action.status === LIFE_ACTION_STATUS.inProgress),
      ),
    );
    const decisionById =
      decisions === undefined
        ? null
        : new Map(decisions.map((decision) => [decision.id.toString(), decision]));
    const decisionPromises = new Map<string, Promise<Decision | null>>();

    return Promise.all(
      available.map(async (lifeAction) => {
        if (lifeAction.decisionId === null) {
          return { lifeAction, decision: null };
        }

        const key = lifeAction.decisionId.toString();
        if (decisionById !== null) {
          return { lifeAction, decision: decisionById.get(key) ?? null };
        }

        let decisionPromise = decisionPromises.get(key);
        if (decisionPromise === undefined) {
          decisionPromise = this.decisionRepository.findById(lifeAction.decisionId);
          decisionPromises.set(key, decisionPromise);
        }
        return { lifeAction, decision: await decisionPromise };
      }),
    );
  }
}
