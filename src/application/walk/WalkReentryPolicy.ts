import {
  copyWalkRoutineContext,
  WALK_IMPACT,
  WALK_LINKED_ENTITY_TYPE,
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  type Walk,
  type WalkImpact,
  type WalkLinkedEntity,
  type WalkReentryAction,
  type WalkReturnOrigin,
} from '../../domain';

export interface WalkReentryOutcomeInput {
  readonly impact: WalkImpact;
  readonly reflection?: string;
}

export function resolveWalkReentryAction(
  walk: Walk,
  outcome: WalkReentryOutcomeInput,
): WalkReentryAction {
  const original = walk.returnContext;
  if (
    original?.origin === WALK_RETURN_ORIGIN.decision &&
    original.entity?.type === WALK_LINKED_ENTITY_TYPE.decision
  ) {
    return {
      kind: outcome.reflection?.trim()
        ? WALK_REENTRY_ACTION_KIND.reviewResult
        : WALK_REENTRY_ACTION_KIND.resumeContext,
      destination: WALK_RETURN_ORIGIN.decision,
      entity: original.entity,
      nextStep: null,
      routineContext: null,
    };
  }
  if (outcome.impact === WALK_IMPACT.worse) {
    return todayAction(WALK_REENTRY_ACTION_KIND.recovery);
  }

  const reflection = outcome.reflection?.trim() ?? '';
  const reviewEntity = walk.returnContext?.entity ?? walk.linkedEntity;
  const reviewDestination = reviewDestinationFor(reviewEntity);
  if (reflection.length > 0 && reviewEntity !== null && reviewDestination !== null) {
    return {
      kind: WALK_REENTRY_ACTION_KIND.reviewResult,
      destination: reviewDestination,
      entity: reviewEntity,
      nextStep: null,
      routineContext: null,
    };
  }

  if (walk.returnContext !== null) {
    const nextStep = walk.returnContext.nextStep?.trim() ?? '';
    return {
      kind: WALK_REENTRY_ACTION_KIND.resumeContext,
      destination: walk.returnContext.origin,
      entity: walk.returnContext.entity,
      nextStep: nextStep.length === 0 ? null : nextStep,
      routineContext:
        walk.returnContext.routineContext == null
          ? null
          : copyWalkRoutineContext(walk.returnContext.routineContext),
    };
  }

  return todayAction(WALK_REENTRY_ACTION_KIND.today);
}

function reviewDestinationFor(entity: WalkLinkedEntity | null): WalkReturnOrigin | null {
  switch (entity?.type) {
    case WALK_LINKED_ENTITY_TYPE.decision:
      return WALK_RETURN_ORIGIN.decision;
    case WALK_LINKED_ENTITY_TYPE.goal:
      return WALK_RETURN_ORIGIN.goal;
    case WALK_LINKED_ENTITY_TYPE.project:
      return WALK_RETURN_ORIGIN.project;
    default:
      return null;
  }
}

function todayAction(
  kind: typeof WALK_REENTRY_ACTION_KIND.recovery | typeof WALK_REENTRY_ACTION_KIND.today,
): WalkReentryAction {
  return {
    kind,
    destination: WALK_RETURN_ORIGIN.today,
    entity: null,
    nextStep: null,
    routineContext: null,
  };
}
