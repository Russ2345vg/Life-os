import type { DayDate } from '../../domain';
import type { TodayActionSelectionStore } from '../../presentation/pages/TodayActionSelectionStore';
import type { KeyValueStorage } from './BrowserLocalSettingsStore';

export const TODAY_ACTION_SELECTION_STORAGE_KEY = 'lifeos.today-action-selection.v1';

export class BrowserTodayActionSelectionStore implements TodayActionSelectionStore {
  readonly #storage: KeyValueStorage | null;

  public constructor(storage: KeyValueStorage | null = resolveBrowserStorage()) {
    this.#storage = storage;
  }

  public load(date: DayDate): string | null {
    const selections = this.#loadSelections();
    return selections?.[date.toString()] ?? null;
  }

  public save(date: DayDate, lifeActionId: string): boolean {
    if (this.#storage === null || lifeActionId.trim().length === 0) {
      return false;
    }

    try {
      const selections = this.#loadSelections() ?? {};
      selections[date.toString()] = lifeActionId;
      this.#storage.setItem(TODAY_ACTION_SELECTION_STORAGE_KEY, JSON.stringify(selections));
      return true;
    } catch {
      return false;
    }
  }

  public clear(date: DayDate): boolean {
    if (this.#storage === null) {
      return false;
    }

    try {
      const selections = this.#loadSelections() ?? {};
      delete selections[date.toString()];

      if (Object.keys(selections).length === 0) {
        this.#storage.removeItem(TODAY_ACTION_SELECTION_STORAGE_KEY);
      } else {
        this.#storage.setItem(TODAY_ACTION_SELECTION_STORAGE_KEY, JSON.stringify(selections));
      }
      return true;
    } catch {
      return false;
    }
  }

  #loadSelections(): Record<string, string> | null {
    if (this.#storage === null) {
      return null;
    }

    try {
      const storedValue = this.#storage.getItem(TODAY_ACTION_SELECTION_STORAGE_KEY);
      if (storedValue === null) {
        return {};
      }

      const parsed: unknown = JSON.parse(storedValue);
      if (!isRecord(parsed)) {
        return {};
      }

      const selections: Record<string, string> = {};
      for (const [date, lifeActionId] of Object.entries(parsed)) {
        if (isDayDateString(date) && typeof lifeActionId === 'string' && lifeActionId.length > 0) {
          selections[date] = lifeActionId;
        }
      }
      return selections;
    } catch {
      return {};
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDayDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveBrowserStorage(): KeyValueStorage | null {
  try {
    if (!('localStorage' in globalThis)) {
      return null;
    }

    return globalThis.localStorage;
  } catch {
    return null;
  }
}
