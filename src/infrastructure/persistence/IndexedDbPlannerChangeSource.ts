import type {
  CommittedPlannerChanges,
  PlannerDataCollection,
} from '../../application/ports/CommittedPlannerChanges';
import { LIFE_OS_STORE, type LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const collections = new Map<string, PlannerDataCollection>([
  [LIFE_OS_STORE.goals, 'goals'],
  [LIFE_OS_STORE.directions, 'directions'],
  [LIFE_OS_STORE.spheres, 'spheres'],
  [LIFE_OS_STORE.lifeActions, 'lifeActions'],
  [LIFE_OS_STORE.inboxIdeas, 'inboxIdeas'],
  [LIFE_OS_STORE.timeCapacity, 'timeCapacity'],
  [LIFE_OS_STORE.focusPeriods, 'focusPeriods'],
  [LIFE_OS_STORE.planningPeriods, 'planningPeriods'],
  [LIFE_OS_STORE.periodMemberships, 'periodMemberships'],
  [LIFE_OS_STORE.periodDecisions, 'periodDecisions'],
  [LIFE_OS_STORE.recurrenceRules, 'recurrenceRules'],
  [LIFE_OS_STORE.contributionLinks, 'contributionLinks'],
  [LIFE_OS_STORE.progressContributions, 'progressContributions'],
]);

export class IndexedDbPlannerChangeSource implements CommittedPlannerChanges {
  public constructor(private readonly database: LifeOsIndexedDb) {}

  public subscribe(listener: (changed: readonly PlannerDataCollection[]) => void): () => void {
    return this.database.subscribeCommits((stores) => {
      const changed = new Set<PlannerDataCollection>();
      for (const store of stores) {
        const collection = collections.get(store);
        if (collection) changed.add(collection);
      }
      if (changed.size > 0) listener([...changed]);
    });
  }
}
