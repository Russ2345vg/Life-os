import type { BalanceState, BalanceRepository } from '../ports/BalanceRepository';
import { createGoalProgressReader } from '../planner/GoalContributions';
import {
  indicatorScore,
  weightedScore,
  sphereScore,
  attentionNeed,
} from '../../domain/balance/BalanceScoring';
import { recommendFocus } from '../../domain/balance/BalanceRecommendations';
import type { PlanningPeriod } from '../../domain/planner/PlanningPeriod';

export function projectLifeBalance(state: BalanceState, today: string) {
  const progress = createGoalProgressReader(state);
  const directions = state.directions.map((direction) => {
    const indicators = state.indicators
      .filter((i) => i.directionId === direction.id.toString() && !i.removed)
      .map((indicator) => {
        const goal = state.goals.find((g) => g.id.toString() === indicator.sourceGoalId);
        const sourceUnavailable = indicator.sourceType === 'quantitativeGoal' && !goal?.measurement;
        return {
          indicator,
          sourceUnavailable,
          score: indicatorScore(
            indicator,
            sourceUnavailable
              ? null
              : (progress(indicator.sourceGoalId ?? '', today)?.percent ?? null),
          ),
        };
      });
    const automaticScore = weightedScore(
      indicators.map((i) => ({ score: i.score, importance: i.indicator.importance })),
    );
    const goals = state.goals.filter((g) => g.directionId?.equals(direction.id));
    const activeGoals = goals.filter((g) => g.status === 'active');
    const ids = new Set(activeGoals.map((g) => g.id.toString()));
    const selectedIds = new Set(
      activeGoals.flatMap((g) => (g.nextActionId ? [g.nextActionId.toString()] : [])),
    );
    const nextAction =
      state.actions
        .filter(
          (a) =>
            a.goalId &&
            ids.has(a.goalId.toString()) &&
            a.archivedAt === null &&
            a.status !== 'completed' &&
            a.status !== 'cancelled',
        )
        .sort(
          (a, b) =>
            Number(selectedIds.has(b.id.toString())) - Number(selectedIds.has(a.id.toString())) ||
            Number(b.isNext) - Number(a.isNext) ||
            (a.plannedDate?.toString() ?? '9999').localeCompare(
              b.plannedDate?.toString() ?? '9999',
            ) ||
            a.id.toString().localeCompare(b.id.toString()),
        )[0] ?? null;
    return {
      direction,
      indicators,
      automaticScore,
      manualScore: direction.manualScore,
      effectiveScore: direction.manualScore ?? automaticScore,
      goals,
      activeGoals,
      nextAction,
    };
  });
  const spheres = state.spheres.map((sphere) => {
    const owned = directions.filter((d) => d.direction.sphereId?.equals(sphere.id));
    const automaticScore = sphereScore(
      owned.map((d) => ({
        score: d.effectiveScore,
        importance: d.direction.importance,
        status: d.direction.status,
      })),
    );
    const effectiveScore = sphere.manualScore ?? automaticScore;
    return {
      sphere,
      directions: owned,
      automaticScore,
      manualScore: sphere.manualScore,
      effectiveScore,
      ...attentionNeed(effectiveScore, sphere.desiredLevel, sphere.importance),
    };
  });
  return { directions, spheres };
}
export type LifeBalanceProjection = ReturnType<typeof projectLifeBalance>;
export function sphereForGoal(state: BalanceState, goalId: string): string | null {
  const goal = state.goals.find((g) => g.id.toString() === goalId);
  if (!goal) return null;
  const direction = goal.directionId
    ? state.directions.find((d) => d.id.equals(goal.directionId!))
    : undefined;
  return (goal.sphereId ?? direction?.sphereId)?.toString() ?? null;
}
export function balancePeriodContext(
  state: BalanceState,
  today: string,
  period: PlanningPeriod | null,
  projection = projectLifeBalance(state, today),
) {
  const reader = createGoalProgressReader(state);
  const selected = new Set(
    state.memberships
      .filter((m) => m.periodId === period?.id && m.entityType === 'goal' && !m.removed)
      .map((m) => m.entityId),
  );
  const recommendations = recommendFocus(
    projection.spheres
      .filter((s) => s.sphere.status === 'active' && s.sphere.includeInBalanceWheel)
      .map((s) => ({ id: s.sphere.id.toString(), attentionNeed: s.attentionNeed })),
    period?.kind ?? 'quarter',
  );
  return Object.fromEntries(
    projection.spheres.map((s) => {
      const goals = state.goals.filter(
        (g) =>
          selected.has(g.id.toString()) &&
          sphereForGoal(state, g.id.toString()) === s.sphere.id.toString(),
      );
      const scores = goals.map((g) => {
        const closed = state.decisions.find(
          (d) =>
            d.periodId === period?.id && d.entityType === 'goal' && d.entityId === g.id.toString(),
        );
        if (closed?.resultAtDecision)
          return closed.resultAtDecision.target !== null
            ? closed.resultAtDecision.percent
            : closed.statusAtDecision === 'achieved'
              ? 100
              : 0;
        if (closed && !g.measurement) return closed.statusAtDecision === 'achieved' ? 100 : 0;
        return g.measurement
          ? (reader(g.id.toString(), period && period.endDate < today ? period.endDate : today)
              ?.percent ?? null)
          : g.status === 'achieved'
            ? 100
            : 0;
      });
      const available = scores.filter((n): n is number => n !== null);
      return [
        s.sphere.id.toString(),
        {
          progress: available.length
            ? available.reduce((a, b) => a + b, 0) / available.length
            : null,
          incomplete: available.length < scores.length,
          goalCount: goals.length,
          recommended: period ? (recommendations[s.sphere.id.toString()] ?? null) : null,
        },
      ];
    }),
  );
}
export class GetLifeBalance {
  constructor(readonly repository: BalanceRepository) {}
  execute() {
    return this.repository.read();
  }
}
