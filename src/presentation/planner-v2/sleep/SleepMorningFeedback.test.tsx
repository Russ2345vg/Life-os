import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SleepMorningFeedback } from './SleepMorningFeedback';

function render(overrides: Partial<Parameters<typeof SleepMorningFeedback>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(SleepMorningFeedback, {
      feedback: undefined,
      busy: false,
      disabledReason: null,
      status: null,
      error: null,
      onSelect: () => {},
      onClear: () => {},
      onRetry: () => {},
      ...overrides,
    }),
  );
}
describe('morning feedback card', () => {
  it('renders two independent accessible groups with six neutral choices', () => {
    const html = render();
    expect(html).toContain('Как прошла ночь?');
    expect(html).toContain('aria-label="Качество сна"');
    expect(html).toContain('aria-label="Самочувствие утром"');
    for (const label of ['Хорошо', 'Средне', 'Плохо', 'Бодр', 'Нормально', 'Устал'])
      expect(html).toContain(label);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(6);
    expect(html).not.toContain('Сбросить оценку');
  });
  it('shows partial saved feedback and disables choices for unsaved sleep times', () => {
    const html = render({
      feedback: { sleepQuality: 'GOOD', energy: null, recordedAt: new Date() },
      disabledReason: 'Сначала сохраните времена или сбросьте изменения.',
      status: 'Оценка сохранена',
    });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/disabled=""/g)).toHaveLength(7);
    expect(html).toContain('Сбросить оценку');
    expect(html).toContain('Сначала сохраните');
    expect(html).toContain('role="status"');
  });
  it('announces saving and provides retry after a failed command', () => {
    expect(render({ busy: true })).toContain('Сохраняем оценку');
    const html = render({ error: 'Запись недоступна' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Повторить сохранение оценки');
  });
});
