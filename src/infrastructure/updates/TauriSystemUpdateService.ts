import { invoke, isTauri } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import type {
  AvailableSystemUpdate,
  SystemUpdateService,
  UpdateDownloadProgress,
} from '../../application/updates/SystemUpdate';

interface AndroidUpdateManifest extends AvailableSystemUpdate {
  readonly versionCode: number;
  readonly apkUrl: string;
  readonly sha256: string;
  readonly packageId: 'com.lifeos.desktop';
}

interface AndroidInstallResult {
  readonly installerOpened: boolean;
}

export class TauriSystemUpdateService implements SystemUpdateService {
  private desktopUpdate: Update | null = null;
  private androidUpdate: AndroidUpdateManifest | null = null;

  constructor(private readonly androidEndpoint: string | undefined) {}

  async check(): Promise<AvailableSystemUpdate | null> {
    this.desktopUpdate = null;
    this.androidUpdate = null;

    if (!isTauri()) return null;
    if (isAndroidRuntime()) {
      if (this.androidEndpoint === undefined || this.androidEndpoint.trim() === '') {
        throw new Error('Android update endpoint не настроен для этой сборки.');
      }
      const update = await invoke<AndroidUpdateManifest | null>('android_check_update', {
        endpoint: this.androidEndpoint,
      });
      this.androidUpdate = update;
      return update;
    }

    const update = await check();
    this.desktopUpdate = update;
    return update === null ? null : { version: update.version, notes: update.body ?? '' };
  }

  async install(onProgress: (progress: UpdateDownloadProgress) => void): Promise<void> {
    if (isAndroidRuntime()) {
      if (this.androidUpdate === null) throw new Error('Сначала проверьте обновления.');
      const result = await invoke<AndroidInstallResult>('android_download_and_install', {
        update: this.androidUpdate,
      });
      if (!result.installerOpened) throw new Error('Не удалось открыть системный установщик.');
      return;
    }

    if (this.desktopUpdate === null) throw new Error('Сначала проверьте обновления.');
    let downloadedBytes = 0;
    let totalBytes: number | null = null;
    await this.desktopUpdate.downloadAndInstall(
      (event: DownloadEvent) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? null;
          onProgress({ downloadedBytes, totalBytes });
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          onProgress({ downloadedBytes, totalBytes });
        }
      },
      { restartAfterInstall: true },
    );
  }
}

function isAndroidRuntime(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}
