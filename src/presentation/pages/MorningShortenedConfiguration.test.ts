import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MorningShortenedConfigurationPanel } from './MorningShortenedConfiguration';

describe('MorningShortenedConfigurationPanel', () => {
  it('renders only the approved per-stage options as accessible radio groups', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningShortenedConfigurationPanel, {
        busy: false,
        onApply: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(markup).toContain('<fieldset');
    expect(markup).toContain('Холодный душ');
    expect(markup).toContain('Физическая активность');
    expect(markup).toContain('Настрой перед зеркалом');
    expect(markup).toContain('Применить сокращение');
    expect(markup).not.toContain('Пропустить всё');
    expect(markup.match(/type="radio"/g)).toHaveLength(7);
  });
});
