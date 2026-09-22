import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BalanceWheel } from './BalanceWheel';
describe('balance wheel accessible states', () => {
  it('explains an empty wheel without inventing scores', () => {
    expect(renderToStaticMarkup(<BalanceWheel items={[]} />)).toContain('Выберите сферы');
  });
  it('distinguishes no data from zero with one or many spheres', () => {
    const html = renderToStaticMarkup(
      <BalanceWheel
        items={[
          { id: 'a', name: 'Сон', score: null, desired: null },
          { id: 'b', name: 'Здоровье', score: 0, desired: 8 },
        ]}
      />,
    );
    expect(html).toContain('Сон: нет данных');
    expect(html).toContain('Здоровье: 0.0 из 10');
    expect(html).toMatch(/<text[^>]*>Сон<\/text>/);
    expect(html).toMatch(/<text[^>]*>Здоровье<\/text>/);
    expect(html).not.toContain('NaN');
    expect(
      renderToStaticMarkup(
        <BalanceWheel items={[{ id: 's', name: 'Одна', score: 5, desired: 8 }]} />,
      ),
    ).toContain('Одна: 5.0 из 10');
  });
});
