import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from './BrowserLocalSettingsStore';
import {
  BrowserSidebarPreferenceStore,
  SIDEBAR_PREFERENCE_STORAGE_KEY,
} from './BrowserSidebarPreferenceStore';

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

describe('BrowserSidebarPreferenceStore', () => {
  it('по умолчанию оставляет боковое меню развёрнутым', () => {
    expect(new BrowserSidebarPreferenceStore(new MemoryStorage()).load()).toBe(false);
  });

  it('сохраняет свёрнутое состояние и восстанавливает его после перезапуска', () => {
    const storage = new MemoryStorage();

    expect(new BrowserSidebarPreferenceStore(storage).save(true)).toBe(true);
    expect(new BrowserSidebarPreferenceStore(storage).load()).toBe(true);
    expect(storage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY)).toBe('true');
  });

  it('сохраняет возвращение к развёрнутому состоянию', () => {
    const storage = new MemoryStorage();
    const store = new BrowserSidebarPreferenceStore(storage);
    store.save(true);

    expect(store.save(false)).toBe(true);
    expect(new BrowserSidebarPreferenceStore(storage).load()).toBe(false);
  });

  it('не блокирует приложение при недоступном хранилище', () => {
    const store = new BrowserSidebarPreferenceStore(new FailingStorage());

    expect(store.load()).toBe(false);
    expect(store.save(true)).toBe(false);
  });
});
