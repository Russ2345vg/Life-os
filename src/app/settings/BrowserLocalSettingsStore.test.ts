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
};

describe('BrowserLocalSettingsStore', () => {
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
