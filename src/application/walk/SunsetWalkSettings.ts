import { BORZYA_CITY, validateWalkCity, type WalkCity } from '../../domain/walk/SunsetWalkSchedule';
import { DomainError } from '../../shared/errors/DomainError';

export const SUNSET_WALK_SETTINGS_CHANGED = 'lifeos:sunset-walk-settings-changed';
export interface SunsetWalkSettingsValue {
  readonly city: WalkCity;
  readonly enabled: boolean;
  readonly remindersEnabled: boolean;
  readonly revision: number;
}
export interface SunsetWalkSettingsStore {
  read(): Promise<SunsetWalkSettingsValue>;
  write(value: SunsetWalkSettingsValue): Promise<void>;
}
export function defaultSunsetWalkSettings(): SunsetWalkSettingsValue {
  return { city: BORZYA_CITY, enabled: true, remindersEnabled: true, revision: 1 };
}
export function validateSunsetWalkSettings(value: unknown): SunsetWalkSettingsValue {
  if (typeof value !== 'object' || value === null)
    throw new DomainError('walk.invalid_sunset_settings', 'Проверьте настройки прогулки.');
  const v = value as Record<string, unknown>;
  if (
    typeof v.enabled !== 'boolean' ||
    typeof v.remindersEnabled !== 'boolean' ||
    typeof v.revision !== 'number' ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 1
  )
    throw new DomainError('walk.invalid_sunset_settings', 'Проверьте настройки прогулки.');
  return {
    city: validateWalkCity(v.city),
    enabled: v.enabled,
    remindersEnabled: v.remindersEnabled,
    revision: v.revision,
  };
}
export class SunsetWalkSettings {
  private pending: Promise<unknown> = Promise.resolve();
  public constructor(private readonly store: SunsetWalkSettingsStore) {}
  public async get(): Promise<SunsetWalkSettingsValue> {
    return validateSunsetWalkSettings(await this.store.read());
  }
  public save(
    input: Pick<SunsetWalkSettingsValue, 'city' | 'enabled' | 'remindersEnabled'>,
  ): Promise<SunsetWalkSettingsValue> {
    const operation = this.pending.then(async () => {
      const previous = await this.get();
      const next = validateSunsetWalkSettings({ ...input, revision: previous.revision });
      if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
      const saved = { ...next, revision: previous.revision + 1 };
      await this.store.write(saved);
      if (typeof globalThis.dispatchEvent === 'function')
        globalThis.dispatchEvent(new Event(SUNSET_WALK_SETTINGS_CHANGED));
      return saved;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
