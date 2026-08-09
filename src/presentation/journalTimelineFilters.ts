import {
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  SESSION_COMPLETION_KIND,
  type JournalEntryType,
} from '../domain';
import type { JournalTimelineItem } from '../application';

export const JOURNAL_TYPE_FILTER = {
  all: 'all',
  day: JOURNAL_SUBJECT_TYPE.day,
  decision: JOURNAL_SUBJECT_TYPE.decision,
  lifeAction: JOURNAL_SUBJECT_TYPE.lifeAction,
  workSession: JOURNAL_SUBJECT_TYPE.workSession,
  correction: JOURNAL_ENTRY_TYPE.dataCorrected,
} as const;

export type JournalTypeFilter = (typeof JOURNAL_TYPE_FILTER)[keyof typeof JOURNAL_TYPE_FILTER];

export const JOURNAL_STATE_FILTER = {
  all: 'all',
  created: 'created',
  started: 'started',
  paused: 'paused',
  resumed: 'resumed',
  completed: 'completed',
  interrupted: 'interrupted',
  rescheduled: 'rescheduled',
  cancelled: 'cancelled',
  corrected: 'corrected',
} as const;

export type JournalStateFilter = (typeof JOURNAL_STATE_FILTER)[keyof typeof JOURNAL_STATE_FILTER];

export const JOURNAL_SPHERE_FILTER = {
  all: 'all',
  withoutSphere: 'without-sphere',
} as const;

export interface JournalTimelineFilters {
  readonly query: string;
  readonly date: string;
  readonly sphere: string;
  readonly type: JournalTypeFilter;
  readonly state: JournalStateFilter;
}

export const DEFAULT_JOURNAL_TIMELINE_FILTERS: JournalTimelineFilters = Object.freeze({
  query: '',
  date: '',
  sphere: JOURNAL_SPHERE_FILTER.all,
  type: JOURNAL_TYPE_FILTER.all,
  state: JOURNAL_STATE_FILTER.all,
});

export interface JournalSphereFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface JournalDayGroup {
  readonly date: string;
  readonly items: readonly JournalTimelineItem[];
}

export function filterJournalTimelineItems(
  items: readonly JournalTimelineItem[],
  filters: JournalTimelineFilters,
): readonly JournalTimelineItem[] {
  const query = normalizeSearchValue(filters.query);

  return items.filter((item) => {
    const searchableText = normalizeSearchValue(
      [
        item.entry.labelAtEvent,
        item.entry.correction?.previousValue,
        item.entry.correction?.newValue,
        item.entry.correction?.reason,
      ]
        .filter((value): value is string => value !== null && value !== undefined)
        .join(' '),
    );
    const dateMatches =
      filters.date.length === 0 || item.entry.effectiveDate.toString() === filters.date;
    const sphereMatches = matchesSphere(item, filters.sphere);
    const typeMatches = matchesType(item, filters.type);
    const stateMatches =
      filters.state === JOURNAL_STATE_FILTER.all || journalItemState(item) === filters.state;

    return (
      (query.length === 0 || searchableText.includes(query)) &&
      dateMatches &&
      sphereMatches &&
      typeMatches &&
      stateMatches
    );
  });
}

export function groupJournalItems(
  items: readonly JournalTimelineItem[],
): readonly JournalDayGroup[] {
  const byDate = new Map<string, JournalTimelineItem[]>();
  for (const item of items) {
    const date = item.entry.effectiveDate.toString();
    const group = byDate.get(date) ?? [];
    group.push(item);
    byDate.set(date, group);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, group]) => ({
      date,
      items: group.sort(
        (left, right) =>
          left.entry.occurredAt.getTime() - right.entry.occurredAt.getTime() ||
          left.entry.id.toString().localeCompare(right.entry.id.toString()),
      ),
    }));
}

export function createJournalSphereFilterOptions(
  items: readonly JournalTimelineItem[],
): readonly JournalSphereFilterOption[] {
  const spheres = new Map<string, string>();
  let hasEntriesWithoutSphere = false;

  for (const item of items) {
    if (item.entry.sphereId === null) {
      hasEntriesWithoutSphere = true;
      continue;
    }

    const sphereId = item.entry.sphereId.toString();
    spheres.set(sphereId, item.sphereName ?? 'Сфера недоступна');
  }

  const options: JournalSphereFilterOption[] = [
    { value: JOURNAL_SPHERE_FILTER.all, label: 'Все сферы' },
  ];
  if (hasEntriesWithoutSphere) {
    options.push({ value: JOURNAL_SPHERE_FILTER.withoutSphere, label: 'Без сферы' });
  }

  options.push(
    ...[...spheres.entries()]
      .sort(
        ([leftId, leftName], [rightId, rightName]) =>
          leftName.localeCompare(rightName, 'ru') || leftId.localeCompare(rightId),
      )
      .map(([id, label]) => ({ value: sphereFilterValue(id), label })),
  );
  return options;
}

export function hasActiveJournalTimelineFilters(filters: JournalTimelineFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.date.length > 0 ||
    filters.sphere !== JOURNAL_SPHERE_FILTER.all ||
    filters.type !== JOURNAL_TYPE_FILTER.all ||
    filters.state !== JOURNAL_STATE_FILTER.all
  );
}

export function journalItemState(item: JournalTimelineItem): JournalStateFilter {
  if (
    item.entry.type === JOURNAL_ENTRY_TYPE.workSessionCompleted &&
    item.entry.metadata?.completionKind === SESSION_COMPLETION_KIND.interrupted
  ) {
    return JOURNAL_STATE_FILTER.interrupted;
  }

  return JOURNAL_ENTRY_STATE[item.entry.type];
}

const JOURNAL_ENTRY_STATE: Readonly<
  Record<JournalEntryType, Exclude<JournalStateFilter, 'all' | 'interrupted'>>
> = {
  [JOURNAL_ENTRY_TYPE.dayStarted]: JOURNAL_STATE_FILTER.started,
  [JOURNAL_ENTRY_TYPE.decisionCreated]: JOURNAL_STATE_FILTER.created,
  [JOURNAL_ENTRY_TYPE.workSessionStarted]: JOURNAL_STATE_FILTER.started,
  [JOURNAL_ENTRY_TYPE.workSessionPaused]: JOURNAL_STATE_FILTER.paused,
  [JOURNAL_ENTRY_TYPE.workSessionResumed]: JOURNAL_STATE_FILTER.resumed,
  [JOURNAL_ENTRY_TYPE.workSessionCompleted]: JOURNAL_STATE_FILTER.completed,
  [JOURNAL_ENTRY_TYPE.decisionRescheduled]: JOURNAL_STATE_FILTER.rescheduled,
  [JOURNAL_ENTRY_TYPE.decisionCancelled]: JOURNAL_STATE_FILTER.cancelled,
  [JOURNAL_ENTRY_TYPE.actionRescheduled]: JOURNAL_STATE_FILTER.rescheduled,
  [JOURNAL_ENTRY_TYPE.actionCompleted]: JOURNAL_STATE_FILTER.completed,
  [JOURNAL_ENTRY_TYPE.actionCancelled]: JOURNAL_STATE_FILTER.cancelled,
  [JOURNAL_ENTRY_TYPE.dayCompleted]: JOURNAL_STATE_FILTER.completed,
  [JOURNAL_ENTRY_TYPE.dataCorrected]: JOURNAL_STATE_FILTER.corrected,
};

function matchesType(item: JournalTimelineItem, filter: JournalTypeFilter): boolean {
  if (filter === JOURNAL_TYPE_FILTER.all) return true;
  if (filter === JOURNAL_TYPE_FILTER.correction) {
    return item.entry.type === JOURNAL_ENTRY_TYPE.dataCorrected;
  }
  if (item.entry.type === JOURNAL_ENTRY_TYPE.dataCorrected) return false;
  return item.entry.subjectType === filter;
}

function matchesSphere(item: JournalTimelineItem, filter: string): boolean {
  if (filter === JOURNAL_SPHERE_FILTER.all) return true;
  if (filter === JOURNAL_SPHERE_FILTER.withoutSphere) return item.entry.sphereId === null;
  return (
    item.entry.sphereId !== null && filter === sphereFilterValue(item.entry.sphereId.toString())
  );
}

function sphereFilterValue(id: string): string {
  return `sphere:${id}`;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}
