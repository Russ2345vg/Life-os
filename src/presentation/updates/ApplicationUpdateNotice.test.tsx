import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationUpdateNoticeView } from './ApplicationUpdateNotice';
import type { ApplicationUpdateState } from '../../application/updates/ApplicationUpdateService';

function render(state: ApplicationUpdateState) {
  return renderToStaticMarkup(
    createElement(ApplicationUpdateNoticeView, {
      state,
      onInstall: vi.fn(),
      onCheck: vi.fn(),
      onDismiss: vi.fn(),
    }),
  );
}

describe('ApplicationUpdateNotice', () => {
  it('does not disturb work while checking or when there is no update', () => {
    expect(render({ status: 'idle' })).toBe('');
    expect(render({ status: 'checking' })).toBe('');
  });
  it('explains the restart before offering installation', () => {
    const html = render({ status: 'available', version: '1.0.14' });
    expect(html).toContain('Доступна LifeOS 1.0.14');
    expect(html).toContain('Сохраните открытые формы');
    expect(html).toContain('Обновить');
    expect(html).toContain('Позже');
  });
  it('announces recoverable failures and disables duplicate installation', () => {
    expect(render({ status: 'error', operation: 'check' })).toContain('role="alert"');
    expect(render({ status: 'error', operation: 'install' })).toContain('Повторить');
    const html = render({ status: 'installing', version: '1.0.14', progress: 48 });
    expect(html).toContain('48%');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Позже');
  });
});
