import { describe, expect, it } from 'vitest';
import {
  calculateNightWindow,
  nominalSleepDurationMinutes,
  resolveSleepCycleDate,
} from './NightTime';

describe('nominalSleepDurationMinutes', () => {
  it('counts the interval to next morning and makes equal times explicit as a full day', () => {
    expect(nominalSleepDurationMinutes('23:30', '07:00')).toBe(450);
    expect(nominalSleepDurationMinutes('22:00', '06:00')).toBe(480);
    expect(nominalSleepDurationMinutes('08:00', '08:00')).toBe(1440);
  });
});

describe('calculateNightWindow', () => {
  it('keeps the wake time on the local day after an evening bedtime', () => {
    const window = calculateNightWindow({
      cycleDate: '2026-09-20',
      bedtime: '22:30',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
    });

    expect(window.plannedSleepAt.toISOString()).toBe('2026-09-20T13:30:00.000Z');
    expect(window.plannedWakeAt.toISOString()).toBe('2026-09-20T22:00:00.000Z');
  });

  it('assigns a bedtime after midnight to the following local day', () => {
    const window = calculateNightWindow({
      cycleDate: '2026-09-20',
      bedtime: '01:00',
      wakeTime: '08:00',
      timeZone: 'Asia/Chita',
    });

    expect(window.plannedSleepAt.toISOString()).toBe('2026-09-20T16:00:00.000Z');
    expect(window.plannedWakeAt.toISOString()).toBe('2026-09-20T23:00:00.000Z');
  });

  it('moves a nonexistent DST wall time to the first valid instant after the gap', () => {
    const window = calculateNightWindow({
      cycleDate: '2026-03-28',
      bedtime: '02:30',
      wakeTime: '08:00',
      timeZone: 'Europe/Berlin',
    });

    expect(window.plannedSleepAt.toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(window.plannedWakeAt.toISOString()).toBe('2026-03-29T06:00:00.000Z');
  });

  it('chooses the first instant in a repeated DST hour', () => {
    const window = calculateNightWindow({
      cycleDate: '2026-10-24',
      bedtime: '02:30',
      wakeTime: '08:00',
      timeZone: 'Europe/Berlin',
    });

    expect(window.plannedSleepAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(window.plannedWakeAt.toISOString()).toBe('2026-10-25T07:00:00.000Z');
  });
});

describe('resolveSleepCycleDate', () => {
  it('keeps the previous cycle after midnight until the configured wake time', () => {
    expect(resolveSleepCycleDate(new Date('2026-09-20T20:30:00.000Z'), 'Asia/Chita', '07:00')).toBe(
      '2026-09-20',
    );
  });

  it('uses the local calendar day after the configured wake time', () => {
    expect(resolveSleepCycleDate(new Date('2026-09-20T23:30:00.000Z'), 'Asia/Chita', '07:00')).toBe(
      '2026-09-21',
    );
  });
});
