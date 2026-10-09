import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionRankingsPanel } from './ActionRankingsPanel';

describe('ActionRankingsPanel', () => {
  it('shows separate goal and direction counts without calling them time spent', () => {
    const html = renderToStaticMarkup(
      createElement(ActionRankingsPanel, {
        goals: [{ id: 'g1', name: 'Бегать', count: 3 }],
        directions: [{ id: 'd1', name: 'Здоровье', count: 2 }],
      }),
    );
    expect(html).toContain('По целям');
    expect(html).toContain('Бегать');
    expect(html).toContain('3 действия');
    expect(html).toContain('По направлениям');
    expect(html).toContain('Здоровье');
    expect(html).toContain('2 действия');
  });
});
