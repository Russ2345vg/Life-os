import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriApplicationUpdateGateway } from './TauriApplicationUpdateGateway';
import { ApplicationUpdateService } from '../../application/updates/ApplicationUpdateService';

const native = vi.hoisted(() => ({ check: vi.fn(), invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: native.check }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: native.isTauri }));

describe('TauriApplicationUpdateGateway', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('does not call native APIs in a browser', async () => {
    vi.clearAllMocks();
    native.isTauri.mockReturnValue(false);
    expect(await new TauriApplicationUpdateGateway().check()).toBeNull();
    expect(native.invoke).not.toHaveBeenCalled();
    expect(native.check).not.toHaveBeenCalled();
  });
  it('offers an Android release through the application service without installing it', async () => {
    const endpoint =
      'https://github.com/ConfiguredOwner/LifeOS-Releases/releases/latest/download/android-latest.json';
    vi.stubEnv('VITE_LIFEOS_ANDROID_UPDATE_ENDPOINT', endpoint);
    native.isTauri.mockReturnValue(true);
    const release = {
      version: '1.0.22',
      versionCode: 1000022,
      notes: 'Исправлена проверка обновлений Android',
      apkUrl:
        'https://github.com/Russ2345vg/LifeOS-Releases/releases/download/v1.0.22/LifeOS_1.0.22_android_release.apk',
      sha256: 'a'.repeat(64),
      packageId: 'com.lifeos.desktop',
    };
    native.invoke.mockResolvedValueOnce('android').mockResolvedValueOnce(release);
    const service = new ApplicationUpdateService(new TauriApplicationUpdateGateway());
    await service.start();
    expect(service.getSnapshot()).toEqual({ status: 'available', version: '1.0.22' });
    expect(native.invoke.mock.calls).toEqual([
      ['sync_platform'],
      ['android_check_update', { endpoint }],
    ]);
    expect(native.check).not.toHaveBeenCalled();
  });

  it('hands the checked Android release to its installer only on explicit install', async () => {
    native.isTauri.mockReturnValue(true);
    const release = {
      version: '1.0.22',
      versionCode: 1000022,
      notes: '',
      apkUrl:
        'https://github.com/Russ2345vg/LifeOS-Releases/releases/download/v1.0.22/LifeOS_1.0.22_android_release.apk',
      sha256: 'a'.repeat(64),
      packageId: 'com.lifeos.desktop',
    };
    native.invoke
      .mockResolvedValueOnce('android')
      .mockResolvedValueOnce(release)
      .mockResolvedValueOnce({ installerOpened: true });
    const update = await new TauriApplicationUpdateGateway().check();
    expect(update?.version).toBe('1.0.22');
    const progress = vi.fn();
    expect(await update!.install(progress)).toBe('installer-opened');
    expect(native.invoke).toHaveBeenLastCalledWith('android_download_and_install', {
      update: release,
    });
    expect(progress.mock.calls.map(([value]) => value)).toEqual([null, 100]);
    await update!.close();
    expect(native.invoke).toHaveBeenCalledTimes(3);
    expect(native.check).not.toHaveBeenCalled();
  });

  it('keeps an up-to-date Android installation quiet', async () => {
    native.isTauri.mockReturnValue(true);
    native.invoke.mockResolvedValueOnce('android').mockResolvedValueOnce(null);
    expect(await new TauriApplicationUpdateGateway().check()).toBeNull();
    expect(native.invoke).toHaveBeenCalledTimes(2);
    expect(native.check).not.toHaveBeenCalled();
  });

  it('does not report a successful handoff when Android rejects installation permission', async () => {
    native.isTauri.mockReturnValue(true);
    native.invoke
      .mockResolvedValueOnce('android')
      .mockResolvedValueOnce({
        version: '1.0.22',
        versionCode: 1000022,
        notes: '',
        apkUrl:
          'https://github.com/Russ2345vg/LifeOS-Releases/releases/download/v1.0.22/LifeOS_1.0.22_android_release.apk',
        sha256: 'a'.repeat(64),
        packageId: 'com.lifeos.desktop',
      })
      .mockRejectedValueOnce(new Error('UNKNOWN_SOURCES_PERMISSION_REQUIRED'));
    const update = await new TauriApplicationUpdateGateway().check();
    const progress = vi.fn();
    await expect(update!.install(progress)).rejects.toThrow('UNKNOWN_SOURCES_PERMISSION_REQUIRED');
    expect(progress.mock.calls.map(([value]) => value)).toEqual([null]);
  });

  it('propagates Android check failures so an explicit check can report them', async () => {
    native.isTauri.mockReturnValue(true);
    native.invoke.mockResolvedValueOnce('android').mockRejectedValueOnce(new Error('offline'));
    await expect(new TauriApplicationUpdateGateway().check()).rejects.toThrow('offline');
    expect(native.check).not.toHaveBeenCalled();
  });

  it('keeps unsupported native platforms quiet', async () => {
    native.isTauri.mockReturnValue(true);
    native.invoke.mockResolvedValue('linux');
    expect(await new TauriApplicationUpdateGateway().check()).toBeNull();
    expect(native.invoke).toHaveBeenCalledTimes(1);
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
