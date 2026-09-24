import { invoke, isTauri } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import type {
  ApplicationUpdate,
  ApplicationUpdateGateway,
} from '../../application/updates/ApplicationUpdateGateway';

export class TauriApplicationUpdateGateway implements ApplicationUpdateGateway {
  async check(): Promise<ApplicationUpdate | null> {
    if (!isTauri() || (await invoke<string>('sync_platform')) !== 'windows') return null;
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
