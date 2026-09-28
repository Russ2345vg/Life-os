import { describe, expect, it } from 'vitest';
import { DayDate, type LifeAction } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { buildTimeScheduleDay } from './GetTimeSchedule';

const date = DayDate.create('2026-09-28');
function planned(
  id: string,
  start: number | null,
  duration: number | null,
  estimate: number | null,
): LifeAction {
  const action = createLifeActionDraft(id);
  action.setPlan(date, false);
  action.setTimePlanning({
    estimateMinutes: estimate,
    scheduledStartMinute: start,
    scheduledDurationMinutes: duration,
  });
  return action;
}

describe('buildTimeScheduleDay', () => {
  it('counts blocks and untimed estimates without treating unknown estimates as zero', () => {
    const day = buildTimeScheduleDay(
      date.toString(),
      [
        planned('first', 600, 60, 90),
        planned('second', null, null, 30),
        planned('third', null, null, null),
      ],
      null,
    );
    expect(day.scheduledMinutes).toBe(60);
    expect(day.untimedEstimateMinutes).toBe(30);
    expect(day.plannedMinutes).toBe(90);
    expect(day.unknownEstimateCount).toBe(1);
    expect(day.capacityMinutes).toBeNull();
    expect(day.utilization).toBeNull();
  });

  it('marks remote-imported overlaps and overcapacity while adjacent blocks remain valid', () => {
    const first = planned('first', 600, 60, 60);
    const overlap = planned('overlap', 630, 60, 60);
    const adjacent = planned('adjacent', 690, 30, 30);
    const day = buildTimeScheduleDay(date.toString(), [first, overlap, adjacent], 120);
    expect(day.conflictIds).toEqual(new Set(['first', 'overlap']));
    expect(day.utilization).toBe(1.25);
    expect(day.overCapacity).toBe(true);
  });
});
