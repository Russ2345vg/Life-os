import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import type { LifeAction } from '../../domain';

export type ActionSelection =
  | { readonly kind: 'action'; readonly actionId: string }
  | { readonly kind: 'series'; readonly ruleId: string };
export interface ActionOption {
  readonly key: string;
  readonly selection: ActionSelection;
  readonly title: string;
  readonly rule: RecurrenceRule | null;
}
export function selectActionOptions(
  actions: readonly LifeAction[],
  rules: readonly RecurrenceRule[],
  search = '',
): ActionOption[] {
  const available = actions.filter(
    (a) => !a.isArchived() && !['completed', 'cancelled'].includes(a.status),
  );
  const ordinary: ActionOption[] = available
    .filter((a) => !a.occurrence)
    .map((a) => ({
      key: `action:${a.id.toString()}`,
      selection: { kind: 'action', actionId: a.id.toString() },
      title: a.title.toString(),
      rule: null,
    }));
  const series: ActionOption[] = rules
    .filter((r) => r.removedAt == null)
    .filter((r) => {
      const instances = actions.filter((a) => a.occurrence?.ruleId === r.id);
      return !instances.length || instances.some((a) => !a.isArchived());
    })
    .map((r) => ({
      key: `series:${r.id}`,
      selection: { kind: 'series', ruleId: r.id },
      title: r.title,
      rule: r,
    }));
  // A remotely delivered occurrence can arrive before its rule. Keep its stable series identity.
  for (const a of selectRecurringActionRepresentatives(available)) {
    if (a.occurrence && !rules.some((r) => r.id === a.occurrence?.ruleId))
      series.push({
        key: `series:${a.occurrence.ruleId}`,
        selection: { kind: 'series', ruleId: a.occurrence.ruleId },
        title: a.title.toString(),
        rule: null,
      });
  }
  const needle = search.trim().toLocaleLowerCase('ru');
  return [...ordinary, ...series].filter((o) => o.title.toLocaleLowerCase('ru').includes(needle));
}

/**
 * Keeps ordinary actions and one stable representative for every recurring rule.
 * Date-based projections must use the original action collection instead.
 */
export function selectRecurringActionRepresentatives(actions: readonly LifeAction[]): LifeAction[] {
  const ordinary: LifeAction[] = [];
  const recurring = new Map<string, LifeAction>();

  for (const action of actions) {
    const ruleId = action.occurrence?.ruleId;
    if (ruleId === undefined) {
      ordinary.push(action);
      continue;
    }

    const current = recurring.get(ruleId);
    if (current === undefined || isEarlierRecurringAction(action, current)) {
      recurring.set(ruleId, action);
    }
  }

  return [...ordinary, ...recurring.values()];
}

function isEarlierRecurringAction(left: LifeAction, right: LifeAction): boolean {
  const leftDate = left.occurrence?.originalDate ?? '';
  const rightDate = right.occurrence?.originalDate ?? '';
  return (
    leftDate.localeCompare(rightDate) < 0 ||
    (leftDate === rightDate &&
      (left.createdAt.getTime() < right.createdAt.getTime() ||
        (left.createdAt.getTime() === right.createdAt.getTime() &&
          left.id.toString().localeCompare(right.id.toString()) < 0)))
  );
}

export function recurrenceLabel(rule?: RecurrenceRule | null): string {
  const s = rule?.schedule;
  if (!s) return 'Повторяется';
  switch (s.kind) {
    case 'daily':
      return 'Каждый день';
    case 'count':
      return 'Без расписания';
    case 'monthly':
      return s.day + '-го числа каждого месяца';
    case 'interval':
      return 'Через ' + s.days + ' дн. после выполнения';
    case 'weekdays':
      return s.weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => s.weekdays.includes(d))
        ? 'По будням'
        : s.weekdays.map((d) => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d]).join(', ');
  }
}
