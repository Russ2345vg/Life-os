import { describe, expect, it } from 'vitest';
import { resolveSleepPageMode } from './sleepPageMode';

describe('sleep page mode', () => {
  const settings = { bedtime: '22:30', wakeTime: '08:00', timeZone: 'Asia/Chita' };
  it.each([
    ['2026-10-04T00:00:00Z', 'MORNING'],
    ['2026-10-04T06:14:00Z', 'MORNING'],
    ['2026-10-04T06:15:00Z', 'EVENING'],
    ['2026-10-04T16:00:00Z', 'EVENING'],
  ] as const)('uses the saved timezone and awake midpoint at %s', (now, mode) => {
    expect(resolveSleepPageMode(new Date(now), settings)).toBe(mode);
  });
  it('handles an awake interval crossing midnight', () => {
    const shifted = { bedtime: '06:00', wakeTime: '14:00', timeZone: 'UTC' };
    expect(resolveSleepPageMode(new Date('2026-10-04T20:00:00Z'), shifted)).toBe('MORNING');
    expect(resolveSleepPageMode(new Date('2026-10-05T02:00:00Z'), shifted)).toBe('EVENING');
  });
});
