import { describe, expect, it } from 'vitest';
import { ACTION_LIST_GROUP } from '../../application';
import {
  ACTION_DURATION_FILTER,
  ACTION_RESULT_FILTER,
  DEFAULT_ACTION_LIST_FILTERS,
} from '../../presentation/actionListFilters';
import type { KeyValueStorage } from './BrowserLocalSettingsStore';
import {
  ACTION_LIST_FILTERS_STORAGE_KEY,
  BrowserActionListFiltersStore,
} from './BrowserActionListFiltersStore';

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
    throw new Error('unavailable');
  }
  public setItem(): void {
    throw new Error('unavailable');
  }
  public removeItem(): void {
    throw new Error('unavailable');
  }
}

const FILTERS = {
  sphere: 'Работа',
  decisionId: 'decision-1',
  group: ACTION_LIST_GROUP.ready,
  duration: ACTION_DURATION_FILTER.from30To60,
  result: ACTION_RESULT_FILTER.withoutResult,
} as const;

describe('BrowserActionListFiltersStore', () => {
  it('сохраняет фильтры при переходах и восстанавливает после повторного создания интерфейса', () => {
    const storage = new MemoryStorage();
    const first = new BrowserActionListFiltersStore(storage);
    expect(first.save(FILTERS)).toBe(true);

    expect(new BrowserActionListFiltersStore(storage).load()).toEqual(FILTERS);
  });

  it('сбрасывает фильтры без изменения предметных данных', () => {
    const storage = new MemoryStorage();
    const store = new BrowserActionListFiltersStore(storage);
    store.save(FILTERS);
    expect(store.reset()).toBe(true);
    expect(store.load()).toEqual(DEFAULT_ACTION_LIST_FILTERS);
  });

  it('игнорирует повреждённое сохранённое значение', () => {
    const storage = new MemoryStorage();
    storage.setItem(ACTION_LIST_FILTERS_STORAGE_KEY, JSON.stringify({ group: 'broken' }));
    expect(new BrowserActionListFiltersStore(storage).load()).toEqual(DEFAULT_ACTION_LIST_FILTERS);
  });

  it('не блокирует приложение при недоступном localStorage', () => {
    const store = new BrowserActionListFiltersStore(new FailingStorage());
    expect(store.load()).toEqual(DEFAULT_ACTION_LIST_FILTERS);
    expect(store.save(FILTERS)).toBe(false);
    expect(store.reset()).toBe(false);
  });
});
