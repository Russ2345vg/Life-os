import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '../../domain';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { selectRepeatedPlanActions } from './plannerPlanReviewModel';

describe('plan review', () => {
  it('selects repeatedly rescheduled secondary actions without duplicating overdue or main', () => {
    const repeated = createReadyLifeAction('repeat', DayDate.create('2026-09-24'));
    repeated.reschedule(
      DayDate.create('2026-09-25'),
      new Date('2026-09-24T10:00Z'),
      EntityId.create('move-1'),
    );
    repeated.reschedule(
      DayDate.create('2026-09-27'),
      new Date('2026-09-25T10:00Z'),
      EntityId.create('move-2'),
    );
    const regular = createReadyLifeAction('regular', DayDate.create('2026-09-27'));
    expect(
      selectRepeatedPlanActions({
        main: null,
        actions: [regular, repeated],
        overdue: [],
        unscheduled: [],
        completed: [],
      }),
    ).toEqual([repeated]);
    expect(
      selectRepeatedPlanActions({
        main: repeated,
        actions: [regular],
        overdue: [],
        unscheduled: [],
        completed: [],
      }),
    ).toEqual([]);
  });
});
