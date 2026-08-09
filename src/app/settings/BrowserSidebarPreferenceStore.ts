import type { KeyValueStorage } from './BrowserLocalSettingsStore';

export const SIDEBAR_PREFERENCE_STORAGE_KEY = 'lifeos.sidebar-collapsed.v1';

export class BrowserSidebarPreferenceStore {
  readonly #storage: KeyValueStorage | null;

  public constructor(storage: KeyValueStorage | null = resolveBrowserStorage()) {
    this.#storage = storage;
  }

  public load(): boolean {
    if (this.#storage === null) {
      return false;
    }

    try {
      return this.#storage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public save(collapsed: boolean): boolean {
    if (this.#storage === null) {
      return false;
    }

    try {
      this.#storage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, String(collapsed));
      return true;
    } catch {
      return false;
    }
  }
}

function resolveBrowserStorage(): KeyValueStorage | null {
  try {
    return 'localStorage' in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}
