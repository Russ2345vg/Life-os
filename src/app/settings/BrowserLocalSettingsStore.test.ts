import { describe, expect, it } from 'vitest';
import { APP_SECTION } from '../../presentation/navigation/AppSection';
import {
  DEFAULT_LOCAL_SETTINGS,
  INTERFACE_DENSITY,
  type LocalSettings,
} from '../../presentation/settings/localSettings';
import {
  BrowserLocalSettingsStore,
  LOCAL_SETTINGS_STORAGE_KEY,
  type KeyValueStorage,
} from './BrowserLocalSettingsStore';

class MemoryStorage implements KeyValueStorage {
  readonly #values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  public removeItem(key: string): void {
    this.#values.delete(key);
  }
}

class FailingStorage implements KeyValueStorage {
  public getItem(): string | null {
    throw new Error('storage unavailable');
  }

  public setItem(): void {
    throw new Error('storage unavailable');
  }

  public removeItem(): void {
    throw new Error('storage unavailable');
  }
}

const CUSTOM_SETTINGS: LocalSettings = {
  defaultSection: APP_SECTION.actions,
  interfaceDensity: INTERFACE_DENSITY.compact,
  reduceMotion: true,
  showMobileWeekday: false,
  eveningRitual: DEFAULT_LOCAL_SETTINGS.eveningRitual,
};

describe('BrowserLocalSettingsStore', () => {
  it('восстанавливает сохранённые настройки Evening Ritual вместе с интерфейсными', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOCAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...CUSTOM_SETTINGS,
        eveningRitual: {
          targetSleepTime: '22:45',
          requiredCoreItems: [
            'ENVIRONMENT:SLEEP:DIM_LIGHTS',
            'ENVIRONMENT:SLEEP:PHONE_AWAY',
            'ENVIRONMENT:TOMORROW:ALARM',
          ],
          defaultRelaxationPractice: 'BREATHING',
          defaultScreenFreeDuration: 30,
          adaptiveRelaxationEnabled: false,
          notificationEnabled: true,
          allowConsciousSkip: false,
          items: [
            {
              key: 'ENVIRONMENT:SLEEP:DIM_LIGHTS',
              recommendedDurationMinutes: 4,
            },
          ],
        },
      }),
    );

    const loaded = new BrowserLocalSettingsStore(storage).load().settings as LocalSettings & {
      readonly eveningRitual?: {
        readonly targetSleepTime: string;
        readonly defaultScreenFreeDuration: number;
      };
    };

    expect(loaded.eveningRitual?.targetSleepTime).toBe('22:45');
    expect(loaded.eveningRitual?.defaultScreenFreeDuration).toBe(30);
  });

  it('удаляет ссылки на исчезнувшие ritual items и восстанавливает безопасное ядро', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOCAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...CUSTOM_SETTINGS,
        eveningRitual: {
          ...DEFAULT_LOCAL_SETTINGS.eveningRitual,
          requiredCoreItems: [
            'ENVIRONMENT:SLEEP:DIM_LIGHTS',
            'ENVIRONMENT:SLEEP:PHONE_AWAY',
            'ENVIRONMENT:REMOVED',
          ],
          items: [
            ...DEFAULT_LOCAL_SETTINGS.eveningRitual.items,
            { key: 'ENVIRONMENT:REMOVED', recommendedDurationMinutes: 5 },
          ],
        },
      }),
    );

    const result = new BrowserLocalSettingsStore(storage).load();

    expect(result.recoveredFromInvalidValue).toBe(true);
    expect(result.settings.eveningRitual.requiredCoreItems).toEqual(
      DEFAULT_LOCAL_SETTINGS.eveningRitual.requiredCoreItems,
    );
    expect(result.settings.eveningRitual.items.some((item) => item.key.includes('REMOVED'))).toBe(
      false,
    );
  });

  it('дополняет старый settings document безопасными Evening defaults без ошибки восстановления', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOCAL_SETTINGS_STORAGE_KEY,
      JSON.stringify(CUSTOM_SETTINGS, [
        'defaultSection',
        'interfaceDensity',
        'reduceMotion',
        'showMobileWeekday',
      ]),
    );

    const result = new BrowserLocalSettingsStore(storage).load();

    expect(result.recoveredFromInvalidValue).toBe(false);
    expect(result.settings.eveningRitual).toEqual(DEFAULT_LOCAL_SETTINGS.eveningRitual);
  });

  it('возвращает безопасные значения по умолчанию при первом запуске', () => {
    const result = new BrowserLocalSettingsStore(new MemoryStorage()).load();

    expect(result.settings).toEqual(DEFAULT_LOCAL_SETTINGS);
    expect(result.storageAvailable).toBe(true);
    expect(result.recoveredFromInvalidValue).toBe(false);
  });

  it('сохраняет и восстанавливает локальные настройки', () => {
    const storage = new MemoryStorage();
    const store = new BrowserLocalSettingsStore(storage);

    expect(store.save(CUSTOM_SETTINGS)).toBe(true);
    expect(store.load().settings).toEqual(CUSTOM_SETTINGS);
  });

  it('отбрасывает повреждённые и неполные настройки', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOCAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ defaultSection: 'unknown', reduceMotion: 'yes' }),
    );

    const result = new BrowserLocalSettingsStore(storage).load();

    expect(result.settings).toEqual(DEFAULT_LOCAL_SETTINGS);
    expect(result.recoveredFromInvalidValue).toBe(true);
  });

  it('сбрасывает сохранённые настройки без изменения предметных данных', () => {
    const storage = new MemoryStorage();
    const store = new BrowserLocalSettingsStore(storage);
    store.save(CUSTOM_SETTINGS);

    expect(store.reset()).toBe(true);
    expect(store.load().settings).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it('безопасно продолжает работу, когда localStorage недоступен', () => {
    const store = new BrowserLocalSettingsStore(new FailingStorage());

    expect(store.load().settings).toEqual(DEFAULT_LOCAL_SETTINGS);
    expect(store.load().storageAvailable).toBe(false);
    expect(store.save(CUSTOM_SETTINGS)).toBe(false);
    expect(store.reset()).toBe(false);
  });
});
