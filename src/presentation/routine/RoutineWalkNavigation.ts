import {
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  sameWalkRoutineOccurrenceReference,
  type DayDate,
  type EffectiveRoutineOccurrence,
  type WalkReentryAction,
  type WalkRoutineOccurrenceReference,
} from '../../domain';

export interface RoutineWalkLaunchRequest {
  readonly source: WalkRoutineOccurrenceReference;
  readonly sourceTitle: string;
  readonly plannedTimeLabel: string;
  readonly nextStep: string | null;
}

export interface RoutineWalkDestinationRequest {
  readonly date: DayDate;
  readonly focus: WalkRoutineOccurrenceReference | null;
}

export function routineWalkReferenceOf(
  occurrence: EffectiveRoutineOccurrence,
): WalkRoutineOccurrenceReference {
  return {
    routineBlockId: occurrence.sourceBlockId,
    occurrenceDate: occurrence.occurrenceDate,
    effectiveDate: occurrence.effectiveDate,
  };
}

export function createRoutineWalkLaunchRequest(
  source: EffectiveRoutineOccurrence,
  occurrences: readonly EffectiveRoutineOccurrence[],
): RoutineWalkLaunchRequest {
  const reference = routineWalkReferenceOf(source);
  const index = occurrences.findIndex((item) =>
    sameWalkRoutineOccurrenceReference(routineWalkReferenceOf(item), reference),
  );
  const next =
    index < 0
      ? undefined
      : occurrences
          .slice(index + 1)
          .find(
            (item) =>
              !item.isSkipped &&
              !item.isRescheduledSource &&
              item.effectiveDate.equals(source.effectiveDate),
          );
  return {
    source: reference,
    sourceTitle: source.title,
    plannedTimeLabel: `${source.effectiveStartTime}–${source.effectiveEndTime}`,
    nextStep: next?.title ?? null,
  };
}

export function routineDestinationFor(
  action: WalkReentryAction,
): RoutineWalkDestinationRequest | null {
  if (
    action.kind !== WALK_REENTRY_ACTION_KIND.resumeContext ||
    action.destination !== WALK_RETURN_ORIGIN.routine ||
    action.routineContext == null
  )
    return null;
  return {
    date: action.routineContext.next?.effectiveDate ?? action.routineContext.source.effectiveDate,
    focus: action.routineContext.next,
  };
}
