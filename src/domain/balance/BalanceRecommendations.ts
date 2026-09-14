import type { PeriodKind } from '../planner/PlanningPeriod';
export const BALANCE_FOCUS_SLOTS: Readonly<Record<PeriodKind, number>> = {
  year: 5,
  quarter: 4,
  thirty_days: 4,
  week: 4,
};
export function recommendFocus(
  spheres: readonly { readonly id: string; readonly attentionNeed: number | null }[],
  period: PeriodKind,
): Record<string, number | null> {
  const result: Record<string, number | null> = Object.fromEntries(
    spheres.map((s) => [s.id, s.attentionNeed === null ? null : 0]),
  );
  const eligible = spheres.filter(
    (s): s is { id: string; attentionNeed: number } =>
      s.attentionNeed !== null && Number.isFinite(s.attentionNeed) && s.attentionNeed > 0,
  );
  const total = eligible.reduce((n, s) => n + s.attentionNeed, 0);
  if (!total) return result;
  let remaining = BALANCE_FOCUS_SLOTS[period];
  const ranks = eligible
    .map((s) => {
      const quota = (BALANCE_FOCUS_SLOTS[period] * s.attentionNeed) / total;
      result[s.id] = Math.floor(quota);
      remaining -= Math.floor(quota);
      return { id: s.id, remainder: quota - Math.floor(quota) };
    })
    .sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const item of ranks) {
    if (remaining <= 0) break;
    result[item.id] = (result[item.id] ?? 0) + 1;
    remaining--;
  }
  return result;
}
