import {
  ACTION_LIST_GROUP,
  type ActionListGroup,
  type ActionListItem,
  type SpheresSnapshot,
} from '../application';

export const ACTION_FILTER_ANY = 'all';
export const ACTION_FILTER_NONE = '__none__';

export const ACTION_DURATION_FILTER = {
  all: 'all',
  none: 'none',
  under30: 'under30',
  from30To60: 'from30To60',
  from60To120: 'from60To120',
  over120: 'over120',
} as const;

export type ActionDurationFilter =
  (typeof ACTION_DURATION_FILTER)[keyof typeof ACTION_DURATION_FILTER];

export const ACTION_RESULT_FILTER = {
  all: 'all',
  withResult: 'withResult',
  withoutResult: 'withoutResult',
} as const;

export type ActionResultFilter = (typeof ACTION_RESULT_FILTER)[keyof typeof ACTION_RESULT_FILTER];

export interface ActionListFilters {
  readonly sphere: string;
  readonly decisionId: string;
  readonly group: ActionListGroup | typeof ACTION_FILTER_ANY;
  readonly duration: ActionDurationFilter;
  readonly result: ActionResultFilter;
}

export const DEFAULT_ACTION_LIST_FILTERS: ActionListFilters = Object.freeze({
  sphere: ACTION_FILTER_ANY,
  decisionId: ACTION_FILTER_ANY,
  group: ACTION_FILTER_ANY,
  duration: ACTION_DURATION_FILTER.all,
  result: ACTION_RESULT_FILTER.all,
});

export interface ActionFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface ActionFilterOptions {
  readonly spheres: readonly ActionFilterOption[];
  readonly decisions: readonly ActionFilterOption[];
}

export function filterActionListItems(
  items: readonly ActionListItem[],
  filters: ActionListFilters,
): readonly ActionListItem[] {
  return items.filter((item) => {
    if (!matchesSphere(item, filters.sphere)) {
      return false;
    }
    if (!matchesDecision(item, filters.decisionId)) {
      return false;
    }
    if (filters.group !== ACTION_FILTER_ANY && item.group !== filters.group) {
      return false;
    }
    if (!matchesDuration(item.totalWorkedDurationMs, filters.duration)) {
      return false;
    }
    return matchesResult(item, filters.result);
  });
}

export function buildActionFilterOptions(
  items: readonly ActionListItem[],
  spheresSnapshot?: SpheresSnapshot,
): ActionFilterOptions {
  const spheres = new Map<string, string>();
  const decisions = new Map<string, string>();

  for (const item of items) {
    const sphereId = item.sphereId;
    if (sphereId === null) {
      spheres.set(ACTION_FILTER_NONE, 'Без сферы');
    } else {
      const sphere = [
        ...(spheresSnapshot?.active ?? []),
        ...(spheresSnapshot?.archived ?? []),
      ].find((candidate) => candidate.id.toString() === sphereId);
      spheres.set(
        sphereId,
        sphere === undefined
          ? 'Сфера недоступна'
          : `${sphere.name}${sphere.status === 'archived' ? ' · Архивная' : ''}`,
      );
    }

    const decisionId = item.lifeAction.decisionId?.toString();
    if (decisionId === undefined) {
      decisions.set(ACTION_FILTER_NONE, 'Самостоятельные действия');
    } else {
      decisions.set(decisionId, item.decisionTitle ?? 'Решение без названия');
    }
  }

  return {
    spheres: sortOptions(spheres),
    decisions: sortOptions(decisions),
  };
}

export function countActiveActionFilters(filters: ActionListFilters): number {
  return [
    filters.sphere !== ACTION_FILTER_ANY,
    filters.decisionId !== ACTION_FILTER_ANY,
    filters.group !== ACTION_FILTER_ANY,
    filters.duration !== ACTION_DURATION_FILTER.all,
    filters.result !== ACTION_RESULT_FILTER.all,
  ].filter(Boolean).length;
}

export function isActionListGroup(value: unknown): value is ActionListGroup {
  return Object.values(ACTION_LIST_GROUP).some((group) => group === value);
}

export function isActionDurationFilter(value: unknown): value is ActionDurationFilter {
  return Object.values(ACTION_DURATION_FILTER).some((filter) => filter === value);
}

export function isActionResultFilter(value: unknown): value is ActionResultFilter {
  return Object.values(ACTION_RESULT_FILTER).some((filter) => filter === value);
}

function matchesSphere(item: ActionListItem, sphere: string): boolean {
  if (sphere === ACTION_FILTER_ANY) {
    return true;
  }
  if (sphere === ACTION_FILTER_NONE) {
    return item.sphereId === null;
  }
  return item.sphereId === sphere;
}

function matchesDecision(item: ActionListItem, decisionId: string): boolean {
  if (decisionId === ACTION_FILTER_ANY) {
    return true;
  }
  const itemDecisionId = item.lifeAction.decisionId?.toString();
  if (decisionId === ACTION_FILTER_NONE) {
    return itemDecisionId === undefined;
  }
  return itemDecisionId === decisionId;
}

function matchesDuration(durationMs: number, filter: ActionDurationFilter): boolean {
  const minutes = Math.max(0, durationMs / 60_000);
  switch (filter) {
    case ACTION_DURATION_FILTER.all:
      return true;
    case ACTION_DURATION_FILTER.none:
      return minutes === 0;
    case ACTION_DURATION_FILTER.under30:
      return minutes > 0 && minutes < 30;
    case ACTION_DURATION_FILTER.from30To60:
      return minutes >= 30 && minutes < 60;
    case ACTION_DURATION_FILTER.from60To120:
      return minutes >= 60 && minutes < 120;
    case ACTION_DURATION_FILTER.over120:
      return minutes >= 120;
  }
}

function matchesResult(item: ActionListItem, filter: ActionResultFilter): boolean {
  switch (filter) {
    case ACTION_RESULT_FILTER.all:
      return true;
    case ACTION_RESULT_FILTER.withResult:
      return item.lifeAction.actualResult !== null;
    case ACTION_RESULT_FILTER.withoutResult:
      return item.lifeAction.actualResult === null;
  }
}

function sortOptions(values: ReadonlyMap<string, string>): readonly ActionFilterOption[] {
  return [...values.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}
