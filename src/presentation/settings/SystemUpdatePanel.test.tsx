import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SystemUpdatePanel } from './SystemUpdatePanel';

describe('SystemUpdatePanel', () => {
  it('shows the installed version and manual check action', () => {
    const markup = renderToStaticMarkup(
      createElement(SystemUpdatePanel, {
        state: { status: 'idle', currentVersion: '1.0.2' },
        onCheck: vi.fn(),
        onInstall: vi.fn(),
      }),
    );

    expect(markup).toContain('LifeOS');
    expect(markup).toContain('Версия 1.0.2');
    expect(markup).toContain('Проверить обновления');
  });

  it('shows notes and explicit install action for an available version', () => {
    const markup = renderToStaticMarkup(
      createElement(SystemUpdatePanel, {
        state: {
          status: 'available',
          currentVersion: '1.0.2',
          availableVersion: '1.0.3',
          notes: 'Надёжнее обновления.',
        },
        onCheck: vi.fn(),
        onInstall: vi.fn(),
      }),
    );

    expect(markup).toContain('Доступна версия 1.0.3');
    expect(markup).toContain('Надёжнее обновления.');
    expect(markup).toContain('Установить обновление');
  });
});
