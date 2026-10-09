import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriTodayWidgetGateway } from './TauriTodayWidgetGateway';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }));

describe('TauriTodayWidgetGateway', () => {
  beforeEach(() => vi.stubGlobal('navigator', { userAgent: 'Android' }));
  afterEach(() => vi.unstubAllGlobals());

  it('sends a minimal snapshot and consumes the Today launch request', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ openToday: true });
    const gateway = new TauriTodayWidgetGateway(invoke);
    const snapshot = {
      date: '2026-10-05',
      main: 'Главное',
      actions: ['Следующее'],
      remainingCount: 0,
      updatedAtEpochMillis: 123,
    };
    await gateway.update(snapshot);
    expect(invoke).toHaveBeenCalledWith('android_today_widget_update', {
      snapshotJson: JSON.stringify(snapshot),
    });
    expect(await gateway.consumeOpenToday()).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('android_today_widget_consume_open');
  });
});
