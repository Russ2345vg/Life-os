import { WALK_INTENT, type Walk, type WalkIntent } from '../../domain';
import type { RoutineWalkDestinationRequest } from '../routine/RoutineWalkNavigation';
import { WALK_IMPACT_OPTIONS, WALK_INTENT_PRESENTATION } from './WalkSessionPresentation';
import { WALK_TYPE_PRESENTATION } from './walkPresentation';

export type WalkHistoryFilter = 'all' | WalkIntent;
export const WALK_HISTORY_FILTERS: readonly {
  readonly value: WalkHistoryFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'Все' },
  { value: 'free', label: 'Свободные' },
  { value: 'recovery', label: 'Восстановительные' },
  { value: 'reflection', label: 'Размышление' },
];

export function walkHistoryLabel(walk: Walk): string {
  return walk.intent === null
    ? WALK_TYPE_PRESENTATION[walk.type].label
    : WALK_INTENT_PRESENTATION[walk.intent].shortLabel;
}

export function walkHistoryImpact(walk: Walk): string | null {
  return WALK_IMPACT_OPTIONS.find((option) => option.value === walk.impact)?.label ?? null;
}

export function walkHistorySummary(walk: Walk): string {
  if (walk.impact === null && walk.result === null) return 'Без итога';
  if (walk.intent === WALK_INTENT.recovery && walk.beforeState !== null && walk.afterState !== null)
    return `Напряжение ${walk.beforeState.tension} → ${walk.afterState.tension}`;
  return walk.result ?? walkHistoryImpact(walk) ?? 'Без итога';
}

export function walkHistoryStates(walk: Walk) {
  return (
    [
      ['energy', 'Энергия'],
      ['tension', 'Напряжение'],
      ['clarity', 'Ясность'],
    ] as const
  ).map(([key, label]) => ({
    label,
    before: walk.beforeState === null ? 'Не отмечено' : String(walk.beforeState[key]),
    after: walk.afterState === null ? 'Не отмечено' : String(walk.afterState[key]),
  }));
}

const PAGE_SIZE = 20;
export function walkHistoryPage(walks: readonly Walk[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(walks.length / PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.max(0, Math.min(pages - 1, Math.floor(requestedPage)))
    : 0;
  const start = page * PAGE_SIZE;
  return { page, pages, start, items: walks.slice(start, start + PAGE_SIZE) };
}

export function walkHistoryDate(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}
export function walkHistoryTime(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(value);
}

/** Historical navigation points at the source occurrence, never at a Reentry next step. */
export function walkHistoryRoutineDestination(walk: Walk): RoutineWalkDestinationRequest {
  const source = walk.returnContext?.routineContext?.source;
  return source === undefined
    ? { date: walk.date, focus: null }
    : { date: source.effectiveDate, focus: source };
}
