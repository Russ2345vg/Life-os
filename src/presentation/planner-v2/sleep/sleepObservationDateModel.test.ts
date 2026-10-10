import { describe, expect, it } from 'vitest';
import { cycleDateFromWakeDate, localWakeDate } from './sleepObservationDateModel';

describe('sleep observation date selection', () => {
  it('uses the local morning date instead of the next planned night after wake time', () => {
    const wakeDate = localWakeDate(new Date('2026-10-10T00:00:00Z'), 'Asia/Chita');
    expect(wakeDate).toBe('2026-10-10');
    expect(cycleDateFromWakeDate(wakeDate)).toBe('2026-10-09');
  });

  it('keeps date-only arithmetic independent of the machine zone across year boundaries', () => {
    expect(cycleDateFromWakeDate('2026-01-01')).toBe('2025-12-31');
    expect(localWakeDate(new Date('2026-01-01T01:00:00Z'), 'America/Los_Angeles')).toBe(
      '2025-12-31',
    );
  });

  it('rejects missing and invalid civil dates', () => {
    expect(() => cycleDateFromWakeDate('')).toThrow();
    expect(() => cycleDateFromWakeDate('2026-02-30')).toThrow();
  });
});
