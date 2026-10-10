import { describe, expect, it } from 'vitest';
import {
  freeScheduleIntervals,
  scheduleConflictIds,
  type AutopilotScheduleBlock,
} from './AutopilotSchedule';
function block(id: string, startMinute: number, endMinute: number): AutopilotScheduleBlock {
  return {
    id,
    startMinute,
    endMinute,
    kind: 'manual',
    title: id,
    sourceId: id,
    actionId: null,
    protected: true,
  };
}
describe('schedule interval projection', () => {
  it('subtracts overlapping constraints once and preserves adjacent gaps', () => {
    expect(
      freeScheduleIntervals(0, 100, [block('a', 10, 40), block('b', 30, 50), block('c', 60, 80)]),
    ).toEqual([
      { startMinute: 0, endMinute: 10 },
      { startMinute: 50, endMinute: 60 },
      { startMinute: 80, endMinute: 100 },
    ]);
    expect([
      ...scheduleConflictIds([block('a', 10, 40), block('b', 30, 50), block('c', 50, 80)]),
    ]).toEqual(['a', 'b']);
  });
});
