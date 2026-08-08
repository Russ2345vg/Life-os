import { DECISION_STATUS, type Decision } from '../domain';

export const DECISION_FILTER = {
  all: 'all',
  planned: DECISION_STATUS.planned,
  inProgress: DECISION_STATUS.inProgress,
  confirmed: DECISION_STATUS.confirmed,
  cancelled: DECISION_STATUS.cancelled,
  draft: DECISION_STATUS.draft,
  archived: 'archived',
} as const;

export type DecisionFilter = (typeof DECISION_FILTER)[keyof typeof DECISION_FILTER];

export function filterDecisions(
  decisions: readonly Decision[],
  filter: DecisionFilter,
): readonly Decision[] {
  if (filter === DECISION_FILTER.all) {
    return decisions.filter((decision) => !decision.isDeleted());
  }

  if (filter === DECISION_FILTER.archived) {
    return decisions.filter((decision) => !decision.isDeleted() && decision.archivedAt !== null);
  }

  return decisions.filter(
    (decision) =>
      !decision.isDeleted() && decision.archivedAt === null && decision.status === filter,
  );
}
