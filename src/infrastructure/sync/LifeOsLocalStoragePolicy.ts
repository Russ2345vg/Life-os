import {
  parseEveningRitualSettings,
  type EveningRitualSettings,
} from '../../application/evening-settings';

export type LocalStorageSyncClassification =
  'sync_now' | 'requires_later_adapter' | 'ui_local_only' | 'technical_local_only' | 'deny_unknown';

export interface LifeOsLocalStoragePolicyEntry {
  readonly key: string;
  readonly classification: Exclude<LocalStorageSyncClassification, 'deny_unknown'>;
  readonly meaningfulFields: readonly string[];
}

export interface MeaningfulLocalSettingsSnapshot {
  readonly eveningRitual: EveningRitualSettings;
}

export const LIFE_OS_LOCAL_STORAGE_SYNC_ALLOWLIST: readonly string[] = Object.freeze([
  'lifeos.local-settings.v1',
]);

export const LIFE_OS_LOCAL_STORAGE_POLICY: readonly LifeOsLocalStoragePolicyEntry[] = Object.freeze(
  [
    Object.freeze({
      key: 'lifeos.local-settings.v1',
      classification: 'sync_now',
      meaningfulFields: Object.freeze(['eveningRitual']),
    }),
  ],
);

export function classifyLifeOsLocalStorageKey(key: string): LocalStorageSyncClassification {
  return (
    LIFE_OS_LOCAL_STORAGE_POLICY.find((entry) => entry.key === key)?.classification ??
    'deny_unknown'
  );
}

export function projectMeaningfulLocalSettings(
  rawValue: string | null,
): MeaningfulLocalSettingsSnapshot | null {
  if (rawValue === null) return null;

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed) || !Object.hasOwn(parsed, 'eveningRitual')) return null;
    const eveningRitual = parseEveningRitualSettings(parsed.eveningRitual);
    if (eveningRitual.recoveredFromInvalidValue) return null;
    return { eveningRitual: eveningRitual.settings };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
