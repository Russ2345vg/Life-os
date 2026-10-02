import type { Direction, Goal, LifeAction } from '../../domain';
import { resolveActionNeed, resolveGoalNeed } from '../../domain/planner/resolveEntityNeed';

export const STARTER_NEEDS = [
  'Безопасность',
  'Близость',
  'Здоровье',
  'Отдых',
  'Свобода',
  'Самостоятельность',
  'Принадлежность',
  'Развитие',
  'Признание',
  'Творчество',
  'Смысл',
  'Радость',
] as const;

export interface NeedLink {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly inherited: boolean;
}

export interface NeedCatalogEntry {
  readonly key: string;
  readonly title: string;
  readonly starter: boolean;
  readonly directions: readonly NeedLink[];
  readonly goals: readonly NeedLink[];
  readonly actions: readonly NeedLink[];
}

export function needKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

export function buildNeedCatalog(data: {
  readonly directions: readonly Direction[];
  readonly goals: readonly Goal[];
  readonly actions: readonly LifeAction[];
}): readonly NeedCatalogEntry[] {
  const entries = new Map<
    string,
    {
      title: string;
      starter: boolean;
      directions: NeedLink[];
      goals: NeedLink[];
      actions: NeedLink[];
    }
  >();
  const ensure = (text: string, starter = false) => {
    const title = text.trim();
    const key = needKey(title);
    if (!key) return null;
    const existing = entries.get(key);
    if (existing) return existing;
    const entry = { title, starter, directions: [], goals: [], actions: [] };
    entries.set(key, entry);
    return entry;
  };
  STARTER_NEEDS.forEach((text) => ensure(text, true));
  for (const direction of data.directions) {
    if (!direction.need) continue;
    ensure(direction.need)?.directions.push({
      id: direction.id.toString(),
      title: direction.name,
      status: direction.status,
      inherited: false,
    });
  }
  for (const goal of data.goals) {
    if (goal.isDeleted()) continue;
    const need = resolveGoalNeed(goal, data.directions);
    if (!need) continue;
    ensure(need.text)?.goals.push({
      id: goal.id.toString(),
      title: goal.title,
      status: goal.status,
      inherited: need.source !== 'own',
    });
  }
  for (const action of data.actions) {
    if (action.isDeleted()) continue;
    const need = resolveActionNeed(action, data.goals, data.directions);
    if (!need) continue;
    ensure(need.text)?.actions.push({
      id: action.id.toString(),
      title: action.title.toString(),
      status: action.status,
      inherited: need.source !== 'own',
    });
  }
  return [...entries].map(([key, entry]) => ({ key, ...entry }));
}
