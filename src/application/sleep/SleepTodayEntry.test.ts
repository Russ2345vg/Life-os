import { describe, expect, it } from 'vitest';
import { createEmptySleepSchedule, updateSleepSettings } from '../../domain/sleep/SleepSchedule';
import { selectSleepTodayEntry } from './SleepTodayEntry';

describe('selectSleepTodayEntry', () => {
  const state = updateSleepSettings(
    createEmptySleepSchedule(),
    { bedtime: '22:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: true },
    new Date('2026-09-20T08:00:00.000Z'),
  );

  it('keeps a neutral manual entry before the sixty-minute preparation window', () => {
    expect(selectSleepTodayEntry(state, new Date('2026-09-20T11:59:00.000Z'))).toMatchObject({
      active: false,
      cycleDate: '2026-09-20',
    });
  });

  it('keeps the preparation card active from minus sixty through the local morning', () => {
    expect(selectSleepTodayEntry(state, new Date('2026-09-20T12:00:00.000Z'))).toMatchObject({
      active: true,
      cycleDate: '2026-09-20',
    });
    expect(selectSleepTodayEntry(state, new Date('2026-09-20T20:00:00.000Z'))).toMatchObject({
      active: true,
      cycleDate: '2026-09-20',
    });
  });
});
