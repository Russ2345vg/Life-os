import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MonthlyDirectionFocusCard } from './MonthlyDirectionFocusCard';

const choices = [
  { id: 'health', title: 'Здоровье → Энергия' },
  { id: 'work', title: 'Работа → Продукт' },
];

describe('MonthlyDirectionFocusCard', () => {
  it('makes the active monthly direction the visual center', () => {
    const html = renderToStaticMarkup(
      createElement(MonthlyDirectionFocusCard, {
        value: {
          month: '2026-09',
          hasCurrent: true,
          directionId: 'health',
          directionLabel: 'Здоровье → Энергия',
          suggestion: null,
          choices,
        },
        busy: false,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('planner-month-focus--active');
    expect(html).toContain('Фокус месяца');
    expect(html).toContain('сентябрь');
    expect(html).toContain('Здоровье → Энергия');
    expect(html).toContain('aria-label="Главное направление"');
  });

  it('shows an explicit empty state without reviving an earlier suggestion', () => {
    const html = renderToStaticMarkup(
      createElement(MonthlyDirectionFocusCard, {
        value: {
          month: '2026-10',
          hasCurrent: true,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices,
        },
        busy: false,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('Главное направление не выбрано');
    expect(html).not.toContain('Продолжить в октябре');
  });

  it('offers the previous direction for explicit confirmation in a new month', () => {
    const html = renderToStaticMarkup(
      createElement(MonthlyDirectionFocusCard, {
        value: {
          month: '2026-10',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: { directionId: 'work', directionLabel: 'Работа → Продукт' },
          choices,
        },
        busy: false,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('Продолжить в октябре');
    expect(html).toContain('Работа → Продукт');
    expect(html).toContain('Подтвердить направление');
  });

  it('keeps an archived saved value visible while allowing another active choice', () => {
    const html = renderToStaticMarkup(
      createElement(MonthlyDirectionFocusCard, {
        value: {
          month: '2026-09',
          hasCurrent: true,
          directionId: 'archived',
          directionLabel: null,
          suggestion: null,
          choices,
        },
        busy: false,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('Недоступное направление');
    expect(html).toContain('value="archived" selected=""');
    expect(html).toContain('Здоровье → Энергия');
  });
});
