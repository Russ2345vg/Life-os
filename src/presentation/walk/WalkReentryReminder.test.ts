import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WalkReentryReminder } from './WalkReentryReminder';

describe('WalkReentryReminder', () => {
  it('renders one compact continuation action without modal semantics', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkReentryReminder, {
        onContinue: vi.fn(),
        error: null,
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('Завершить возвращение');
    expect(markup).toContain('Продолжить');
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain('aria-modal');
  });

  it('renders an accessible retry state instead of the continuation action', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkReentryReminder, {
        onContinue: vi.fn(),
        error: 'Не удалось проверить возвращение.',
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось проверить возвращение.');
    expect(markup).toContain('Повторить');
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).not.toContain('Продолжить');
  });
});
