import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createWakeObservationDraft } from '../../../domain/sleep/SleepObservation';
import { SleepObservationForm } from './SleepObservationForm';
import { observationWindowFromTimes } from './sleepObservationFormModel';

describe('SleepObservationForm', () => {
  it('prefills the planned bedtime only as an editable suggestion and labels the alarm wake', () => {
    const observation = createWakeObservationDraft({
      id: 'sleep-observation:2026-10-03',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wakeOccurrenceId: 'wake-1',
      wakeKind: 'QR',
      wokeAt: new Date('2026-10-04T00:40:00.000Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-10-04T00:41:00.000Z'),
    });

    const html = renderToStaticMarkup(
      createElement(SleepObservationForm, {
        cycleDate: '2026-10-03',
        timeZone: 'Asia/Chita',
        plannedWentToBedAt: new Date('2026-10-03T14:30:00.000Z'),
        observation,
        busy: false,
        error: null,
        saved: false,
        onSave: vi.fn(),
      }),
    );

    expect(html).toContain('Во сколько лёг?');
    expect(html).toContain('name="wentToBed"');
    expect(html).toContain('value="23:30"');
    expect(html).toContain('Во сколько встал?');
    expect(html).toContain('value="09:40"');
    expect(html).toContain('Подъём предложен по отключению будильника через QR');
    expect(html).toContain('Плановое время — только подсказка');
    expect(html).toContain('Сохранить ночь');
  });

  it('keeps wake time empty for a manual no-alarm entry', () => {
    const html = renderToStaticMarkup(
      createElement(SleepObservationForm, {
        cycleDate: '2026-10-03',
        timeZone: 'Asia/Chita',
        plannedWentToBedAt: new Date('2026-10-03T14:30:00.000Z'),
        observation: null,
        busy: false,
        error: null,
        saved: false,
        onSave: vi.fn(),
      }),
    );

    expect(html).toContain('Введите время подъёма вручную');
    expect(html).toContain('name="wokeAt" value=""');
  });

  it('resolves entered local times into the configured time zone across midnight', () => {
    expect(observationWindowFromTimes('2026-10-03', '22:35', '08:45', 'Asia/Chita')).toEqual({
      wentToBedAt: new Date('2026-10-03T13:35:00.000Z'),
      wokeAt: new Date('2026-10-03T23:45:00.000Z'),
    });
  });
});
