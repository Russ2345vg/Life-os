import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '..';
import { ROUTINE_EXECUTION_STATUS, RoutineOccurrenceExecution } from './RoutineOccurrenceExecution';

describe('RoutineOccurrenceExecution', () => {
  it('keeps actual timestamps in a separate immutable fact lifecycle', () => {
    const startedAt = new Date('2026-08-08T08:12:00.000Z');
    const execution = RoutineOccurrenceExecution.start({
      id: EntityId.create('execution-1'),
      routineBlockId: EntityId.create('routine-1'),
      occurrenceDate: DayDate.create('2026-08-08'),
      occurredAt: startedAt,
    });
    expect(execution).toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.running,
      version: 1,
      actualEndedAt: null,
    });
    expect(execution.actualStartedAt).toEqual(startedAt);

    const completed = execution.complete(new Date('2026-08-08T08:52:00.000Z'));
    expect(completed).toMatchObject({ status: ROUTINE_EXECUTION_STATUS.completed, version: 2 });
    expect(execution).toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.running,
      actualEndedAt: null,
      version: 1,
    });
  });

  it('supports an explicit abandoned terminal state and rejects an end before start', () => {
    const execution = RoutineOccurrenceExecution.start({
      id: EntityId.create('execution-2'),
      routineBlockId: EntityId.create('routine-2'),
      occurrenceDate: DayDate.create('2026-08-08'),
      occurredAt: new Date('2026-08-08T09:00:00.000Z'),
    });
    expect(execution.abandon(new Date('2026-08-08T09:10:00.000Z')).status).toBe(
      ROUTINE_EXECUTION_STATUS.abandoned,
    );
    expect(() => execution.complete(new Date('2026-08-08T08:59:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'routine_execution.end_before_start' }),
    );
  });
});
