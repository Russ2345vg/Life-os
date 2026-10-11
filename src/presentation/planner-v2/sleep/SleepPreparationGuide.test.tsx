import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createEmptySleepSchedule,
  ensureNightCycle,
  updateSleepSettings,
} from '../../../domain/sleep/SleepSchedule';
import { SleepPreparationGuide } from './SleepPreparationGuide';

describe('SleepPreparationGuide', () => {
  const now = new Date('2026-10-10T10:00Z');
  const state = updateSleepSettings(
    createEmptySleepSchedule(),
    { bedtime: '23:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: true },
    now,
  );
  const cycle = ensureNightCycle(state, {
    cycleDate: '2026-10-10',
    cycleId: 'night',
    createdAt: now,
  }).cycle;
  const render = (busy = false) =>
    renderToStaticMarkup(
      createElement(SleepPreparationGuide, {
        cycle,
        busy,
        stretchingItemId: null,
        stretchingMinutes: 10,
        onComplete: () => {},
        onFinish: () => {},
      }),
    );
  it('offers a guided start without replacing the saved checklist', () => {
    expect(render()).toContain('Начать подготовку');
    expect(render()).toContain('Пошаговая подготовка');
  });
  it('disables the start during a pending application mutation', () => {
    expect(render(true)).toMatch(/disabled=""[^>]*>Начать подготовку/);
  });
});
