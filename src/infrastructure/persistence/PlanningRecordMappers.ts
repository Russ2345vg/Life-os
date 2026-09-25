import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../../domain/day/DayDate';
import {
  assertPlanningRecord,
  validatePeriod,
  type PlanningPeriod,
  type PeriodMembership,
  type PeriodDecision,
  type PlanningRecord,
} from '../../domain/planner/PlanningPeriod';
import { validateRule, type RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import type {
  ContributionLink,
  ProgressContribution,
} from '../../domain/planner/ProgressContribution';
function requireValue(condition: unknown): asserts condition {
  if (!condition)
    throw new DomainError('planning.invalid_record', 'Запись планирования повреждена.');
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function mapper<T extends PlanningRecord>(validate: (record: T) => void) {
  return {
    toRecord: (record: T): T => {
      validate(record);
      return { ...record };
    },
    fromRecord: (value: unknown): T => {
      requireValue(value && typeof value === 'object' && !Array.isArray(value));
      const record = value as T;
      assertPlanningRecord(record);
      validate(record);
      return Object.freeze({ ...record });
    },
  };
}
export const PlanningPeriodRecordMapper = mapper<PlanningPeriod>(validatePeriod);
const recurrenceMapper = mapper<RecurrenceRule>(validateRule);
export const RecurrenceRuleRecordMapper = {
  toRecord: (record: RecurrenceRule): RecurrenceRule => ({ ...validateRule(record) }),
  fromRecord: (value: unknown): RecurrenceRule => validateRule(recurrenceMapper.fromRecord(value)),
};
export const PeriodMembershipRecordMapper = mapper<PeriodMembership>((r) => {
  requireValue(
    text(r.periodId) &&
      text(r.entityId) &&
      ['goal', 'action', 'rule'].includes(r.entityType) &&
      typeof r.focused === 'boolean' &&
      typeof r.removed === 'boolean',
  );
});
export const PeriodDecisionRecordMapper = mapper<PeriodDecision>((r) => {
  requireValue(
    text(r.periodId) &&
      text(r.entityId) &&
      ['goal', 'action', 'rule'].includes(r.entityType) &&
      ['continue', 'unplanned', 'stop', 'achieved'].includes(r.decision) &&
      text(r.statusAtDecision) &&
      (r.targetPeriodId === null || text(r.targetPeriodId)),
  );
});
export const ContributionLinkRecordMapper = mapper<ContributionLink>((r) => {
  requireValue(
    (r.excludedCompletionKeys === undefined ||
      (Array.isArray(r.excludedCompletionKeys) && r.excludedCompletionKeys.every(text))) &&
      text(r.sourceId) &&
      text(r.goalId) &&
      ['action', 'rule'].includes(r.sourceType) &&
      ['fixed', 'actual'].includes(r.mode) &&
      Number.isFinite(r.amount) &&
      typeof r.removed === 'boolean' &&
      Number.isFinite(Date.parse(r.effectiveFrom)),
  );
});
export const ProgressContributionRecordMapper = mapper<ProgressContribution>((r) => {
  requireValue(
    text(r.goalId) &&
      (r.actionId === null || text(r.actionId)) &&
      (r.linkId === null || text(r.linkId)) &&
      (r.completionKey === null || text(r.completionKey)) &&
      ['completion', 'manual', 'backfill', 'initial'].includes(r.source) &&
      (r.amount === null || Number.isFinite(r.amount)) &&
      typeof r.voided === 'boolean' &&
      typeof r.reason === 'string' &&
      Number.isFinite(Date.parse(r.occurredAt)),
  );
  DayDate.create(r.effectiveDate);
});
