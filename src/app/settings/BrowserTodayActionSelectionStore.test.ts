import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId } from '../../domain';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import {
  TODAY_SCREEN_STATE,
  resolveTodayScreenState,
} from '../../presentation/pages/TodayScreenState';
import type { KeyValueStorage } from './BrowserLocalSettingsStore';
import {
  BrowserTodayActionSelectionStore,
  TODAY_ACTION_SELECTION_STORAGE_KEY,
} from './BrowserTodayActionSelectionStore';

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

const DATE = DayDate.create('2026-08-05');
const OTHER_DATE = DayDate.create('2026-08-06');

describe('BrowserTodayActionSelectionStore', () => {
  it('сохраняет выбранное действие отдельно для каждой даты и восстанавливает его после F5', () => {
    const storage = new MemoryStorage();
    const firstRuntime = new BrowserTodayActionSelectionStore(storage);

    expect(firstRuntime.save(DATE, 'action-second')).toBe(true);
    expect(firstRuntime.save(OTHER_DATE, 'action-tomorrow')).toBe(true);

    const reloadedRuntime = new BrowserTodayActionSelectionStore(storage);
    expect(reloadedRuntime.load(DATE)).toBe('action-second');
    expect(reloadedRuntime.load(OTHER_DATE)).toBe('action-tomorrow');
  });

  it('после перезапуска восстанавливает выбранную позицию на экране Сегодня', () => {
    const storage = new MemoryStorage();
    const first = createReadyLifeAction('selection-first', DATE, {
      createdAt: new Date('2026-08-05T08:00:00.000+09:00'),
    });
    const second = createReadyLifeAction('selection-second', DATE, {
      createdAt: new Date('2026-08-05T08:05:00.000+09:00'),
    });
    new BrowserTodayActionSelectionStore(storage).save(DATE, second.id.toString());

    const reloadedStore = new BrowserTodayActionSelectionStore(storage);
    const day = Day.openCurrent({
      id: EntityId.create('selection-day'),
      currentDate: DATE,
      occurredAt: new Date('2026-08-05T08:00:00.000+09:00'),
      createdEventId: EntityId.create('selection-day-created'),
      openedEventId: EntityId.create('selection-day-opened'),
    });
    const state = resolveTodayScreenState({
      day,
      decisionsStatus: 'ready',
      decisions: [],
      recoveryStatus: 'ready',
      lifeActions: [first, second],
      unfinishedSession: null,
      isEveningControlOpen: false,
      preferredLifeActionId: reloadedStore.load(DATE),
    });

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    expect(state.kind === TODAY_SCREEN_STATE.dayStarted && state.currentLifeAction).toBe(second);
    expect(state.kind === TODAY_SCREEN_STATE.dayStarted && state.currentLifeActionIndex).toBe(1);
  });

  it('очищает только выбор указанной даты', () => {
    const storage = new MemoryStorage();
    const store = new BrowserTodayActionSelectionStore(storage);
    store.save(DATE, 'action-today');
    store.save(OTHER_DATE, 'action-tomorrow');

    expect(store.clear(DATE)).toBe(true);
    expect(store.load(DATE)).toBeNull();
    expect(store.load(OTHER_DATE)).toBe('action-tomorrow');
  });

  it('безопасно игнорирует повреждённые и недопустимые значения', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      TODAY_ACTION_SELECTION_STORAGE_KEY,
      JSON.stringify({ invalid: 42, '2026-08-05': '', '2026-08-06': 'valid-action' }),
    );
    const store = new BrowserTodayActionSelectionStore(storage);

    expect(store.load(DATE)).toBeNull();
    expect(store.load(OTHER_DATE)).toBe('valid-action');
  });

  it('не блокирует приложение при недоступном localStorage', () => {
    const store = new BrowserTodayActionSelectionStore(new FailingStorage());

    expect(store.load(DATE)).toBeNull();
    expect(store.save(DATE, 'action')).toBe(false);
    expect(store.clear(DATE)).toBe(false);
  });
});
