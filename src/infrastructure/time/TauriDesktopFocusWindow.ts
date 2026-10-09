import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DesktopFocusWindow } from '../../application/ports/DesktopFocusWindow';

export class TauriDesktopFocusWindow implements DesktopFocusWindow {
  public get available(): boolean {
    return isTauri() && typeof navigator !== 'undefined' && !/Android/i.test(navigator.userAgent);
  }
  public async setActive(active: boolean): Promise<void> {
    if (this.available) await invoke('focus_window_set_active', { active });
  }
  public async restore(): Promise<void> {
    if (this.available) await invoke('focus_window_restore');
  }
  public async drag(): Promise<void> {
    if (this.available) await invoke('focus_window_drag');
  }
  public async subscribe(
    listener: (compact: boolean, error?: string) => void,
  ): Promise<() => void> {
    if (!this.available) return () => {};
    const unlisten = await listen<{ compact: boolean; error?: string }>(
      'lifeos-focus-window',
      (event) => listener(event.payload.compact, event.payload.error),
    );
    try {
      listener(await invoke<boolean>('focus_window_is_compact'));
    } catch (error: unknown) {
      unlisten();
      throw error;
    }
    return unlisten;
  }
}
