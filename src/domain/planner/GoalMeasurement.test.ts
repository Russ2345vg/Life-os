import { describe, expect, it } from 'vitest';
import { measureProgress, type GoalMeasurement } from './GoalMeasurement';
const measurement: GoalMeasurement = {
  mode: 'count',
  target: 66,
  unit: 'выполнений',
  direction: 'at_least',
  start: 0,
  cycle: null,
};
describe('quantitative goal projections', () => {
  it('shows honest count and no progress for qualitative goals', () => {
    expect(measureProgress(null, 44)).toBeNull();
    expect(measureProgress(measurement, 44)).toMatchObject({
      current: 44,
      remaining: 22,
      reached: false,
    });
    expect(measureProgress(measurement, 44)?.percent).toBeCloseTo(66.6667, 3);
  });
  it('measures decreasing goals from their start and preserves overshoot', () => {
    expect(
      measureProgress(
        { ...measurement, mode: 'numeric', start: 90, target: 75, direction: 'at_most' },
        80,
      ),
    ).toMatchObject({ remaining: 5, reached: false });
    expect(measureProgress(measurement, 70)).toMatchObject({
      current: 70,
      percent: 100,
      reached: true,
    });
  });
});
