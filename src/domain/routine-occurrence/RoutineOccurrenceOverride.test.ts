import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceOverride,
  createRoutineBlockAssignment,
  resolveRoutineOccurrencesForDate,
} from '..';

const DATE = DayDate.create('2026-08-08');
const TOMORROW = DayDate.create('2026-08-09');
const NOW = new Date('2026-08-08T00:00:00.000Z');

function block(actionId = 'action-a') {
  return RoutineBlock.create({
    id: EntityId.create('block-1'),
    anchorDate: DATE,
    title: 'Работа',
    startTime: '08:00',
    endTime: '09:00',
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.daily),
    required: true,
    assignment: createRoutineBlockAssignment(
      ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      EntityId.create(actionId),
    ),
    now: NOW,
  });
}

function override(
  details: Omit<
    Parameters<typeof RoutineOccurrenceOverride.create>[0],
    'id' | 'routineBlockId' | 'occurrenceDate' | 'now'
  >,
) {
  return RoutineOccurrenceOverride.create({
    id: EntityId.create('override-1'),
    routineBlockId: EntityId.create('block-1'),
    occurrenceDate: DATE,
    ...details,
    now: NOW,
  });
}

describe('routine occurrence resolver', () => {
  it('delays only one date and preserves duration', () => {
    const delayed = override({
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed,
      startTimeOverride: '08:30',
    });
    const today = resolveRoutineOccurrencesForDate([block()], [delayed], DATE)[0]!;
    const tomorrow = resolveRoutineOccurrencesForDate([block()], [delayed], TOMORROW)[0]!;
    expect([today.startTime, today.endTime]).toEqual(['08:30', '09:30']);
    expect([tomorrow.startTime, tomorrow.endTime]).toEqual(['08:00', '09:00']);
  });

  it('keeps a skipped occurrence visible but leaves the next recurrence active', () => {
    const skipped = override({ type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped });
    expect(resolveRoutineOccurrencesForDate([block()], [skipped], DATE)[0]?.isSkipped).toBe(true);
    expect(resolveRoutineOccurrencesForDate([block()], [skipped], TOMORROW)[0]?.isSkipped).toBe(
      false,
    );
  });

  it('suppresses the source and adds a virtual target without hiding the regular target occurrence', () => {
    const moved = override({
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: TOMORROW,
      targetStartTime: '15:00',
    });
    const source = resolveRoutineOccurrencesForDate([block()], [moved], DATE);
    const target = resolveRoutineOccurrencesForDate([block()], [moved], TOMORROW);
    expect(source).toHaveLength(1);
    expect(source[0]).toMatchObject({ isSkipped: true, isRescheduledSource: true });
    expect(target.map((item) => [item.startTime, item.occurrenceDate.toString()])).toEqual([
      ['08:00', '2026-08-09'],
      ['15:00', '2026-08-08'],
    ]);
  });

  it('shortens the plan without changing the source block', () => {
    const shortened = override({
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened,
      endTimeOverride: '08:30',
    });
    expect(resolveRoutineOccurrencesForDate([block()], [shortened], DATE)[0]?.endTime).toBe(
      '08:30',
    );
    expect(block().endTime).toBe('09:00');
  });

  it('replaces only the effective action assignment', () => {
    const replaced = override({
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction,
      replacementActionId: EntityId.create('action-b'),
    });
    const today = resolveRoutineOccurrencesForDate([block()], [replaced], DATE)[0]!;
    const tomorrow = resolveRoutineOccurrencesForDate([block()], [replaced], TOMORROW)[0]!;
    expect(today.assignment).toMatchObject({
      actionId: expect.objectContaining({ value: 'action-b' }),
    });
    expect(tomorrow.assignment).toMatchObject({
      actionId: expect.objectContaining({ value: 'action-a' }),
    });
  });

  it('returns the original plan after the override is removed', () => {
    expect(resolveRoutineOccurrencesForDate([block()], [], DATE)[0]).toMatchObject({
      startTime: '08:00',
      endTime: '09:00',
      deviationType: null,
      isSkipped: false,
    });
  });
});

describe('RoutineOccurrenceOverride', () => {
  it('stores only fields required by its deviation type', () => {
    const item = override({ type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped });
    expect(item).toMatchObject({ version: 1, startTimeOverride: null, replacementActionId: null });
    expect('title' in item).toBe(false);
  });

  it('rejects incompatible copied fields', () => {
    expect(() =>
      override({
        type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped,
        startTimeOverride: '10:00',
      }),
    ).toThrow(expect.objectContaining({ code: 'routine_occurrence_override.unexpected_fields' }));
  });
});
