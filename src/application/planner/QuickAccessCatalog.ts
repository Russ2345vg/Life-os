import type { GetDirections } from '../queries/GetDirections';
import type { GetGoals } from '../queries/GetGoals';
import type { GetSpheres } from '../queries/GetSpheres';
import type { PlannerCatalog } from './PlannerCatalog';
import { selectRecurringActionRepresentatives } from './actionSelection';

export interface QuickAccessReaders {
  readonly plannerCatalog: Pick<PlannerCatalog, 'actions'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}
export interface QuickAccessRecord {
  readonly kind: 'action' | 'goal' | 'direction' | 'sphere';
  readonly id: string;
  readonly title: string;
  readonly context: string;
  readonly status: string;
  readonly date: string | null;
  readonly recurring: boolean;
  readonly canSchedule: boolean;
  readonly canClearDate: boolean;
}

/** Read-only projection. A failed reader must never masquerade as an empty section. */
export async function readQuickAccessCatalog(
  readers: QuickAccessReaders,
): Promise<readonly QuickAccessRecord[]> {
  const [actions, allGoals, allDirections, spheres] = await Promise.all([
    readers.plannerCatalog.actions(),
    readers.getGoals.execute(),
    readers.getDirections.execute(),
    readers.getSpheres.execute(),
  ]);
  const goals = allGoals.filter((g) => g.status !== 'archived');
  const directions = allDirections.filter((d) => d.status !== 'archived');
  const byGoal = new Map(goals.map((g) => [g.id.toString(), g]));
  const byDirection = new Map(directions.map((d) => [d.id.toString(), d]));
  const bySphere = new Map(spheres.active.map((s) => [s.id.toString(), s]));
  const context = (sphereId?: string, directionId?: string, goalId?: string) => {
    const goal = goalId ? byGoal.get(goalId) : undefined;
    const direction = byDirection.get((goal ? goal.directionId?.toString() : directionId) ?? '');
    const sphere = bySphere.get(
      direction?.sphereId?.toString() ?? goal?.sphereId?.toString() ?? sphereId ?? '',
    );
    return [sphere?.name, direction?.name, goal?.title].filter(Boolean).join(' · ');
  };
  const base = { date: null, recurring: false, canSchedule: false, canClearDate: false } as const;
  return [
    ...selectRecurringActionRepresentatives(
      actions.filter((a) => !a.isArchived() && !['completed', 'cancelled'].includes(a.status)),
    ).map((a): QuickAccessRecord => ({
      kind: 'action',
      id: a.id.toString(),
      title: a.title.toString(),
      context: context(a.sphereId?.toString(), a.directionId?.toString(), a.goalId?.toString()),
      status: a.status,
      date: a.plannedDate?.toString() ?? null,
      recurring: a.occurrence !== null,
      canSchedule: a.status === 'draft' || a.status === 'ready',
      canClearDate: a.status === 'draft' && !a.expectedResult && !a.readyAt && !a.startedAt,
    })),
    ...goals.map((g): QuickAccessRecord => ({
      ...base,
      kind: 'goal',
      id: g.id.toString(),
      title: g.title,
      context: context(g.sphereId?.toString(), g.directionId?.toString()),
      status: g.status,
    })),
    ...directions.map((d): QuickAccessRecord => ({
      ...base,
      kind: 'direction',
      id: d.id.toString(),
      title: d.name,
      context: context(d.sphereId?.toString()),
      status: d.status,
    })),
    ...spheres.active.map((s): QuickAccessRecord => ({
      ...base,
      kind: 'sphere',
      id: s.id.toString(),
      title: s.name,
      context: '',
      status: s.status,
    })),
  ];
}

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ');
export function searchQuickAccess(records: readonly QuickAccessRecord[], query: string) {
  const needle = normalize(query);
  const terms = needle.split(' ').filter(Boolean);
  const ranked = records
    .flatMap((record) => {
      const title = normalize(record.title);
      const haystack = `${title} ${normalize(record.context)}`;
      if (!terms.every((term) => haystack.includes(term))) return [];
      const rank =
        !needle || title === needle
          ? 0
          : title.startsWith(needle)
            ? 1
            : terms.every((term) => title.includes(term))
              ? 2
              : 3;
      return [{ record, rank, title }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.title.localeCompare(b.title, 'ru') ||
        a.record.id.localeCompare(b.record.id) ||
        a.record.kind.localeCompare(b.record.kind),
    );
  return { items: ranked.slice(0, 30).map((r) => r.record), total: ranked.length };
}
