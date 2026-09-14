import { IMPORTANCE_WEIGHT, type BalanceImportance } from './BalanceImportance';
import type { DirectionIndicator } from './DirectionIndicator';
import type { DirectionStatus } from '../direction/DirectionStatus';

export function clampScore(value: number): number | null {
  return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : null;
}
export function indicatorScore(
  indicator: DirectionIndicator,
  goalPercent: number | null,
): number | null {
  if (indicator.removed) return null;
  if (indicator.sourceType === 'quantitativeGoal')
    return goalPercent === null ? null : clampScore(goalPercent / 10);
  if (indicator.value === null) return null;
  if (indicator.type === 'rating') return clampScore(indicator.value);
  if (indicator.type === 'boolean') return indicator.value ? 10 : 0;
  const current = indicator.value,
    target = indicator.target;
  if (!Number.isFinite(current)) return null;
  if (target.kind === 'atLeast')
    return target.value > 0 ? clampScore((current / target.value) * 10) : null;
  if (target.kind === 'atMost')
    return current <= target.value
      ? 10
      : current > 0
        ? clampScore((target.value / current) * 10)
        : null;
  if (current >= target.min && current <= target.max) return 10;
  if (current < target.min) return target.min > 0 ? clampScore((current / target.min) * 10) : null;
  return current > 0 ? clampScore((target.max / current) * 10) : null;
}
export interface WeightedScore {
  readonly score: number | null;
  readonly importance: BalanceImportance;
}
export function weightedScore(values: readonly WeightedScore[]): number | null {
  let sum = 0,
    weights = 0;
  for (const value of values) {
    if (value.score === null || !Number.isFinite(value.score)) continue;
    const weight = IMPORTANCE_WEIGHT[value.importance];
    sum += value.score * weight;
    weights += weight;
  }
  return weights ? sum / weights : null;
}
export function effectiveScore(manual: number | null, automatic: number | null): number | null {
  return manual ?? automatic;
}
export function sphereScore(
  directions: readonly (WeightedScore & { readonly status: DirectionStatus })[],
): number | null {
  return weightedScore(directions.filter((d) => d.status === 'active'));
}
export function attentionNeed(
  current: number | null,
  desired: number | null,
  importance: BalanceImportance,
) {
  const gap = current === null || desired === null ? null : Math.max(0, desired - current);
  return { gap, attentionNeed: gap === null ? null : gap * IMPORTANCE_WEIGHT[importance] };
}
