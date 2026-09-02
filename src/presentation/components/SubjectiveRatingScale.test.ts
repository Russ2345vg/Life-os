import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SubjectiveRatingScale } from './SubjectiveRatingScale';

describe('SubjectiveRatingScale', () => {
  it('рендерит native radiogroup с пятью видимыми вариантами и checked semantics', () => {
    const markup = renderToStaticMarkup(
      createElement(SubjectiveRatingScale, {
        name: 'calm',
        label: 'Насколько спокойна голова?',
        value: 3,
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('Насколько спокойна голова?');
    expect(markup.match(/type="radio"/g)).toHaveLength(5);
    expect(markup).toMatch(/<input[^>]*checked=""[^>]*value="3"/);
    expect(markup).toContain('data-selected="true"');
  });

  it('передаёт disabled всем вариантам и не полагается только на цвет', () => {
    const markup = renderToStaticMarkup(
      createElement(SubjectiveRatingScale, {
        name: 'readiness',
        label: 'Насколько ты готов ко сну?',
        value: null,
        disabled: true,
        onChange: vi.fn(),
      }),
    );
    expect(markup.match(/disabled=""/g)).toHaveLength(5);
    expect(markup).toContain('Очень низко');
    expect(markup).toContain('Очень высоко');
    expect(markup).toContain('1 из 5, Очень низко');
    expect(markup).toContain('5 из 5, Очень высоко');
  });
});
