import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PlannerNeeds } from './PlannerNeeds';

it('shows loading for a linked custom need before its associations arrive', () => {
  const html = renderToStaticMarkup(
    createElement(PlannerNeeds, {
      route: { view: 'needs', need: 'Пространство для тишины' },
      catalog: [],
      snapshot: { data: null, refreshing: true, error: null },
      onNavigate: () => {},
      onRetry: () => {},
    }),
  );
  expect(html).toContain('Пространство для тишины');
  expect(html).toContain('Загружаем связи');
  expect(html).not.toContain('Потребность не найдена');
});
