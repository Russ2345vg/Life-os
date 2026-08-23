import {
  ActualResultSummary,
  DayDate,
  Decision,
  DecisionCancelReason,
  DecisionTitle,
  DECISION_KIND,
  EntityId,
  ExpectedResult,
  type DecisionKind,
} from '../../domain';

const CREATED_AT = new Date('2026-08-01T08:00:00.000+09:00');
const CHANGED_AT = new Date('2026-08-01T09:00:00.000+09:00');

export function decisionId(value: string): EntityId {
  return EntityId.create(value);
}

export function createDecisionDraft(
  id: string,
  kind: DecisionKind = DECISION_KIND.additional,
  projectId?: EntityId,
): Decision {
  return Decision.createDraft({
    id: decisionId(id),
    title: DecisionTitle.create(`Решение ${id}`),
    kind,
    ...(kind === DECISION_KIND.main
      ? { expectedResult: ExpectedResult.create(`Результат ${id}`) }
      : {}),
    ...(projectId === undefined ? {} : { projectId }),
    occurredAt: CREATED_AT,
    eventId: decisionId(`${id}-draft-event`),
  });
}

export function createPlannedDecision(
  id: string,
  date: DayDate,
  kind: DecisionKind = DECISION_KIND.main,
  order = 1,
  projectId?: EntityId,
): Decision {
  const decision = createDecisionDraft(id, kind, projectId);
  decision.plan({
    plannedDate: date,
    kind,
    ...(kind === DECISION_KIND.main
      ? { order, expectedResult: ExpectedResult.create(`Результат ${id}`) }
      : {}),
    occurredAt: CHANGED_AT,
    eventId: decisionId(`${id}-planned-event`),
  });
  return decision;
}

export function markDecisionInProgress(decision: Decision): Decision {
  decision.markInProgress(CHANGED_AT, decisionId(`${decision.id.toString()}-started-event`));
  return decision;
}

export function cancelDecision(decision: Decision): Decision {
  decision.cancel(
    CHANGED_AT,
    decisionId(`${decision.id.toString()}-cancelled-event`),
    DecisionCancelReason.create('Решение больше не актуально'),
  );
  return decision;
}

export function confirmDecision(decision: Decision): Decision {
  markDecisionInProgress(decision);
  decision.confirm(
    ActualResultSummary.create('Результат подтверждён'),
    [decisionId(`${decision.id.toString()}-evidence`)],
    CHANGED_AT,
    decisionId(`${decision.id.toString()}-confirmed-event`),
  );
  return decision;
}

export function archiveDecision(decision: Decision): Decision {
  if (!decision.isArchived()) {
    decision.archive(CHANGED_AT, decisionId(`${decision.id.toString()}-archived-event`));
  }
  return decision;
}
