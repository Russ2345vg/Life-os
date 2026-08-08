import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
  RoutineOccurrenceOverride,
  resolveRoutineOccurrencesForDate,
} from '../../domain';
import { resolveRoutinePlanFactPresentation } from './GetRoutinePlanFactForDate';

const DATE = DayDate.create('2026-08-08');

function createBlock(): RoutineBlock {
  return RoutineBlock.create({
    id: EntityId.create('routine-plan-fact'),
    anchorDate: DATE,
    title: 'Фокус',
    startTime: '08:00',
    endTime: '09:00',
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: true,
    now: new Date('2026-08-01T00:00:00.000Z'),
  });
}

describe('routine plan/fact presentation', () => {
  it('compares fact with the delayed effective plan, not the base plan', () => {
    const block = createBlock();
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('delay'),
      routineBlockId: block.id,
      occurrenceDate: DATE,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed,
      startTimeOverride: '08:30',
      now: new Date('2026-08-08T07:00:00'),
    });
    const occurrence = resolveRoutineOccurrencesForDate([block], [override], DATE)[0]!;
    const execution = RoutineOccurrenceExecution.rehydrate({
      id: EntityId.create('execution'),
      routineBlockId: block.id,
      occurrenceDate: DATE,
      actualStartedAt: new Date('2026-08-08T08:42:00'),
      actualEndedAt: new Date('2026-08-08T09:24:00'),
      status: 'completed',
      note: null,
      createdAt: new Date('2026-08-08T08:42:00'),
      updatedAt: new Date('2026-08-08T09:24:00'),
      version: 2,
    });
    const result = resolveRoutinePlanFactPresentation(
      occurrence,
      execution,
      new Date('2026-08-08T10:00:00'),
    );
    expect(result).toMatchObject({
      plannedTimeLabel: '08:30–09:30',
      actualTimeLabel: '08:42–09:24',
      startDeviationMinutes: 12,
      endDeviationMinutes: -6,
      plannedDurationMinutes: 60,
      actualDurationMinutes: 42,
      durationDeviationMinutes: -18,
    });
    expect(block.startTime).toBe('08:00');
    expect(override.startTimeOverride).toBe('08:30');
  });

  it('uses unambiguous signs for early start and a shortened effective plan', () => {
    const block = createBlock();
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('shorten'),
      routineBlockId: block.id,
      occurrenceDate: DATE,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened,
      endTimeOverride: '08:40',
      now: new Date('2026-08-08T07:00:00'),
    });
    const occurrence = resolveRoutineOccurrencesForDate([block], [override], DATE)[0]!;
    const execution = RoutineOccurrenceExecution.rehydrate({
      id: EntityId.create('execution-short'),
      routineBlockId: block.id,
      occurrenceDate: DATE,
      actualStartedAt: new Date('2026-08-08T07:55:00'),
      actualEndedAt: new Date('2026-08-08T08:35:00'),
      status: 'completed',
      note: null,
      createdAt: new Date('2026-08-08T07:55:00'),
      updatedAt: new Date('2026-08-08T08:35:00'),
      version: 2,
    });
    expect(
      resolveRoutinePlanFactPresentation(occurrence, execution, new Date('2026-08-08T09:00:00')),
    ).toMatchObject({
      startDeviationMinutes: -5,
      plannedDurationMinutes: 40,
      actualDurationMinutes: 40,
      durationDeviationMinutes: 0,
    });
  });
});
