import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionOverview } from '../../../application/connections/GetConnections';
import { ConnectionsView } from './ConnectionsContent';

const overview: ConnectionOverview = {
  title: 'Копить на поездку',
  rows: [
    {
      key: 'direction:one',
      group: 'why',
      kind: 'direction',
      title: 'Впечатления',
      reason: 'Цель принадлежит направлению',
      availability: 'available',
      target: { kind: 'direction', id: 'one' },
    },
    {
      key: 'goal:missing',
      group: 'why',
      kind: 'goal',
      title: 'Старая цель',
      reason: 'Сохранённый источник',
      availability: 'missing',
      target: null,
    },
  ],
  cursors: { memories: 'next' },
};

describe('ConnectionsView', () => {
  it('labels why a relationship exists and leaves a missing source non-clickable', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsView, {
        overview,
        loading: false,
        error: null,
        moreBusy: null,
        moreError: null,
        onRetry: vi.fn(),
        onMore: vi.fn(),
        onNavigate: vi.fn(),
      }),
    );
    expect(html).toContain('Цель принадлежит направлению');
    expect(html).toContain('Старая цель');
    expect(html).toContain('Источник недоступен');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('Показать ещё');
  });

  it('distinguishes loading, empty, and failed reads', () => {
    const render = (input: {
      overview: ConnectionOverview | null;
      loading: boolean;
      error: string | null;
    }) =>
      renderToStaticMarkup(
        createElement(ConnectionsView, {
          ...input,
          moreBusy: null,
          moreError: null,
          onRetry: vi.fn(),
          onMore: vi.fn(),
          onNavigate: vi.fn(),
        }),
      );
    expect(render({ overview: null, loading: true, error: null })).toContain('Загружаем связи');
    expect(
      render({ overview: { title: 'Цель', rows: [], cursors: {} }, loading: false, error: null }),
    ).toContain('У этой записи пока нет связей');
    expect(render({ overview: null, loading: false, error: 'Нет доступа' })).toContain(
      'Повторить загрузку',
    );
  });
});
