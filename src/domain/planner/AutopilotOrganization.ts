import type {
  AutopilotPreferences,
  AutopilotDayDraft,
  AutopilotReference,
} from './AutopilotPreferences';
import { DomainError } from '../../shared/errors/DomainError';
export interface AutopilotBalance {
  readonly directionId: string;
  readonly percent: number;
}
export interface AutopilotActionRule {
  readonly actionId: string;
  readonly context: string | null;
  readonly prerequisiteIds: readonly string[];
}
export interface AutopilotPinnedWindow {
  readonly actionId: string;
  readonly startMinute: number;
  readonly durationMinutes: number;
}
export interface AutopilotTemplate {
  readonly id: string;
  readonly name: string;
  readonly options: Omit<AutopilotPreferences, 'templates' | 'actionRules'>;
  readonly startMinute: number | null;
  readonly endMinute: number | null;
  readonly wishes: string;
  readonly wishReferences: readonly AutopilotReference[];
}
function invalid(message = 'Проверьте баланс, зависимости, шаблоны и закреплённые окна.'): never {
  throw new DomainError('day_autopilot.invalid_organization', message);
}
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  return raw as Record<string, unknown>;
}
function text(raw: unknown, maximum = 200): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > maximum) return invalid();
  return raw.trim();
}
function number(raw: unknown, minimum: number, maximum: number): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < minimum || raw > maximum)
    return invalid();
  return raw;
}
function list(raw: unknown, maximum = 500): readonly unknown[] {
  if (!Array.isArray(raw) || raw.length > maximum) return invalid();
  return raw as unknown[];
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) invalid();
}
export function validatePins(raw: unknown): readonly AutopilotPinnedWindow[] {
  const pins = list(raw, 12).map((value) => {
    const item = record(value);
    const startMinute = number(item.startMinute, 0, 1439),
      durationMinutes = number(item.durationMinutes, 1, 1440);
    if (startMinute + durationMinutes > 1440) invalid();
    return { actionId: text(item.actionId), startMinute, durationMinutes };
  });
  unique(pins.map((pin) => pin.actionId));
  return pins;
}
export function validateOrganization(
  raw: Record<string, unknown>,
  validate: (value: unknown) => AutopilotPreferences,
): Pick<AutopilotPreferences, 'balance' | 'groupSimilar' | 'actionRules' | 'templates'> {
  const result: {
    balance?: readonly AutopilotBalance[];
    groupSimilar?: boolean;
    actionRules?: readonly AutopilotActionRule[];
    templates?: readonly AutopilotTemplate[];
  } = {};
  if (raw.balance !== undefined) {
    result.balance = list(raw.balance, 12).map((value) => {
      const item = record(value);
      return { directionId: text(item.directionId), percent: number(item.percent, 1, 100) };
    });
    unique(result.balance.map((item) => item.directionId));
    if (
      result.balance.length &&
      result.balance.reduce((sum, item) => sum + item.percent, 0) !== 100
    )
      invalid('Сумма долей направлений должна быть 100%.');
  }
  if (raw.groupSimilar !== undefined) {
    if (typeof raw.groupSimilar !== 'boolean') invalid();
    result.groupSimilar = raw.groupSimilar;
  }
  if (raw.actionRules !== undefined) {
    result.actionRules = list(raw.actionRules).map((value) => {
      const item = record(value),
        actionId = text(item.actionId),
        prerequisiteIds = list(item.prerequisiteIds, 50).map((value) => text(value));
      unique(prerequisiteIds);
      if (prerequisiteIds.includes(actionId)) invalid('Действие не может зависеть от самого себя.');
      return {
        actionId,
        context: item.context === null ? null : text(item.context, 80),
        prerequisiteIds,
      };
    });
    unique(result.actionRules.map((item) => item.actionId));
    const graph = new Map(result.actionRules.map((item) => [item.actionId, item.prerequisiteIds]));
    const visited = new Set<string>(),
      active = new Set<string>();
    const visit = (id: string): void => {
      if (active.has(id)) invalid('В зависимостях обнаружен круг. Измените порядок действий.');
      if (visited.has(id)) return;
      active.add(id);
      for (const prerequisite of graph.get(id) ?? []) visit(prerequisite);
      active.delete(id);
      visited.add(id);
    };
    for (const id of graph.keys()) visit(id);
  }
  if (raw.templates !== undefined) {
    result.templates = list(raw.templates, 50).map((value) => {
      const item = record(value),
        options = record(item.options);
      if (options.templates !== undefined || options.actionRules !== undefined) invalid();
      const startMinute = item.startMinute === null ? null : number(item.startMinute, 0, 1439);
      const endMinute = item.endMinute === null ? null : number(item.endMinute, 1, 1440);
      if (startMinute !== null && endMinute !== null && endMinute <= startMinute) invalid();
      if (typeof item.wishes !== 'string') invalid();
      const wishReferences = list(item.wishReferences).map((value): AutopilotReference => {
        const ref = record(value);
        if (ref.kind !== 'direction' && ref.kind !== 'goal' && ref.kind !== 'action')
          return invalid();
        return { kind: ref.kind, id: text(ref.id) };
      });
      return {
        id: text(item.id),
        name: text(item.name, 80),
        options: validate(options),
        startMinute,
        endMinute,
        wishes: item.wishes,
        wishReferences,
      };
    });
    unique(result.templates.map((item) => item.id));
  }
  return result;
}
export function captureAutopilotTemplate(
  id: string,
  name: string,
  preferences: AutopilotPreferences,
  draft: AutopilotDayDraft,
): AutopilotTemplate {
  const options = { ...preferences };
  delete options.templates;
  delete options.actionRules;
  return {
    id,
    name: name.trim(),
    options,
    startMinute: draft.startMinute,
    endMinute: draft.endMinute,
    wishes: draft.wishes,
    wishReferences: draft.wishReferences,
  };
}
export function applyAutopilotTemplate(
  template: AutopilotTemplate,
  preferences: AutopilotPreferences,
  draft: AutopilotDayDraft,
): { preferences: AutopilotPreferences; draft: AutopilotDayDraft } {
  const { templates, actionRules } = preferences;
  return {
    preferences: {
      ...template.options,
      ...(templates ? { templates } : {}),
      ...(actionRules ? { actionRules } : {}),
    },
    draft: {
      ...draft,
      startMinute: template.startMinute,
      endMinute: template.endMinute,
      wishes: template.wishes,
      wishReferences: template.wishReferences,
    },
  };
}
