import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PilotSyncPanel, ReconnectRecoveryPanel } from './SyncPage';

describe('ReconnectRecoveryPanel', () => {
  it('explains that re-enrollment preserves local LifeOS data and requires recovery', () => {
    const markup = renderToStaticMarkup(
      createElement(ReconnectRecoveryPanel, {
        busy: false,
        open: false,
        value: '',
        onOpen: vi.fn(),
        onValueChange: vi.fn(),
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('Повторно подключить устройство');
    expect(markup).toContain('Локальные данные LifeOS останутся на устройстве');
    expect(markup).not.toContain('Удалить данные');
  });
});

describe('PilotSyncPanel', () => {
  it('describes structured and attachment delivery with a successful encrypted sync state', () => {
    const markup = renderToStaticMarkup(
      createElement(PilotSyncPanel, {
        status: {
          state: 'idle',
          pendingCount: 0,
          conflictCount: 0,
          lastSuccessfulSyncAt: '2026-09-04T12:00:00.000Z',
        },
        disabled: false,
        onSync: vi.fn(),
      }),
    );

    expect(markup).toContain('Направления, цели, дневник');
    expect(markup).toContain('Синхронизировано');
    expect(markup).toContain('передаются в зашифрованном виде');
    expect(markup).not.toContain('SYNC-03');
    expect(markup).toContain('Синхронизировать сейчас');
  });

  it('shows durable offline pending work without exposing content', () => {
    const markup = renderToStaticMarkup(
      createElement(PilotSyncPanel, {
        status: {
          state: 'offline',
          pendingCount: 2,
          conflictCount: 0,
          lastSuccessfulSyncAt: null,
        },
        disabled: false,
        onSync: vi.fn(),
      }),
    );

    expect(markup).toContain('Нет сети — изменения сохранены локально');
    expect(markup).toContain('Ожидают отправки: 2');
  });
});
