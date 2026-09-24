import { describe, expect, it, vi } from 'vitest';
import { TauriApplicationUpdateGateway } from './TauriApplicationUpdateGateway';

const native = vi.hoisted(() => ({ check: vi.fn(), invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: native.check }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: native.isTauri }));

describe('TauriApplicationUpdateGateway', () => {
  it('does not call native APIs in a browser', async () => {
    vi.clearAllMocks();
    native.isTauri.mockReturnValue(false);
    expect(await new TauriApplicationUpdateGateway().check()).toBeNull();
    expect(native.invoke).not.toHaveBeenCalled();
    expect(native.check).not.toHaveBeenCalled();
  });
  it('does not call the Windows updater on Android', async () => {
    vi.clearAllMocks();
    native.isTauri.mockReturnValue(true);
    native.invoke.mockResolvedValue('android');
    expect(await new TauriApplicationUpdateGateway().check()).toBeNull();
    expect(native.check).not.toHaveBeenCalled();
  });
  it('checks Windows with a deadline and maps progress without inventing a total', async () => {
    vi.clearAllMocks();
    native.isTauri.mockReturnValue(true);
    native.invoke.mockResolvedValue('windows');
    const close = vi.fn();
    const install = vi.fn(async (onEvent) => {
      onEvent({ event: 'Started', data: {} });
      onEvent({ event: 'Progress', data: { chunkLength: 12 } });
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      onEvent({ event: 'Finished' });
    });
    native.check.mockResolvedValue({ version: '1.0.14', downloadAndInstall: install, close });
    const update = await new TauriApplicationUpdateGateway().check();
    expect(native.check).toHaveBeenCalledWith({ timeout: 15000 });
    const progress = vi.fn();
    await update!.install(progress);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([null, null, 0, 50, 100]);
    await update!.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
