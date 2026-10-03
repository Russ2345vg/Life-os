import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OpenAiPanel } from './OpenAiPanel';

describe('OpenAI panel', () => {
  it('explains the data boundary and provides a labelled bounded input', () => {
    const html = renderToStaticMarkup(
      createElement(OpenAiPanel, {
        service: { available: true, ask: vi.fn() },
      }),
    );
    expect(html).toContain('Только текст этого вопроса');
    expect(html).toContain('Вопрос для OpenAI');
    expect(html).toContain('maxLength="4000"');
    expect(html).not.toContain('type="password"');
  });
  it('shows unavailable state without a submit button', () => {
    const html = renderToStaticMarkup(
      createElement(OpenAiPanel, {
        service: { available: false, ask: vi.fn() },
      }),
    );
    expect(html).toContain('ещё не настроено');
    expect(html).not.toContain('type="submit"');
  });
});
