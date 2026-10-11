import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SleepQuickEntry } from './SleepQuickEntry';

describe('SleepQuickEntry', () => {
  it('shows the target night and explains that a mark needs confirmation', () => {
    const html = renderToStaticMarkup(
      createElement(SleepQuickEntry, {
        mode: 'MORNING',
        cycleDate: '2026-10-03',
        observation: null,
        busy: false,
        dirty: false,
        error: null,
        saved: false,
        onMark: async () => undefined,
      }),
    );
    expect(html).toContain('Я проснулся');
    expect(html).toContain('2026-10-03');
    expect(html).toContain('черновик');
  });
  it('disables a conflicting tap and keeps an error visible', () => {
    const html = renderToStaticMarkup(
      createElement(SleepQuickEntry, {
        mode: 'EVENING',
        cycleDate: '2026-10-03',
        observation: null,
        busy: false,
        dirty: true,
        error: 'Запись недоступна',
        saved: false,
        onMark: async () => undefined,
      }),
    );
    expect(html).toContain('Ложусь');
    expect(html).toContain('disabled');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Сохраните');
  });
});
