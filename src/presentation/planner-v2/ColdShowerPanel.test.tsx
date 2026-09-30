import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { recordColdShower } from '../../domain/sleep/ColdShower';
import { ColdShowerView } from './ColdShowerPanel';

const props = {
  today: '2026-09-28',
  busy: false,
  error: null,
  onRecord: vi.fn(),
  onRemove: vi.fn(),
  onRetry: vi.fn(),
};
describe('Cold shower panel', () => {
  it('offers one-click completion without an assessment for an unmarked day', () => {
    const html = renderToStaticMarkup(createElement(ColdShowerView, { ...props, entries: [] }));
    expect(html).toContain('Принял душ');
    expect(html).toContain('Нет отметки');
    expect(html).not.toContain('Оценить самочувствие');
    expect(html).toContain('aria-label="2026-09-29: Нет отметки" disabled');
    expect(html).toContain('role="status"');
  });
  it('shows optional ratings only after completion and leaves empty history distinguishable', () => {
    const entries = recordColdShower(
      [],
      { date: props.today, status: 'completed', energy: 4 },
      new Date('2026-09-28T00:00:00Z'),
    );
    const html = renderToStaticMarkup(createElement(ColdShowerView, { ...props, entries }));
    expect(html).toContain('Душ отмечен');
    expect(html).toContain('Оценить самочувствие');
    expect(html).toContain('Бодрость после душа');
    expect(html).toContain('За неделю');
    expect(html).toContain('Изменить отметку');
  });
  it('exposes a retry after a failed initial load', () => {
    const html = renderToStaticMarkup(
      createElement(ColdShowerView, {
        ...props,
        entries: null,
        error: 'Не удалось загрузить отметки.',
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Повторить загрузку');
  });
});
