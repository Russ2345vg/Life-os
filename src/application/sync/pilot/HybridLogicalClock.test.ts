import { describe, expect, it } from 'vitest';
import {
  HybridLogicalClock,
  MAX_HLC_LOGICAL,
  compareHybridLogicalTimestamp,
} from './HybridLogicalClock';

describe('HybridLogicalClock', () => {
  it('stays monotonic under equal and backward wall clocks', () => {
    const clock = new HybridLogicalClock({ wallTime: 100, logical: 0 });
    expect(clock.tick(100)).toEqual({ wallTime: 100, logical: 1 });
    expect(clock.tick(90)).toEqual({ wallTime: 100, logical: 2 });
  });

  it('merges remote timestamps and defines device tie-breaking', () => {
    const clock = new HybridLogicalClock({ wallTime: 100, logical: 2 });
    expect(clock.merge({ wallTime: 100, logical: 5 }, 90)).toEqual({ wallTime: 100, logical: 6 });
    expect(
      compareHybridLogicalTimestamp(
        { wallTime: 100, logical: 6, deviceId: 'device-a' },
        { wallTime: 100, logical: 6, deviceId: 'device-b' },
      ),
    ).toBeLessThan(0);
  });

  it('fails closed on logical overflow', () => {
    const clock = new HybridLogicalClock({ wallTime: 100, logical: MAX_HLC_LOGICAL });
    expect(() => clock.tick(90)).toThrow(/переполнен/u);
  });
});
