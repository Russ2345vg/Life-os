import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  WalkReminderConfiguration,
  WalkReminderGateway,
  WalkReminderReceipt,
  WalkReminderState,
} from '../../application/ports/WalkReminderGateway';
import { DomainError } from '../../shared/errors/DomainError';
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const states: readonly WalkReminderState[] = [
  'scheduled',
  'disabled',
  'permission-required',
  'unsupported',
  'expired',
  'error',
];
function unsupported(revision = 0): WalkReminderReceipt {
  return {
    revision,
    state: 'unsupported',
    nextTriggerAt: null,
    throughCityDate: null,
    checkedAt: Date.now(),
    message: 'Системные уведомления доступны в приложении Windows и Android.',
  };
}
function parseReceipt(value: unknown): WalkReminderReceipt {
  const fail = () =>
    new DomainError(
      'walk.reminder_response_invalid',
      'Устройство вернуло неполный статус уведомлений.',
    );
  if (typeof value !== 'object' || value === null) throw fail();
  const v = value as Record<string, unknown>;
  const integer = (item: unknown) =>
    typeof item === 'number' && Number.isSafeInteger(item) && item >= 0;
  if (
    !integer(v.revision) ||
    !integer(v.checkedAt) ||
    typeof v.state !== 'string' ||
    !states.includes(v.state as WalkReminderState) ||
    (v.nextTriggerAt !== null && !integer(v.nextTriggerAt)) ||
    (v.throughCityDate !== null &&
      (typeof v.throughCityDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.throughCityDate))) ||
    (v.message !== null && typeof v.message !== 'string') ||
    (v.state === 'scheduled' && (v.nextTriggerAt === null || v.throughCityDate === null))
  )
    throw fail();
  return value as WalkReminderReceipt;
}
export class TauriWalkReminderGateway implements WalkReminderGateway {
  public constructor(
    private readonly nativeInvoke: Invoke = invoke,
    private readonly nativeAvailable: () => boolean = isTauri,
  ) {}
  public async reconcile(config: WalkReminderConfiguration): Promise<WalkReminderReceipt> {
    if (!this.nativeAvailable()) return unsupported(config.revision);
    return parseReceipt(
      await this.nativeInvoke('walk_reminder_reconcile', { configuration: config }),
    );
  }
  public async status(): Promise<WalkReminderReceipt> {
    if (!this.nativeAvailable()) return unsupported();
    return parseReceipt(await this.nativeInvoke('walk_reminder_status'));
  }
  public async openSettings(issue: 'EXACT_ALARM' | 'NOTIFICATIONS'): Promise<void> {
    if (!this.nativeAvailable())
      throw new DomainError('walk.reminder_unavailable', 'Откройте LifeOS на Windows или Android.');
    await this.nativeInvoke('walk_reminder_open_settings', { issue });
  }
}
