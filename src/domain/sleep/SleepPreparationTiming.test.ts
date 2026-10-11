import { describe, expect, it } from 'vitest';
import { calculateNightWindow } from './NightTime';
import {
  defaultSleepPreparationTiming,
  validateSleepPreparationTiming,
  calculatePreparationStart,
  resolveStretchingItem,
} from './SleepPreparationTiming';

describe('preparation timing', () => {
  it('starts thirty minutes before bed without counting stretching twice', () => {
    const timing = defaultSleepPreparationTiming();
    expect(timing).toEqual({
      totalPreparationMinutes: 30,
      stretchingItemId: null,
      stretchingMinutes: 10,
    });
    const bed = calculateNightWindow({
      cycleDate: '2026-10-10',
      bedtime: '23:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
    }).plannedSleepAt;
    expect(calculatePreparationStart(bed, timing.totalPreparationMinutes).toISOString()).toBe(
      '2026-10-10T13:30:00.000Z',
    );
    expect(bed.toISOString()).toBe('2026-10-10T14:00:00.000Z');
  });
  it('crosses midnight using the full scheduled instant', () => {
    const bed = calculateNightWindow({
      cycleDate: '2026-10-10',
      bedtime: '00:10',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
    }).plannedSleepAt;
    expect(calculatePreparationStart(bed, 30).toISOString()).toBe('2026-10-10T14:40:00.000Z');
    const ny = calculateNightWindow({
      cycleDate: '2026-10-10',
      bedtime: '00:10',
      wakeTime: '07:00',
      timeZone: 'America/New_York',
    }).plannedSleepAt;
    expect(calculatePreparationStart(ny, 30).toISOString()).toBe('2026-10-11T03:40:00.000Z');
  });
  it.each([0, 181, 1.5, NaN])('rejects invalid total %s', (totalPreparationMinutes) => {
    expect(() =>
      validateSleepPreparationTiming({
        ...defaultSleepPreparationTiming(),
        totalPreparationMinutes,
      }),
    ).toThrow();
  });
  it.each([0, 121, 1.5, NaN])('rejects invalid stretching %s', (stretchingMinutes) => {
    expect(() =>
      validateSleepPreparationTiming({ ...defaultSleepPreparationTiming(), stretchingMinutes }),
    ).toThrow();
  });
  it('accepts inclusive limits and requires enough time for selected stretching', () => {
    for (const totalPreparationMinutes of [1, 180])
      expect(() =>
        validateSleepPreparationTiming({
          totalPreparationMinutes,
          stretchingItemId: null,
          stretchingMinutes: 120,
        }),
      ).not.toThrow();
    for (const stretchingMinutes of [1, 120])
      expect(() =>
        validateSleepPreparationTiming({
          totalPreparationMinutes: 180,
          stretchingItemId: 'chosen',
          stretchingMinutes,
        }),
      ).not.toThrow();
    expect(() =>
      validateSleepPreparationTiming({
        totalPreparationMinutes: 30,
        stretchingItemId: 'chosen',
        stretchingMinutes: 31,
      }),
    ).toThrow('общ');
    expect(() =>
      validateSleepPreparationTiming({
        totalPreparationMinutes: 30,
        stretchingItemId: '',
        stretchingMinutes: 10,
      }),
    ).toThrow();
    expect(resolveStretchingItem(defaultSleepPreparationTiming(), [])).toBeNull();
  });
});
