import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { addDays, assertPlanningRecord, type PlanningRecord } from './PlanningPeriod';
export type ActionPriority = 'high' | 'normal' | 'low';
export interface ActionOccurrence {
  readonly ruleId: string;
  readonly slot: string;
  readonly ruleRevision: number;
  readonly originalDate: string;
  readonly manualDate?: boolean;
}
export type RecurrenceSchedule =
  | { readonly kind: 'count' }
  | { readonly kind: 'daily' }
  | { readonly kind: 'weekdays'; readonly weekdays: readonly number[] }
  | { readonly kind: 'interval'; readonly days: number }
  | { readonly kind: 'monthly'; readonly day: number };
export interface RecurrenceRule extends PlanningRecord {
  readonly title: string;
  readonly goalId: string | null;
  readonly priority: ActionPriority | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly maxCompletions: number | null;
  readonly paused: boolean;
  readonly pauseUntil: string | null;
  readonly schedule: RecurrenceSchedule;
  readonly revision: number;
  readonly effectiveFrom: string;
}
export function validateRule(rule: RecurrenceRule): RecurrenceRule {
  assertPlanningRecord(rule);
  DayDate.create(rule.startDate);
  DayDate.create(rule.effectiveFrom);
  if (rule.endDate !== null) DayDate.create(rule.endDate);
  if (rule.pauseUntil !== null) DayDate.create(rule.pauseUntil);
  const s = rule.schedule;
  if (
    typeof rule.title !== 'string' ||
    !rule.title.trim() ||
    rule.title.length > 200 ||
    !Number.isInteger(rule.revision) ||
    rule.revision < 1 ||
    typeof rule.paused !== 'boolean' ||
    (rule.goalId !== null && typeof rule.goalId !== 'string') ||
    (rule.priority !== null && !['high', 'normal', 'low'].includes(rule.priority)) ||
    (rule.endDate !== null && rule.endDate < rule.startDate) ||
    (rule.maxCompletions !== null &&
      (!Number.isInteger(rule.maxCompletions) || rule.maxCompletions < 1)) ||
    !s ||
    !['daily', 'weekdays', 'interval', 'monthly', 'count'].includes(s.kind) ||
    (s.kind === 'count' && rule.maxCompletions === null) ||
    (s.kind === 'weekdays' &&
      (!Array.isArray(s.weekdays) ||
        s.weekdays.length === 0 ||
        s.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) ||
    (s.kind === 'interval' && (!Number.isInteger(s.days) || s.days < 1 || s.days > 3650)) ||
    (s.kind === 'monthly' && (!Number.isInteger(s.day) || s.day < 1 || s.day > 31))
  )
    throw new DomainError('recurrence.invalid_rule', 'Проверьте расписание и границы повторения.');
  return Object.freeze({
    ...rule,
    schedule: Object.freeze({
      ...s,
      ...(s.kind === 'weekdays' ? { weekdays: Object.freeze([...s.weekdays]) } : {}),
    }),
  });
}
export function occurrenceSlots(
  rule: RecurrenceRule,
  from: string,
  to: string,
  completions: readonly { key: string; date: string; at?: string }[],
) {
  validateRule(rule);
  DayDate.create(from);
  DayDate.create(to);
  if (to < from || to > addDays(from, 62))
    throw new DomainError('recurrence.window_too_large', 'Выберите окно не длиннее 63 дней.');
  if (
    rule.maxCompletions !== null &&
    new Set(completions.map((c) => c.key)).size >= rule.maxCompletions
  )
    return [];
  if (rule.paused && rule.pauseUntil === null) return [];
  if (rule.schedule.kind === 'count') {
    if (rule.paused && rule.pauseUntil && from < rule.pauseUntil) return [];
    const last = [...completions]
      .sort((a, b) => (a.at ?? a.date).localeCompare(b.at ?? b.date) || a.key.localeCompare(b.key))
      .at(-1);
    const date = [
      from,
      rule.startDate,
      rule.effectiveFrom,
      ...(rule.paused && rule.pauseUntil ? [rule.pauseUntil] : []),
    ]
      .sort()
      .at(-1)!;
    if (date > to || (rule.endDate && date > rule.endDate)) return [];
    const slot = last ? `after:${last.key}` : 'first';
    return [
      { id: `occurrence:${encodeURIComponent(rule.id)}:${encodeURIComponent(slot)}`, slot, date },
    ];
  }
  const start = [
    from,
    rule.startDate,
    rule.effectiveFrom,
    ...(rule.paused && rule.pauseUntil ? [rule.pauseUntil] : []),
  ]
    .sort()
    .at(-1)!;
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  const slots: { id: string; slot: string; date: string }[] = [];
  const add = (date: string, slot = date) => {
    if (date >= start && date <= end)
      slots.push({
        id: `occurrence:${encodeURIComponent(rule.id)}:${encodeURIComponent(slot)}`,
        slot,
        date,
      });
  };
  const s = rule.schedule;
  if (s.kind === 'interval') {
    const last = [...completions]
      .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
      .at(-1);
    const due = last ? addDays(last.date, s.days) : rule.startDate;
    add(due < start ? start : due, last ? `after:${last.key}` : 'first');
  } else
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (
        s.kind === 'daily' ||
        (s.kind === 'weekdays' && s.weekdays.includes(weekday)) ||
        (s.kind === 'monthly' && Number(date.slice(8)) === s.day)
      )
        add(date);
    }
  return slots;
}
