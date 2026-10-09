import { invoke, isTauri } from '@tauri-apps/api/core';
import type { TodayWidgetSnapshot } from '../../application/queries/TodayWidgetSnapshot';

type InvokeFunction = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function isAndroidWidgetRuntime(): boolean {
  return isTauri() && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export class TauriTodayWidgetGateway {
  public constructor(
    private readonly invokeFunction: InvokeFunction = (command, args) => invoke(command, args),
  ) {}

  public async update(snapshot: TodayWidgetSnapshot): Promise<void> {
    if (!isAndroidWidgetRuntime()) return;
    await this.invokeFunction('android_today_widget_update', {
      snapshotJson: JSON.stringify(snapshot),
    });
  }

  public async consumeOpenToday(): Promise<boolean> {
    if (!isAndroidWidgetRuntime()) return false;
    const result = (await this.invokeFunction('android_today_widget_consume_open')) as {
      openToday?: boolean;
    };
    return result.openToday === true;
  }
}
