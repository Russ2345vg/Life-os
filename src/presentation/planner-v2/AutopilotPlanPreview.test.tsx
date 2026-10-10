import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AutopilotPlanPreview } from './AutopilotPlanPreview';
import type { DayAutopilotPreview } from '../../application';
it('shows rituals and rest in order and distinguishes planning estimates from recorded focus', () => {
  const preview: DayAutopilotPreview = {
    date: '2026-10-10',
    mode: 'fill',
    startMinute: 540,
    endMinute: 1200,
    planningEndMinute: 1200,
    reserveMinutes: 100,
    plannedMinutes: 25,
    createdAt: '2026-10-10T00:00:00Z',
    capacityMinutes: 660,
    capacityAssumed: false,
    recoverySignal: null,
    proposals: [
      {
        actionId: 'a',
        title: 'Учёба',
        expectedVersion: 1,
        previousStartMinute: null,
        startMinute: 540,
        durationMinutes: 25,
        isMain: false,
        usedDefaultEstimate: true,
        reason: 'focus',
        estimateSource: 'default',
      },
    ],
    locked: [],
    deferred: [],
    timeline: [
      {
        id: 'a',
        kind: 'action',
        title: 'Учёба',
        startMinute: 540,
        endMinute: 565,
        sourceId: 'a',
        actionId: 'a',
        protected: false,
      },
      {
        id: 'rest',
        kind: 'rest',
        title: 'Отдых',
        startMinute: 565,
        endMinute: 570,
        sourceId: null,
        actionId: null,
        protected: false,
      },
      {
        id: 'evening',
        kind: 'evening',
        title: 'Вечерняя подготовка',
        startMinute: 1155,
        endMinute: 1200,
        sourceId: null,
        actionId: null,
        protected: true,
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(AutopilotPlanPreview, {
      preview,
      busy: false,
      onDuration: vi.fn(),
      onExclude: vi.fn(),
    }),
  );
  expect(html).toContain('Работа в плане');
  expect(html).toContain('Распорядок и отдых');
  expect(html).toContain('Свободно');
  expect(html.indexOf('Учёба')).toBeLessThan(html.indexOf('Отдых'));
  expect(html.indexOf('Отдых')).toBeLessThan(html.indexOf('Вечерняя подготовка'));
  expect(html).toContain('Оценка 25 минут');
  expect(html).toContain('Исключить');
  expect(html).toContain('Длительность: Учёба');
});
