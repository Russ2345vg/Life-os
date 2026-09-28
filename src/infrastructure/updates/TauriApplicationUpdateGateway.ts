import { invoke, isTauri } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import type {
  ApplicationUpdate,
  ApplicationUpdateGateway,
} from '../../application/updates/ApplicationUpdateGateway';

interface AndroidApplicationUpdate {
  readonly version: string;
  readonly versionCode: number;
  readonly notes: string;
  readonly apkUrl: string;
  readonly sha256: string;
  readonly packageId: string;
}

export class TauriApplicationUpdateGateway implements ApplicationUpdateGateway {
  async check(): Promise<ApplicationUpdate | null> {
    if (!isTauri()) return null;
    const platform = await invoke<string>('sync_platform');
    if (platform === 'android') {
      const endpoint =
        import.meta.env.VITE_LIFEOS_ANDROID_UPDATE_ENDPOINT ??
        'https://github.com/Russ2345vg/LifeOS-Releases/releases/latest/download/android-latest.json';
      const update = await invoke<AndroidApplicationUpdate | null>('android_check_update', {
        endpoint,
      });
      if (!update) return null;
      return {
        version: update.version,
        close: async () => {},
        install: async (onProgress) => {
          onProgress(null);
          await invoke('android_download_and_install', { update });
          onProgress(100);
          return 'installer-opened';
        },
      };
    }
    if (platform !== 'windows') return null;
    const update = await check({ timeout: 15_000 });
    if (!update) return null;
    return {
      version: update.version,
      close: () => update.close(),
      install: async (onProgress) => {
        let total: number | undefined;
        let downloaded = 0;
        await update.downloadAndInstall(
          (event) => {
            if (event.event === 'Started') {
              total = event.data.contentLength;
              downloaded = 0;
            } else if (event.event === 'Progress') {
              downloaded += event.data.chunkLength;
            } else {
              onProgress(100);
              return;
            }
            onProgress(
              total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
            );
          },
          { timeout: 120_000, restartAfterInstall: true },
        );
      },
    };
  }
}
