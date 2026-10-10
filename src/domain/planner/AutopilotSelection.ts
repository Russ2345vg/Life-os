import type { LifeAction } from '../life-action/LifeAction';
import type { Goal } from '../goal/Goal';
import type { Direction } from '../direction/Direction';
import type { ContributionLink } from './ProgressContribution';
import type { AutopilotReference, AutopilotFocus } from './AutopilotPreferences';
import { DomainError } from '../../shared/errors/DomainError';

export interface AutopilotCatalog {
  readonly actions: readonly LifeAction[];
  readonly goals: readonly Goal[];
  readonly directions: readonly Direction[];
  readonly links: readonly ContributionLink[];
}
export interface AutopilotWishResolution {
  readonly matches: readonly AutopilotReference[];
  readonly unresolved: readonly {
    readonly text: string;
    readonly candidates: readonly AutopilotReference[];
  }[];
}
export interface AutopilotCandidateGroups {
  readonly main: readonly string[];
  readonly focus: readonly string[];
  readonly wishes: readonly {
    readonly reference: AutopilotReference;
    readonly actionIds: readonly string[];
  }[];
  readonly todayFallback: readonly string[];
  readonly excluded: readonly {
    readonly actionId: string;
    readonly reason: 'future_date' | 'inactive' | 'duplicate_occurrence';
  }[];
}
export function isAutopilotOpenAction(action: LifeAction): boolean {
  return (
    !action.isDeleted() &&
    !action.isArchived() &&
    (action.status === 'draft' || action.status === 'ready')
  );
}
export function autopilotReferenceTitle(
  ref: AutopilotReference,
  catalog: AutopilotCatalog,
): string {
  if (ref.kind === 'direction')
    return catalog.directions.find((item) => item.id.toString() === ref.id)?.name ?? ref.id;
  if (ref.kind === 'goal')
    return catalog.goals.find((item) => item.id.toString() === ref.id)?.title ?? ref.id;
  return catalog.actions.find((item) => item.id.toString() === ref.id)?.title.toString() ?? ref.id;
}
function availableReferences(catalog: AutopilotCatalog): readonly AutopilotReference[] {
  return [
    ...catalog.directions
      .filter((item) => item.status === 'active')
      .map((item): AutopilotReference => ({ kind: 'direction', id: item.id.toString() })),
    ...catalog.goals
      .filter((item) => item.status === 'active' && !item.isDeleted())
      .map((item): AutopilotReference => ({ kind: 'goal', id: item.id.toString() })),
    ...catalog.actions
      .filter(isAutopilotOpenAction)
      .map((item): AutopilotReference => ({ kind: 'action', id: item.id.toString() })),
  ];
}
const key = (ref: AutopilotReference): string => `${ref.kind}:${ref.id}`;
function normalize(value: string): string {
  return value
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
export function resolveAutopilotWishes(
  text: string,
  catalog: AutopilotCatalog,
  explicit: readonly AutopilotReference[],
): AutopilotWishResolution {
  const entries = availableReferences(catalog).map((ref) => ({
    ref,
    title: normalize(autopilotReferenceTitle(ref, catalog)),
  }));
  const known = new Set(entries.map((item) => key(item.ref)));
  if (explicit.some((ref) => !known.has(key(ref))))
    throw new DomainError(
      'day_autopilot.wish_unavailable',
      'Выбранное пожелание больше недоступно. Выберите существующее направление, цель или дело.',
    );
  const matches = new Map<string, AutopilotReference>();
  const unresolved: AutopilotWishResolution['unresolved'][number][] = [];
  const exactWhole = entries.some((entry) => entry.title === normalize(text));
  const segments = exactWhole
    ? [text]
    : text.split(/[;\n,]+|\s+и\s+/iu).filter((value) => normalize(value));
  for (const segment of segments) {
    const query = normalize(segment);
    const exact = entries.filter((entry) => entry.title === query);
    const candidates = (
      exact.length
        ? exact
        : entries.filter(
            (entry) =>
              query.split(' ').every((term) => entry.title.includes(term)) ||
              ` ${query} `.includes(` ${entry.title} `),
          )
    ).map((entry) => entry.ref);
    const selected = candidates.filter((ref) =>
      explicit.some((chosen) => key(chosen) === key(ref)),
    );
    const resolved =
      selected.length === 1 ? selected[0] : candidates.length === 1 ? candidates[0] : undefined;
    if (resolved) matches.set(key(resolved), resolved);
    else unresolved.push({ text: segment.trim(), candidates });
  }
  for (const ref of explicit) matches.set(key(ref), ref);
  return { matches: [...matches.values()], unresolved };
}
export function selectAutopilotCandidates(
  date: string,
  catalog: AutopilotCatalog,
  focus: AutopilotFocus | null,
  wishes: readonly AutopilotReference[],
): AutopilotCandidateGroups {
  const available = new Set(availableReferences(catalog).map(key));
  if (focus && !available.has(key(focus)))
    throw new DomainError(
      'day_autopilot.focus_unavailable',
      'Главный фокус удалён или неактивен. Выберите новый фокус.',
    );
  if (wishes.some((ref) => !available.has(key(ref))))
    throw new DomainError('day_autopilot.wish_unavailable', 'Обновите выбранные пожелания.');
  const excluded: AutopilotCandidateGroups['excluded'][number][] = [];
  const eligible: LifeAction[] = [];
  const occurrences = new Map<string, LifeAction>();
  for (const action of catalog.actions) {
    const actionId = action.id.toString();
    const actionDate = action.plannedDate?.toString() ?? action.occurrence?.originalDate ?? null;
    if (!isAutopilotOpenAction(action)) {
      excluded.push({ actionId, reason: 'inactive' });
      continue;
    }
    if (actionDate !== null && actionDate > date) {
      excluded.push({ actionId, reason: 'future_date' });
      continue;
    }
    if (!action.occurrence) {
      eligible.push(action);
      continue;
    }
    const previous = occurrences.get(action.occurrence.ruleId);
    const previousDate =
      previous?.plannedDate?.toString() ?? previous?.occurrence?.originalDate ?? '';
    if (
      !previous ||
      (actionDate ?? '') > previousDate ||
      ((actionDate ?? '') === previousDate && actionId < previous.id.toString())
    ) {
      if (previous)
        excluded.push({ actionId: previous.id.toString(), reason: 'duplicate_occurrence' });
      occurrences.set(action.occurrence.ruleId, action);
    } else excluded.push({ actionId, reason: 'duplicate_occurrence' });
  }
  eligible.push(...occurrences.values());
  const priorities = { high: 0, normal: 1, low: 2 };
  eligible.sort(
    (a, b) =>
      priorities[a.priority ?? 'normal'] - priorities[b.priority ?? 'normal'] ||
      (a.plannedDate?.toString() ?? date).localeCompare(b.plannedDate?.toString() ?? date) ||
      a.createdAt.toISOString().localeCompare(b.createdAt.toISOString()) ||
      a.id.toString().localeCompare(b.id.toString()),
  );
  const goalDirections = new Map(
    catalog.goals
      .filter((item) => item.status === 'active' && !item.isDeleted())
      .map((item) => [item.id.toString(), item.directionId?.toString() ?? null]),
  );
  const actionLinks = new Map<string, Set<string>>(),
    ruleLinks = new Map<string, Set<string>>();
  for (const link of catalog.links) {
    if (link.removed || link.effectiveFrom > date || !goalDirections.has(link.goalId)) continue;
    const index = link.sourceType === 'action' ? actionLinks : ruleLinks;
    const goals = index.get(link.sourceId) ?? new Set<string>();
    goals.add(link.goalId);
    index.set(link.sourceId, goals);
  }
  const relatedGoals = (action: LifeAction): ReadonlySet<string> =>
    new Set([
      ...(action.goalId && goalDirections.has(action.goalId.toString())
        ? [action.goalId.toString()]
        : []),
      ...(actionLinks.get(action.id.toString()) ?? []),
      ...(action.occurrence ? (ruleLinks.get(action.occurrence.ruleId) ?? []) : []),
    ]);
  const matches = (action: LifeAction, ref: AutopilotReference): boolean => {
    if (ref.kind === 'action') return action.id.toString() === ref.id;
    const goals = relatedGoals(action);
    if (ref.kind === 'goal') return goals.has(ref.id);
    return (
      action.directionId?.toString() === ref.id ||
      [...goals].some((goalId) => goalDirections.get(goalId) === ref.id)
    );
  };
  return {
    main: eligible
      .filter((item) => item.isNext && item.plannedDate?.toString() === date)
      .map((item) => item.id.toString()),
    focus: focus
      ? eligible.filter((item) => matches(item, focus)).map((item) => item.id.toString())
      : [],
    wishes: wishes.map((reference) => ({
      reference,
      actionIds: eligible
        .filter((item) => matches(item, reference))
        .map((item) => item.id.toString()),
    })),
    todayFallback:
      !focus && wishes.length === 0
        ? eligible
            .filter((item) => item.plannedDate?.toString() === date)
            .map((item) => item.id.toString())
        : [],
    excluded,
  };
}
