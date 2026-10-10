import { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export type AutopilotReference = {
  readonly kind: 'direction' | 'goal' | 'action';
  readonly id: string;
};
export type AutopilotFocus = { readonly kind: 'direction' | 'goal'; readonly id: string };
export interface AutopilotPreferences {
  readonly focus: AutopilotFocus | null;
  readonly maxActions: number;
  readonly morningMinutes: number;
  readonly eveningMinutes: number;
  readonly walk: {
    readonly enabled: boolean;
    readonly startMinute: number | null;
    readonly minutes: number;
  };
  readonly manualWakeMinute: number | null;
  readonly manualBedtimeMinute: number | null;
}
export interface AutopilotDayDraft {
  readonly date: string;
  readonly wishes: string;
  readonly startMinute: number | null;
  readonly endMinute: number | null;
  readonly wishReferences: readonly AutopilotReference[];
  readonly excludedActionIds: readonly string[];
  readonly durationOverrides: readonly { readonly actionId: string; readonly minutes: number }[];
  readonly activeWalkEndMinute: number | null;
}
export function defaultAutopilotPreferences(): AutopilotPreferences {
  return {
    focus: null,
    maxActions: 5,
    morningMinutes: 30,
    eveningMinutes: 45,
    walk: { enabled: true, startMinute: null, minutes: 30 },
    manualWakeMinute: null,
    manualBedtimeMinute: null,
  };
}
export function defaultAutopilotDayDraft(date: string): AutopilotDayDraft {
  DayDate.create(date);
  return {
    date,
    wishes: '',
    startMinute: null,
    endMinute: null,
    wishReferences: [],
    excludedActionIds: [],
    durationOverrides: [],
    activeWalkEndMinute: null,
  };
}
function invalid(): never {
  throw new DomainError(
    'day_autopilot.invalid_settings',
    'Проверьте настройки автопилота: даты, целые минуты и лимит от 1 до 12 дел.',
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    return invalid();
  return value;
}
function optionalMinute(value: unknown, end = false): number | null {
  return value === null ? null : integer(value, end ? 1 : 0, end ? 1440 : 1439);
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  return value;
}
function reference(value: unknown): AutopilotReference {
  const raw = object(value);
  if (raw.kind !== 'direction' && raw.kind !== 'goal' && raw.kind !== 'action') return invalid();
  return { kind: raw.kind, id: id(raw.id) };
}
export function validateAutopilotPreferences(value: unknown): AutopilotPreferences {
  const raw = object(value);
  const walk = object(raw.walk);
  const focus = raw.focus === null ? null : reference(raw.focus);
  if (focus?.kind === 'action' || typeof walk.enabled !== 'boolean') return invalid();
  return {
    focus: focus ? { kind: focus.kind, id: focus.id } : null,
    maxActions: integer(raw.maxActions, 1, 12),
    morningMinutes: integer(raw.morningMinutes, 1, 1440),
    eveningMinutes: integer(raw.eveningMinutes, 1, 1440),
    walk: {
      enabled: walk.enabled,
      startMinute: optionalMinute(walk.startMinute),
      minutes: integer(walk.minutes, 1, 1440),
    },
    manualWakeMinute: optionalMinute(raw.manualWakeMinute),
    manualBedtimeMinute: optionalMinute(raw.manualBedtimeMinute),
  };
}
export function validateAutopilotDayDraft(value: unknown): AutopilotDayDraft {
  const raw = object(value);
  const date = id(raw.date);
  DayDate.create(date);
  if (
    typeof raw.wishes !== 'string' ||
    !Array.isArray(raw.wishReferences) ||
    !Array.isArray(raw.excludedActionIds) ||
    !Array.isArray(raw.durationOverrides)
  )
    return invalid();
  const startMinute = optionalMinute(raw.startMinute);
  const endMinute = optionalMinute(raw.endMinute, true);
  if (startMinute !== null && endMinute !== null && endMinute <= startMinute) return invalid();
  const durationOverrides = raw.durationOverrides.map((item: unknown) => {
    const override = object(item);
    return { actionId: id(override.actionId), minutes: integer(override.minutes, 1, 1440) };
  });
  const excludedActionIds = raw.excludedActionIds.map(id);
  const wishReferences = raw.wishReferences.map(reference);
  if (
    new Set(durationOverrides.map((item) => item.actionId)).size !== durationOverrides.length ||
    new Set(excludedActionIds).size !== excludedActionIds.length ||
    new Set(wishReferences.map((item) => `${item.kind}:${item.id}`)).size !== wishReferences.length
  )
    return invalid();
  return {
    date,
    wishes: raw.wishes,
    startMinute,
    endMinute,
    wishReferences,
    excludedActionIds,
    durationOverrides,
    activeWalkEndMinute: optionalMinute(raw.activeWalkEndMinute, true),
  };
}
