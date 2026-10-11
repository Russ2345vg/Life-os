import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSleepPreparationTiming } from '../../../domain/sleep/SleepPreparationTiming';
import { createEmptySleepSchedule } from '../../../domain/sleep/SleepSchedule';
import { SleepPreparationTiming } from './SleepPreparationTiming';

function render(overrides: Partial<Parameters<typeof SleepPreparationTiming>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(SleepPreparationTiming, {
      timing: defaultSleepPreparationTiming(),
      items: createEmptySleepSchedule().preparationItems,
      plannedSleepAt: new Date('2026-10-10T14:00:00Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-10-10T13:35:00Z'),
      completed: false,
      busy: false,
      error: null,
      onSave: async () => true,
      ...overrides,
    }),
  );
}
describe('preparation timing settings', () => {
  it('shows the total budget and start without double-counting stretching', () => {
    const html = render();
    expect(html).toContain('22:30');
    expect(html).toContain('23:00');
    expect(html).toContain('30 мин');
    expect(html).toContain('Можно начинать подготовку');
    expect(html).toContain('Общее время подготовки, включая растяжку');
    expect(html).toContain('value="30"');
    expect(html).toContain('value="10"');
    expect(html).toContain('Настроить время');
    expect(html).toContain('Выберите пункт');
  });
  it('shows the prior date for after-midnight bedtimes and suppresses completed prompts', () => {
    const html = render({ plannedSleepAt: new Date('2026-10-10T15:10:00Z'), completed: true });
    expect(html).toContain('23:40');
    expect(html).toContain('10 окт');
    expect(html).not.toContain('Можно начинать подготовку');
  });
  it('makes missing or disabled selected items explicit and supports write errors', () => {
    const html = render({
      timing: { totalPreparationMinutes: 30, stretchingItemId: 'removed', stretchingMinutes: 10 },
      error: 'Не удалось сохранить время',
    });
    expect(html).toContain('Пункт растяжки недоступен');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Не удалось сохранить время');
    expect(render({ plannedSleepAt: null })).toContain('Настройте время сна');
  });
});
