import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DirectionSphereIcon } from './DirectionSphereIcon';

describe('DirectionSphereIcon', () => {
  it.each([
    ['Деньги', 'money'],
    ['Финансы', 'money'],
    ['Здоровье', 'health'],
    ['Развитие', 'growth'],
    ['Отношения', 'relationships'],
    ['Работа', 'work'],
    ['Дело', 'work'],
    ['Дом', 'home'],
    ['Неизвестная сфера', 'neutral'],
    [null, 'neutral'],
  ] as const)('maps sphere %s to the %s icon', (sphereName, iconName) => {
    const markup = renderToStaticMarkup(createElement(DirectionSphereIcon, { sphereName }));
    expect(markup).toContain(`data-direction-sphere-icon="${iconName}"`);
  });

  it('normalizes whitespace and case', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionSphereIcon, { sphereName: '  ДЕЛО  ' }),
    );
    expect(markup).toContain('data-direction-sphere-icon="work"');
  });

  it('renders the money shield as a decorative presentation-only SVG', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionSphereIcon, { sphereName: 'Деньги' }),
    );

    expect(markup).toContain('<svg');
    expect(markup).toContain('data-direction-sphere-icon="money"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('fill="none"');
  });
});
