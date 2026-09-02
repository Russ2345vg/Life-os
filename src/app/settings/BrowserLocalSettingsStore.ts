import {
  copyLocalSettings,
  DEFAULT_LOCAL_SETTINGS,
  isAppSection,
  isInterfaceDensity,
  type LocalSettings,
} from '../../presentation/settings/localSettings';
import {
  copyEveningRitualSettings,
  isEveningRitualSettings,
  parseEveningRitualSettings,
  type EveningRitualSettings,
} from '../../application/evening-settings';
import type { EveningRitualSettingsReader } from '../../application/ports/EveningRitualSettingsReader';

export const LOCAL_SETTINGS_STORAGE_KEY = 'lifeos.local-settings.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalSettingsLoadResult {
  readonly settings: LocalSettings;
  readonly recoveredFromInvalidValue: boolean;
  readonly storageAvailable: boolean;
}

export class BrowserLocalSettingsStore implements EveningRitualSettingsReader {
  readonly #storage: KeyValueStorage | null;

  public constructor(storage: KeyValueStorage | null = resolveBrowserStorage()) {
    this.#storage = storage;
  }

  public load(): LocalSettingsLoadResult {
    if (this.#storage === null) {
      return {
        settings: copyLocalSettings(DEFAULT_LOCAL_SETTINGS),
        recoveredFromInvalidValue: false,
        storageAvailable: false,
      };
    }

    try {
      const storedValue = this.#storage.getItem(LOCAL_SETTINGS_STORAGE_KEY);
      if (storedValue === null) {
        return {
          settings: copyLocalSettings(DEFAULT_LOCAL_SETTINGS),
          recoveredFromInvalidValue: false,
          storageAvailable: true,
        };
      }

      const parsed: unknown = JSON.parse(storedValue);
      const parsedSettings = parseLocalSettings(parsed);
      if (parsedSettings === null) {
        return {
          settings: copyLocalSettings(DEFAULT_LOCAL_SETTINGS),
          recoveredFromInvalidValue: true,
          storageAvailable: true,
        };
      }

      return {
        settings: parsedSettings.settings,
        recoveredFromInvalidValue: parsedSettings.recoveredFromInvalidValue,
        storageAvailable: true,
      };
    } catch {
      return {
        settings: copyLocalSettings(DEFAULT_LOCAL_SETTINGS),
        recoveredFromInvalidValue: true,
        storageAvailable: false,
      };
    }
  }

  public loadEveningRitualSettings(): EveningRitualSettings {
    return copyEveningRitualSettings(this.load().settings.eveningRitual);
  }

  public save(settings: LocalSettings): boolean {
    if (this.#storage === null) {
      return false;
    }

    if (!isEveningRitualSettings(settings.eveningRitual)) return false;

    try {
      this.#storage.setItem(LOCAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
      this.#storage.removeItem(LOCAL_SETTINGS_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

function parseLocalSettings(
  value: unknown,
): Readonly<{ settings: LocalSettings; recoveredFromInvalidValue: boolean }> | null {
  if (!isRecord(value)) {
    return null;
  }

  const { defaultSection, interfaceDensity, reduceMotion, showMobileWeekday } = value;
  if (
    !isAppSection(defaultSection) ||
    !isInterfaceDensity(interfaceDensity) ||
    typeof reduceMotion !== 'boolean' ||
    typeof showMobileWeekday !== 'boolean'
  ) {
    return null;
  }

  const eveningRitual = parseEveningRitualSettings(value.eveningRitual);
  return {
    settings: {
      defaultSection,
      interfaceDensity,
      reduceMotion,
      showMobileWeekday,
      eveningRitual: eveningRitual.settings,
    },
    recoveredFromInvalidValue: eveningRitual.recoveredFromInvalidValue,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
