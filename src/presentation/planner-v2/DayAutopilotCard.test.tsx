import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import type { DayAutopilotPreview } from '../../application';
import { DayAutopilotCard, DayAutopilotPreviewPanel } from './DayAutopilotCard';

const preview: DayAutopilotPreview = {
  date: '2026-10-04',
  mode: 'fill',
  createdAt: '2026-10-04T01:00:00.000Z',
  startMinute: 540,
  endMinute: 900,
  planningEndMinute: 840,
  reserveMinutes: 60,
  plannedMinutes: 75,
  capacityMinutes: 360,
  capacityAssumed: true,
  recoverySignal: { kind: 'short_night', minutes: 360 },
  proposals: [
    {
      actionId: 'main',
      title: 'Подготовить интервью',
      expectedVersion: 3,
      previousStartMinute: null,
      startMinute: 540,
      durationMinutes: 50,
      isMain: true,
      usedDefaultEstimate: false,
      reason: 'main_action',
    },
    {
      actionId: 'notes',
      title: 'Разобрать заметки',
      expectedVersion: 2,
      previousStartMinute: null,
      startMinute: 595,
      durationMinutes: 25,
      isMain: false,
      usedDefaultEstimate: true,
      reason: 'day_order',
    },
  ],
  locked: [],
  deferred: [
    {
      actionId: 'later',
      title: 'Большая задача',
      expectedVersion: 4,
      reason: 'no_capacity',
      requestedMinutes: 120,
      hadScheduledWindow: true,
      previousStartMinute: 720,
    },
  ],
};

describe('DayAutopilotCard', () => {
  it('renders an accessible preview-first entry point', () => {
    const html = renderToStaticMarkup(
      createElement(DayAutopilotCard, {
        date: DayDate.create('2026-10-04'),
        service: { preview: vi.fn(), apply: vi.fn() },
        busy: false,
        onApplied: vi.fn(),
      }),
    );
    expect(html).toContain('Автопилот дня');
    expect(html).toContain('Собрать мой день');
    expect(html).toContain('type="time"');
    expect(html).toContain('Пересобрать будущие блоки');
  });

  it('explains the proposed order, assumptions, recovery reserve and deferrals', () => {
    const html = renderToStaticMarkup(createElement(DayAutopilotPreviewPanel, { preview }));
    expect(html).toContain('09:00–09:50');
    expect(html).toContain('Подготовить интервью');
    expect(html).toContain('Главное');
    expect(html).toContain('Оценка 25 минут');
    expect(html).toContain('Резерв после короткой ночи');
    expect(html).toContain('Не поместилось');
    expect(html).toContain('Большая задача');
    expect(html).toContain('Будет убрано из временной сетки');
  });
});
