import {
  ACTION_FILTER_ANY,
  DEFAULT_ACTION_LIST_FILTERS,
  isActionDurationFilter,
  isActionListGroup,
  isActionResultFilter,
  type ActionListFilters,
} from '../../presentation/actionListFilters';
import type { ActionListFiltersStore } from '../../presentation/pages/ActionListFiltersStore';
import type { KeyValueStorage } from './BrowserLocalSettingsStore';

export const ACTION_LIST_FILTERS_STORAGE_KEY = 'lifeos.action-list-filters.v1';

export class BrowserActionListFiltersStore implements ActionListFiltersStore {
  readonly #storage: KeyValueStorage | null;

  public constructor(storage: KeyValueStorage | null = resolveBrowserStorage()) {
    this.#storage = storage;
  }

  public load(): ActionListFilters {
    if (this.#storage === null) {
      return { ...DEFAULT_ACTION_LIST_FILTERS };
    }

    try {
      const raw = this.#storage.getItem(ACTION_LIST_FILTERS_STORAGE_KEY);
      if (raw === null) {
        return { ...DEFAULT_ACTION_LIST_FILTERS };
      }
      const parsed: unknown = JSON.parse(raw);
      return parseFilters(parsed) ?? { ...DEFAULT_ACTION_LIST_FILTERS };
    } catch {
      return { ...DEFAULT_ACTION_LIST_FILTERS };
    }
  }

  public save(filters: ActionListFilters): boolean {
    if (this.#storage === null) {
      return false;
    }
    try {
      this.#storage.setItem(ACTION_LIST_FILTERS_STORAGE_KEY, JSON.stringify(filters));
      return true;
    } catch {
      return false;
    }
  }

  public reset(): boolean {
    if (this.#storage === null) {
      return false;
    }
    try {
      this.#storage.removeItem(ACTION_LIST_FILTERS_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

function parseFilters(value: unknown): ActionListFilters | null {
  if (!isRecord(value)) {
    return null;
  }
  const { sphere, decisionId, group, duration, result } = value;
  if (
    typeof sphere !== 'string' ||
    typeof decisionId !== 'string' ||
    !(group === ACTION_FILTER_ANY || isActionListGroup(group)) ||
    !isActionDurationFilter(duration) ||
    !isActionResultFilter(result)
  ) {
    return null;
  }
  return { sphere, decisionId, group, duration, result };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveBrowserStorage(): KeyValueStorage | null {
  try {
    return 'localStorage' in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}
