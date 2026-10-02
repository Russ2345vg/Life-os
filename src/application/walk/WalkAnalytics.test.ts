import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Walk } from '../../domain';
import { analyzeWalks } from './WalkAnalytics';
const now = new Date('2026-10-01T23:50:00Z');
function walk(id: string, minutes: number, paired = false) {
  return Walk.create({
    id: EntityId.create(id),
    date: DayDate.create('2026-10-01'),
    type: 'restorative',
    beforeState: paired ? { energy: 0, tension: 2, clarity: 1 } : null,
    now,
  })
    .start({ mode: 'stopwatch', startedAt: now })
    .complete({ endedAt: new Date(now.getTime() + minutes * 60_000) })
    .reviseReflection({
      result: null,
      impact: null,
      afterState: paired ? { energy: 2, tension: 4, clarity: 3 } : null,
      updatedAt: new Date(now.getTime() + minutes * 60_000),
    });
}
describe('walk analytics', () => {
  it('counts only completed duration, preserves zeros and the saved date across midnight', () => {
    const abandoned = Walk.create({
      id: EntityId.create('abandoned'),
      date: DayDate.create('2026-10-01'),
      type: 'restorative',
      now,
    })
      .start({ mode: 'stopwatch', startedAt: now })
      .abandon(new Date(now.getTime() + 300_000));
    const value = analyzeWalks([walk('ten', 10, true), walk('thirty', 30), abandoned]);
    expect(value).toMatchObject({
      completedCount: 2,
      durationMs: 2_400_000,
      medianDurationMs: 1_200_000,
      activeDays: 1,
      pairedCount: 1,
      abandonedCount: 1,
      meanDelta: { energy: 2, tension: 2, clarity: 2 },
    });
    expect(value.days).toEqual([{ date: '2026-10-01', durationMs: 2_400_000, count: 2 }]);
    expect(value.sourceIds).toEqual(['ten', 'thirty']);
    expect(analyzeWalks([]).meanDelta).toBeNull();
  });
});
