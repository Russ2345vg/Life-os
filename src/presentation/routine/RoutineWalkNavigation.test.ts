import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  RoutineBlock,
  RoutineBlockRecurrence,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  resolveRoutineOccurrencesForDate,
  type WalkReentryAction,
} from '../../domain';
import {
  createRoutineWalkLaunchRequest,
  routineDestinationFor,
  routineWalkReferenceOf,
} from './RoutineWalkNavigation';

const date = DayDate.create('2026-08-26');
function occurrence(id: string, startTime: string) {
  return resolveRoutineOccurrencesForDate(
    [
      RoutineBlock.create({
        id: EntityId.create(id),
        title: id,
        anchorDate: date,
        startTime,
        endTime: '18:00',
        category: ROUTINE_BLOCK_CATEGORY.other,
        recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
        required: false,
        now: new Date('2026-08-26T00:00:00Z'),
      }),
    ],
    [],
    date,
  )[0]!;
}

describe('Routine Walk navigation', () => {
  it('uses the exact occurrence reference and the first later visible step for preparation', () => {
    const source = occurrence('source', '12:00');
    const hidden = { ...occurrence('hidden', '13:00'), isSkipped: true };
    const moved = { ...occurrence('moved', '14:00'), isRescheduledSource: true };
    const next = occurrence('next', '15:00');
    const launch = createRoutineWalkLaunchRequest(source, [source, hidden, moved, next]);
    expect(launch).toEqual({
      source: {
        routineBlockId: EntityId.create('source'),
        occurrenceDate: date,
        effectiveDate: date,
      },
      sourceTitle: 'source',
      plannedTimeLabel: '12:00–18:00',
      nextStep: 'next',
    });
    expect(createRoutineWalkLaunchRequest(source, [source]).nextStep).toBeNull();
  });

  it('preserves rescheduled occurrence identity instead of using only the visible date', () => {
    const source = {
      ...occurrence('source', '12:00'),
      occurrenceDate: DayDate.create('2026-08-25'),
    };
    expect(routineWalkReferenceOf(source)).toEqual({
      routineBlockId: EntityId.create('source'),
      occurrenceDate: DayDate.create('2026-08-25'),
      effectiveDate: date,
    });
  });

  it('returns to the persisted next occurrence or the source date without inventing a target', () => {
    const source = routineWalkReferenceOf(occurrence('source', '12:00'));
    const next = routineWalkReferenceOf(occurrence('next', '13:00'));
    const action: WalkReentryAction = {
      kind: WALK_REENTRY_ACTION_KIND.resumeContext,
      destination: WALK_RETURN_ORIGIN.routine,
      entity: null,
      nextStep: 'next',
      routineContext: { source, sourceTitle: 'source', next },
    };
    expect(routineDestinationFor(action)).toEqual({ date, focus: next });
    expect(
      routineDestinationFor({
        ...action,
        routineContext: { source, sourceTitle: 'source', next: null },
      }),
    ).toEqual({ date, focus: null });
    expect(routineDestinationFor({ ...action, routineContext: null })).toBeNull();
    expect(
      routineDestinationFor({
        ...action,
        kind: WALK_REENTRY_ACTION_KIND.recovery,
        destination: WALK_RETURN_ORIGIN.today,
      }),
    ).toBeNull();
  });
});
