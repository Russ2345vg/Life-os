import { calculateSunsetWalk, cityDateAt } from '../../domain/walk/SunsetWalkSchedule';
import { shiftAutopilotDate } from '../planner/AutopilotConstraints';
import { DomainError } from '../../shared/errors/DomainError';
import type { SunsetWalkSettings } from './SunsetWalkSettings';
import type {
  WalkReminderConfiguration,
  WalkReminderGateway,
  WalkReminderReceipt,
} from '../ports/WalkReminderGateway';

export class WalkReminderCoordinator {
  public async openSettings(issue: 'EXACT_ALARM' | 'NOTIFICATIONS'): Promise<void> {
    if (!this.gateway.openSettings)
      throw new DomainError('walk.reminder_unavailable', 'Системные настройки недоступны.');
    await this.gateway.openSettings(issue);
  }
  private pending: Promise<unknown> = Promise.resolve();
  public constructor(
    private readonly settings: SunsetWalkSettings,
    private readonly gateway: WalkReminderGateway,
    private readonly now: () => number = Date.now,
  ) {}
  public reconcile(): Promise<WalkReminderReceipt> {
    const operation = this.pending.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const settings = await this.settings.get();
        const fromCityDate = cityDateAt(this.now(), settings.city.timeZone);
        const days = Array.from({ length: 400 }, (_, offset) => {
          const cityDate = shiftAutopilotDate(fromCityDate, offset);
          const result = calculateSunsetWalk(cityDate, settings.city);
          return {
            cityDate,
            sunsetAt: result.kind === 'available' ? result.sunsetAt : null,
            walkStartAt: result.kind === 'available' ? result.walkStartAt : null,
          };
        });
        const config: WalkReminderConfiguration = {
          schemaVersion: 1,
          revision: settings.revision,
          cityId: settings.city.id,
          timeZone: settings.city.timeZone,
          enabled: settings.enabled && settings.remindersEnabled,
          fromCityDate,
          throughCityDate: days.at(-1)!.cityDate,
          days,
        };
        const receipt = await this.gateway.reconcile(config);
        if ((await this.settings.get()).revision !== settings.revision) continue;
        if (receipt.state !== 'unsupported' && receipt.revision !== settings.revision)
          throw new DomainError(
            'walk.reminder_stale',
            'Устройство ещё не подтвердило новые настройки прогулки.',
          );
        return receipt;
      }
      throw new DomainError(
        'walk.reminder_stale',
        'Настройки меняются. Повторите проверку уведомления.',
      );
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
  public async status(): Promise<WalkReminderReceipt> {
    const receipt = await this.gateway.status();
    const settings = await this.settings.get();
    if (receipt.state === 'scheduled' && receipt.revision !== settings.revision)
      return {
        ...receipt,
        state: 'error',
        nextTriggerAt: null,
        message: 'Новое расписание ещё не подтверждено на этом устройстве.',
      };
    return receipt;
  }
}
