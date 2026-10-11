import { describe, expect, it } from 'vitest';
import type { NightCycle } from '../../../domain/sleep/SleepSchedule';
import {
  selectPreparationStep,
  startPreparationTimer,
  pausePreparationTimer,
  resumePreparationTimer,
  preparationTimerRemaining,
} from './sleepPreparationGuideModel';

describe('sleep preparation guide', () => {
  const cycle: NightCycle = {
    id: 'night-1',
    cycleDate: '2026-10-10',
    plannedSleepAt: new Date('2026-10-10T12:00Z'),
    plannedWakeAt: new Date('2026-10-10T22:00Z'),
    createdAt: new Date('2026-10-10T10:00Z'),
    preparationCompletionKind: null,
    preparationCompletedAt: null,
    preparationItems: [
      {
        id: 'done',
        title: 'Вода',
        groupId: 'room',
        groupTitle: 'Комната',
        position: 0,
        status: 'DONE',
      },
      {
        id: 'first',
        title: 'Кровать',
        groupId: 'room',
        groupTitle: 'Комната',
        position: 1,
        status: 'PENDING',
      },
      {
        id: 'next',
        title: 'Растяжка',
        groupId: 'personal',
        groupTitle: 'Личное',
        position: 0,
        status: 'PENDING',
      },
    ],
  };
  it('resumes the first pending snapshot item in its saved order', () => {
    expect(selectPreparationStep(cycle)).toMatchObject({
      current: { id: 'first' },
      next: { id: 'next' },
      done: 1,
      total: 3,
    });
  });
  it('does not reopen a finished or skipped night', () => {
    expect(
      selectPreparationStep({ ...cycle, preparationCompletionKind: 'WITH_SKIPS' }).current,
    ).toBeNull();
    expect(selectPreparationStep({ ...cycle, preparationItems: [] }).current).toBeNull();
  });
  it('uses elapsed deadline time, pauses and resumes without restarting duration', () => {
    const timer = startPreparationTimer(2, 1000);
    expect(preparationTimerRemaining(timer, 61000)).toBe(60000);
    const paused = pausePreparationTimer(timer, 61000);
    expect(preparationTimerRemaining(paused, 200000)).toBe(60000);
    const resumed = resumePreparationTimer(paused, 200000);
    expect(preparationTimerRemaining(resumed, 260000)).toBe(0);
    expect(preparationTimerRemaining(resumed, 800000)).toBe(0);
  });
  it.each([0, -1, 121, 1.5, Number.NaN])('rejects invalid duration %s', (minutes) => {
    expect(() => startPreparationTimer(minutes, 1000)).toThrow();
  });
});
