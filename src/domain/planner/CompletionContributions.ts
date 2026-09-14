import type { Goal } from '../goal/Goal';
import type { LifeAction } from '../life-action/LifeAction';
import {
  contributionId,
  type ContributionLink,
  type ProgressContribution,
} from './ProgressContribution';
/** Completion identity, not delivery/event identity, controls exactly-once accounting. */
export function completionContributions(
  actions: readonly LifeAction[],
  goals: readonly Goal[],
  links: readonly ContributionLink[],
  existing: readonly ProgressContribution[],
): ProgressContribution[] {
  const goalIds = new Set(goals.filter((g) => g.measurement !== null).map((g) => g.id.toString()));
  const result = new Map(existing.map((c) => [c.id, c]));
  for (const action of actions) {
    const actionId = action.id.toString();
    if (action.status !== 'completed' || !action.completedAt) continue;
    const at = action.completedAt.toISOString();
    for (const link of links) {
      if (
        link.excludedCompletionKeys?.includes(action.completionKey) ||
        link.removed ||
        !goalIds.has(link.goalId) ||
        link.effectiveFrom > at ||
        !(link.sourceType === 'action'
          ? link.sourceId === actionId
          : link.sourceId === action.occurrence?.ruleId)
      )
        continue;
      const id = contributionId(action.completionKey, link.id);
      if (result.has(id)) continue;
      result.set(id, {
        id,
        goalId: link.goalId,
        actionId,
        completionKey: action.completionKey,
        linkId: link.id,
        source: 'completion',
        amount: link.mode === 'fixed' ? link.amount : null,
        effectiveDate: action.completedOn ?? at.slice(0, 10),
        occurredAt: at,
        voided: false,
        reason: 'Выполнение действия',
        version: 1,
        schemaVersion: 1,
        updatedAt: at,
      });
    }
  }
  return [...result.values()];
}
export function contributionIsEffective(
  contribution: ProgressContribution,
  actions: ReadonlyMap<string, LifeAction>,
): boolean {
  if (contribution.voided) return false;
  if (contribution.actionId === null) return true;
  const action = actions.get(contribution.actionId);
  return action?.status === 'completed' && action.completionKey === contribution.completionKey;
}
