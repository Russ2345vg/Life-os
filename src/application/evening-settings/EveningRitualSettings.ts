import { isRelaxationPractice, RELAXATION_PRACTICE, type RelaxationPractice } from '../../domain';
import {
  environmentPreparationRequirements,
  recommendedEnvironmentCoreKeys,
} from '../preparation/EnvironmentPreparationCatalog';

export interface EveningRitualItemSettings {
  readonly key: string;
  readonly recommendedDurationMinutes: number;
}

export interface EveningRitualSettings {
  readonly targetSleepTime: string;
  readonly requiredCoreItems: readonly string[];
  readonly defaultRelaxationPractice: RelaxationPractice;
  readonly defaultScreenFreeDuration: number;
  readonly adaptiveRelaxationEnabled: boolean;
  readonly notificationEnabled: boolean;
  readonly allowConsciousSkip: boolean;
  readonly items: readonly EveningRitualItemSettings[];
}

export interface EveningRitualSettingsParseResult {
  readonly settings: EveningRitualSettings;
  readonly recoveredFromInvalidValue: boolean;
}

const DEFAULT_ITEM_DURATION_MINUTES: Readonly<Record<string, number>> = Object.freeze({
  'ENVIRONMENT:SLEEP:VENTILATE_ROOM': 5,
  'ENVIRONMENT:SLEEP:DIM_LIGHTS': 2,
  'ENVIRONMENT:SLEEP:REMOVE_ACTIVE_SCREENS': 2,
  'ENVIRONMENT:SLEEP:PREPARE_BED': 5,
  'ENVIRONMENT:SLEEP:REDUCE_NOISE': 2,
  'ENVIRONMENT:SLEEP:PHONE_AWAY': 2,
  'ENVIRONMENT:TOMORROW:CLOTHES': 5,
  'ENVIRONMENT:TOMORROW:WATER': 2,
  'ENVIRONMENT:TOMORROW:ALARM': 2,
  'ENVIRONMENT:TOMORROW:NECESSARY_ITEMS': 5,
  'ENVIRONMENT:TOMORROW:WORKSPACE': 5,
  'ENVIRONMENT:TOMORROW:FIRST_ACTION': 5,
});

const CATALOG_REQUIREMENTS = environmentPreparationRequirements(null);

export const EVENING_RITUAL_ITEM_CATALOG: readonly Readonly<{
  key: string;
  title: string;
  defaultRecommendedDurationMinutes: number;
}>[] = Object.freeze(
  CATALOG_REQUIREMENTS.map((item) =>
    Object.freeze({
      key: item.key,
      title: item.title,
      defaultRecommendedDurationMinutes: DEFAULT_ITEM_DURATION_MINUTES[item.key] ?? 5,
    }),
  ),
);

const DEFAULT_ITEMS = Object.freeze(
  EVENING_RITUAL_ITEM_CATALOG.map((item) =>
    Object.freeze({
      key: item.key,
      recommendedDurationMinutes: item.defaultRecommendedDurationMinutes,
    }),
  ),
);

export const DEFAULT_EVENING_RITUAL_SETTINGS: EveningRitualSettings = Object.freeze({
  targetSleepTime: '23:00',
  requiredCoreItems: Object.freeze(recommendedEnvironmentCoreKeys(CATALOG_REQUIREMENTS)),
  defaultRelaxationPractice: RELAXATION_PRACTICE.reading,
  defaultScreenFreeDuration: 25,
  adaptiveRelaxationEnabled: true,
  notificationEnabled: false,
  allowConsciousSkip: true,
  items: DEFAULT_ITEMS,
});

export function copyEveningRitualSettings(settings: EveningRitualSettings): EveningRitualSettings {
  return {
    targetSleepTime: settings.targetSleepTime,
    requiredCoreItems: [...settings.requiredCoreItems],
    defaultRelaxationPractice: settings.defaultRelaxationPractice,
    defaultScreenFreeDuration: settings.defaultScreenFreeDuration,
    adaptiveRelaxationEnabled: settings.adaptiveRelaxationEnabled,
    notificationEnabled: settings.notificationEnabled,
    allowConsciousSkip: settings.allowConsciousSkip,
    items: settings.items.map((item) => ({ ...item })),
  };
}

export function parseEveningRitualSettings(value: unknown): EveningRitualSettingsParseResult {
  if (value === undefined) {
    return {
      settings: copyEveningRitualSettings(DEFAULT_EVENING_RITUAL_SETTINGS),
      recoveredFromInvalidValue: false,
    };
  }
  if (!isRecord(value)) {
    return defaultParseResult(true);
  }

  let recovered = false;
  const targetSleepTime = isTargetSleepTime(value.targetSleepTime)
    ? value.targetSleepTime
    : recover(DEFAULT_EVENING_RITUAL_SETTINGS.targetSleepTime);
  const requiredCoreItems = parseRequiredCore(value.requiredCoreItems);
  recovered ||= requiredCoreItems.recovered;
  const defaultRelaxationPractice =
    typeof value.defaultRelaxationPractice === 'string' &&
    isRelaxationPractice(value.defaultRelaxationPractice)
      ? value.defaultRelaxationPractice
      : recover(DEFAULT_EVENING_RITUAL_SETTINGS.defaultRelaxationPractice);
  const defaultScreenFreeDuration = isScreenFreeDuration(value.defaultScreenFreeDuration)
    ? value.defaultScreenFreeDuration
    : recover(DEFAULT_EVENING_RITUAL_SETTINGS.defaultScreenFreeDuration);
  const adaptiveRelaxationEnabled =
    typeof value.adaptiveRelaxationEnabled === 'boolean'
      ? value.adaptiveRelaxationEnabled
      : recover(DEFAULT_EVENING_RITUAL_SETTINGS.adaptiveRelaxationEnabled);
  const notificationEnabled =
    typeof value.notificationEnabled === 'boolean'
      ? value.notificationEnabled
      : recover(DEFAULT_EVENING_RITUAL_SETTINGS.notificationEnabled);
  const allowConsciousSkip =
    typeof value.allowConsciousSkip === 'boolean'
      ? value.allowConsciousSkip
      : recover(DEFAULT_EVENING_RITUAL_SETTINGS.allowConsciousSkip);
  const items = parseItems(value.items);
  recovered ||= items.recovered;

  return {
    settings: {
      targetSleepTime,
      requiredCoreItems: requiredCoreItems.value,
      defaultRelaxationPractice,
      defaultScreenFreeDuration,
      adaptiveRelaxationEnabled,
      notificationEnabled,
      allowConsciousSkip,
      items: items.value,
    },
    recoveredFromInvalidValue: recovered,
  };

  function recover<T>(fallback: T): T {
    recovered = true;
    return fallback;
  }
}

export function isEveningRitualSettings(value: EveningRitualSettings): boolean {
  const parsed = parseEveningRitualSettings(value);
  return !parsed.recoveredFromInvalidValue && sameSettings(parsed.settings, value);
}

function parseRequiredCore(
  value: unknown,
): Readonly<{ value: readonly string[]; recovered: boolean }> {
  if (!Array.isArray(value)) {
    return { value: [...DEFAULT_EVENING_RITUAL_SETTINGS.requiredCoreItems], recovered: true };
  }
  const catalogKeys = new Set(EVENING_RITUAL_ITEM_CATALOG.map((item) => item.key));
  const valid = value.filter(
    (key): key is string => typeof key === 'string' && catalogKeys.has(key),
  );
  const unique = [...new Set(valid)];
  const changed = unique.length !== value.length;
  if (unique.length < 3 || unique.length > 6) {
    return { value: [...DEFAULT_EVENING_RITUAL_SETTINGS.requiredCoreItems], recovered: true };
  }
  return { value: unique, recovered: changed };
}

function parseItems(
  value: unknown,
): Readonly<{ value: readonly EveningRitualItemSettings[]; recovered: boolean }> {
  if (!Array.isArray(value)) {
    return { value: DEFAULT_ITEMS.map((item) => ({ ...item })), recovered: true };
  }
  const catalogByKey = new Map(EVENING_RITUAL_ITEM_CATALOG.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const parsed: EveningRitualItemSettings[] = [];
  let recovered = false;
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.key !== 'string') {
      recovered = true;
      continue;
    }
    const catalogItem = catalogByKey.get(candidate.key);
    if (
      catalogItem === undefined ||
      seen.has(candidate.key) ||
      !isRecommendedDuration(candidate.recommendedDurationMinutes)
    ) {
      recovered = true;
      continue;
    }
    seen.add(candidate.key);
    parsed.push({
      key: candidate.key,
      recommendedDurationMinutes: candidate.recommendedDurationMinutes,
    });
  }
  for (const catalogItem of EVENING_RITUAL_ITEM_CATALOG) {
    if (seen.has(catalogItem.key)) continue;
    recovered = true;
    parsed.push({
      key: catalogItem.key,
      recommendedDurationMinutes: catalogItem.defaultRecommendedDurationMinutes,
    });
  }
  return { value: parsed, recovered };
}

function sameSettings(left: EveningRitualSettings, right: EveningRitualSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTargetSleepTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function isScreenFreeDuration(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 20 && Number(value) <= 30;
}

function isRecommendedDuration(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 60;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultParseResult(recovered: boolean): EveningRitualSettingsParseResult {
  return {
    settings: copyEveningRitualSettings(DEFAULT_EVENING_RITUAL_SETTINGS),
    recoveredFromInvalidValue: recovered,
  };
}
