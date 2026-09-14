import type { LifeAction } from '../../domain';
import { completionContributions } from '../../domain/planner/CompletionContributions';
import { LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import {
  ContributionLinkRecordMapper,
  ProgressContributionRecordMapper,
} from './PlanningRecordMappers';
export const COMPLETION_CONTRIBUTION_STORES = [
  LIFE_OS_STORE.goals,
  LIFE_OS_STORE.contributionLinks,
  LIFE_OS_STORE.progressContributions,
] as const;
export async function commitCompletionContributions(
  tx: IDBTransaction,
  actions: readonly LifeAction[],
): Promise<void> {
  if (!actions.some((a) => a.status === 'completed')) return;
  const [rawGoals, rawLinks, rawContributions] = await Promise.all(
    COMPLETION_CONTRIBUTION_STORES.map((store) =>
      request<unknown[]>(tx.objectStore(store).getAll()),
    ),
  );
  const goals = rawGoals!.map(GoalRecordMapper.fromRecord),
    links = rawLinks!.map(ContributionLinkRecordMapper.fromRecord),
    contributions = rawContributions!.map(ProgressContributionRecordMapper.fromRecord);
  const existing = new Set(contributions.map((c) => c.id));
  const computed = completionContributions(actions, goals, links, contributions);
  for (const action of actions)
    action.recordContributionManifest(
      computed
        .filter((c) => c.completionKey === action.completionKey)
        .map((c) => ({ id: c.id, goalId: c.goalId })),
    );
  for (const value of computed)
    if (!existing.has(value.id))
      await request(
        tx
          .objectStore(LIFE_OS_STORE.progressContributions)
          .add(ProgressContributionRecordMapper.toRecord(value)),
      );
}
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.addEventListener('success', () => resolve(r.result));
    r.addEventListener('error', () => reject(r.error));
  });
}
