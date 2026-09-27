import { DayDate, type LifeAction } from '../../domain';
import type { RecurrenceInput } from './RecurringActions';
import { validateRule } from '../../domain/planner/RecurrenceRule';
import { linkId, type ContributionLink } from '../../domain/planner/ProgressContribution';
import { localDate } from './planningSupport';
import { DomainError } from '../../shared/errors/DomainError';
export interface ActionContributionInput {
  readonly goalId: string;
  readonly mode: 'fixed' | 'actual';
  readonly amount: number;
}
export function actionPlanningSetup(
  action: LifeAction,
  recurrence: RecurrenceInput | null,
  contributions: readonly ActionContributionInput[],
  now: Date,
) {
  const actionId = action.id.toString();
  const rule = recurrence
    ? validateRule({
        ...recurrence,
        title: action.title.toString(),
        need: action.need,
        goalId: action.goalId?.toString() ?? null,
        directionId: action.directionId?.toString() ?? null,
        sphereId: action.sphereId?.toString() ?? null,
        id: `recurrence:${actionId}`,
        revision: 1,
        effectiveFrom: localDate(now),
        version: 1,
        schemaVersion: 1,
        updatedAt: now.toISOString(),
      })
    : null;
  if (rule) {
    if (!action.plannedDate && rule.schedule.kind !== 'count')
      action.setPlan(DayDate.create(rule.startDate), false);
    const originalDate = action.plannedDate?.toString() ?? rule.startDate;
    action.setPlanningMetadata({
      priority: rule.priority,
      occurrence: {
        ruleId: rule.id,
        slot:
          rule.schedule.kind === 'interval' || rule.schedule.kind === 'count'
            ? 'first'
            : originalDate,
        ruleRevision: 1,
        originalDate,
      },
    });
  }
  const links: ContributionLink[] = contributions.map((input) => {
    if (!Number.isFinite(input.amount) || !['fixed', 'actual'].includes(input.mode))
      throw new DomainError('progress.invalid_value', 'Проверьте величину вклада.');
    const sourceType = rule ? 'rule' : 'action',
      sourceId = rule?.id ?? actionId;
    return {
      ...input,
      id: linkId(sourceType, sourceId, input.goalId),
      sourceType,
      sourceId,
      removed: false,
      effectiveFrom: now.toISOString(),
      excludedCompletionKeys: [],
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    };
  });
  if (new Set(links.map((l) => l.id)).size !== links.length)
    throw new DomainError('progress.duplicate_link', 'Цель для вклада выбрана дважды.');
  return { rules: rule ? [rule] : [], links };
}
