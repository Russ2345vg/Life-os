import type { PlanningRepository, PlanningState } from '../ports/PlanningRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import {
  validateMeasurement,
  measureProgress,
  measurementCycle,
  type GoalMeasurement,
} from '../../domain/planner/GoalMeasurement';
import {
  contributionId,
  linkId,
  type ContributionLink,
  type ProgressContribution,
} from '../../domain/planner/ProgressContribution';
import { contributionIsEffective } from '../../domain/planner/CompletionContributions';
import { DomainError } from '../../shared/errors/DomainError';
import { requireGoal, requireAction, put, planningJournal, localDate } from './planningSupport';

/** Builds indexes once per loaded state; React reads only the selected goal's contributions. */
export function createGoalProgressReader(state: PlanningState) {
  const actions = new Map(state.actions.map((a) => [a.id.toString(), a]));
  const goals = new Map(state.goals.map((g) => [g.id.toString(), g]));
  const byGoal = new Map<string, ProgressContribution[]>();
  const delivered = new Set(state.contributions.map((c) => c.id)),
    incomplete = new Set<string>();
  for (const action of state.actions)
    if (action.status === 'completed')
      for (const expected of action.expectedContributions ?? [])
        if (!delivered.has(expected.id)) incomplete.add(expected.goalId);
  for (const c of state.contributions) {
    if (!contributionIsEffective(c, actions)) continue;
    const group = byGoal.get(c.goalId) ?? [];
    group.push(c);
    byGoal.set(c.goalId, group);
  }
  const cache = new Map<string, ReturnType<typeof calculate>>();
  function calculate(goalId: string, date: string) {
    const goal = goals.get(goalId);
    if (!goal?.measurement) return null;
    const cycle = measurementCycle(goal.measurement, date),
      values = (byGoal.get(goalId) ?? []).filter(
        (c) => c.effectiveDate <= date && (!cycle || c.effectiveDate >= cycle.startDate),
      );
    const complete = delivered.has(`initial:${goalId}`) && !incomplete.has(goalId);
    const measured = measureProgress(
      goal.measurement,
      values.reduce((sum, c) => sum + (c.amount ?? 0), 0),
    )!;
    return {
      complete,
      ...measureProgress(
        goal.measurement,
        values.reduce((sum, c) => sum + (c.amount ?? 0), 0),
      )!,
      reached: complete && measured.reached,
      percent: complete ? measured.percent : null,
      pending: values.filter((c) => c.amount === null).length,
      cycle,
    };
  }
  return (goalId: string, date: string) => {
    const key = JSON.stringify([goalId, date]);
    if (!cache.has(key)) cache.set(key, calculate(goalId, date));
    return cache.get(key) ?? null;
  };
}
export function goalProgress(state: PlanningState, goalId: string, date: string) {
  return createGoalProgressReader(state)(goalId, date);
}
export class GoalContributions {
  constructor(
    readonly repository: PlanningRepository,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}
  async configure(
    goalId: string,
    measurement: GoalMeasurement | null,
    initial: number | null = null,
    dueDate?: string | null,
  ) {
    validateMeasurement(measurement);
    if (initial !== null && !Number.isFinite(initial))
      throw new DomainError('progress.invalid_value', 'Введите число.');
    return this.repository.change((s) => {
      const goal = requireGoal(s, goalId),
        now = this.clock.now();
      if (goal.measurement && !s.contributions.some((c) => c.id === `initial:${goalId}`))
        throw new DomainError('progress.awaiting_sync', 'Начальное значение ещё синхронизируется.');
      const next = goal.update(
        {
          title: goal.title,
          measurement,
          progress: measurement ? null : goal.progress,
          ...(dueDate === undefined ? {} : { dueDate }),
        },
        now,
      );
      s.goals[s.goals.indexOf(goal)] = next;
      const id = `initial:${goalId}`;
      if (measurement && !s.contributions.some((c) => c.id === id)) {
        const amount =
          initial ??
          (goal.progress?.type === 'metric'
            ? goal.progress.current
            : measurement.mode === 'recurring'
              ? 0
              : (measurement.start ?? 0));
        s.contributions.push(this.fact(id, goalId, amount, 'initial', now, 'Начальное значение'));
        s.journal.push(
          planningJournal(`journal:${id}`, 'Goal', goalId, 'Начальное значение прогресса', now, {
            amount,
          }),
        );
      }
    });
  }
  async setLink(
    sourceType: 'action' | 'rule',
    sourceId: string,
    goalId: string,
    mode: 'fixed' | 'actual',
    amount: number,
    removed = false,
  ) {
    return this.repository.change((s) => {
      const goal = requireGoal(s, goalId);
      if (!goal.measurement)
        throw new DomainError('progress.measurement_required', 'Сначала включите измерение цели.');
      if (sourceType === 'action') requireAction(s, sourceId);
      else if (!s.rules.some((r) => r.id === sourceId))
        throw new DomainError('recurrence.not_found', 'Правило не найдено.');
      if (!Number.isFinite(amount))
        throw new DomainError('progress.invalid_value', 'Введите число.');
      const id = linkId(sourceType, sourceId, goalId),
        previous = s.links.find((l) => l.id === id),
        now = this.clock.now().toISOString();
      const excludedCompletionKeys =
        previous?.excludedCompletionKeys ??
        s.actions
          .filter(
            (a) =>
              a.status === 'completed' &&
              (sourceType === 'action'
                ? a.id.toString() === sourceId
                : a.occurrence?.ruleId === sourceId),
          )
          .map((a) => a.completionKey);
      const link: ContributionLink = {
        id,
        sourceType,
        sourceId,
        goalId,
        mode,
        amount,
        removed,
        effectiveFrom: previous?.effectiveFrom ?? now,
        excludedCompletionKeys,
        version: (previous?.version ?? 0) + 1,
        schemaVersion: 1,
        updatedAt: now,
      };
      put(s.links, link);
      return link;
    });
  }
  async adjust(
    goalId: string,
    amount: number,
    reason: string,
    commandId: string,
    mode: 'delta' | 'set' = 'delta',
  ) {
    return this.repository.change((s) => {
      requireGoal(s, goalId);
      const id = `adjustment:${commandId}`;
      if (s.contributions.some((c) => c.id === id)) return;
      if (!Number.isFinite(amount))
        throw new DomainError('progress.invalid_value', 'Введите число.');
      const now = this.clock.now(),
        current = goalProgress(s, goalId, localDate(now));
      if (!current) throw new DomainError('progress.measurement_required', 'У цели нет измерения.');
      if (mode === 'set' && !current.complete)
        throw new DomainError(
          'progress.awaiting_sync',
          'Дождитесь загрузки вкладов перед заменой текущего значения.',
        );
      const delta = mode === 'set' ? amount - current.current : amount;
      s.contributions.push(this.fact(id, goalId, delta, 'manual', now, reason));
      s.journal.push(
        planningJournal(`journal:${id}`, 'Goal', goalId, 'Корректировка прогресса', now, {
          amount: delta,
          reason,
          mode,
        }),
      );
    });
  }
  async setActual(id: string, amount: number, reason = 'Фактический результат') {
    return this.repository.change((s) => {
      if (!Number.isFinite(amount))
        throw new DomainError('progress.invalid_value', 'Введите число.');
      const c = s.contributions.find((v) => v.id === id);
      if (!c) throw new DomainError('progress.not_found', 'Вклад не найден.');
      if (
        c.voided ||
        (c.actionId &&
          (requireAction(s, c.actionId).status !== 'completed' ||
            requireAction(s, c.actionId).completionKey !== c.completionKey))
      )
        throw new DomainError('progress.completion_changed', 'Выполнение уже отменено.');
      if (c.amount === amount) return;
      const now = this.clock.now();
      put(s.contributions, {
        ...c,
        amount,
        reason,
        version: c.version + 1,
        updatedAt: now.toISOString(),
      });
      s.journal.push(
        planningJournal(
          this.ids.generate().toString(),
          'Goal',
          c.goalId,
          'Исправление количественного результата',
          now,
          { contributionId: id, previous: c.amount, amount, reason },
        ),
      );
    });
  }
  async reopen(actionId: string) {
    return this.repository.change((s) => {
      const action = requireAction(s, actionId);
      if (action.status !== 'completed') return;
      const key = action.completionKey,
        now = this.clock.now();
      action.reopen(now);
      for (const c of s.contributions.filter((c) => c.completionKey === key))
        put(s.contributions, {
          ...c,
          voided: true,
          reason: 'Выполнение отменено',
          version: c.version + 1,
          updatedAt: now.toISOString(),
        });
      s.journal.push(
        planningJournal(`reopen:${key}`, 'LifeAction', actionId, 'Выполнение отменено', now, {
          completionKey: key,
        }),
      );
    });
  }
  async previewBackfill(linkIdValue: string) {
    const state = await this.repository.read();
    return this.preview(state, linkIdValue);
  }
  async applyBackfill(linkIdValue: string, expectedKeys: readonly string[], fingerprint: string) {
    return this.repository.change((s) => {
      const preview = this.preview(s, linkIdValue);
      const requested = new Set(expectedKeys);
      const changed = preview.candidates.filter((c) => requested.has(c.id));
      if (
        changed.length !==
        expectedKeys.filter((id) => !s.contributions.some((c) => c.id === id)).length
      )
        throw new DomainError(
          'progress.preview_changed',
          'Выполнения изменились. Обновите предварительный расчёт.',
        );
      if (changed.length === 0) return;
      if (fingerprint !== preview.fingerprint)
        throw new DomainError(
          'progress.preview_changed',
          'Расчёт изменился. Обновите предварительный просмотр.',
        );
      s.contributions.push(...changed);
      const now = this.clock.now();
      s.journal.push(
        planningJournal(
          this.ids.generate().toString(),
          'Goal',
          preview.goalId,
          'Учтены прошлые выполнения',
          now,
          { count: changed.length, linkId: linkIdValue },
        ),
      );
    });
  }
  private preview(s: PlanningState, id: string) {
    const link = s.links.find((l) => l.id === id && !l.removed);
    if (!link) throw new DomainError('progress.link_missing', 'Связь не найдена.');
    const candidates = s.actions
      .filter(
        (a) =>
          a.status === 'completed' &&
          a.completedAt &&
          (link.sourceType === 'action'
            ? a.id.toString() === link.sourceId
            : a.occurrence?.ruleId === link.sourceId),
      )
      .map((a) => ({
        ...this.fact(
          contributionId(a.completionKey, id),
          link.goalId,
          link.mode === 'fixed' ? link.amount : null,
          'backfill',
          a.completedAt!,
          'Учтено прошлое выполнение',
        ),
        actionId: a.id.toString(),
        completionKey: a.completionKey,
        linkId: id,
        effectiveDate: a.completedOn ?? a.completedAt!.toISOString().slice(0, 10),
      }))
      .filter((c) => !s.contributions.some((v) => v.id === c.id));
    const cycle = measurementCycle(
      requireGoal(s, link.goalId).measurement!,
      localDate(this.clock.now()),
    );
    return {
      fingerprint: JSON.stringify({ linkVersion: link.version, candidates }),
      goalId: link.goalId,
      candidates,
      count: candidates.length,
      current: goalProgress(s, link.goalId, localDate(this.clock.now()))?.current ?? 0,
      added: candidates
        .filter(
          (c) => !cycle || (c.effectiveDate >= cycle.startDate && c.effectiveDate <= cycle.endDate),
        )
        .reduce((n, c) => n + (c.amount ?? 0), 0),
    };
  }
  private fact(
    id: string,
    goalId: string,
    amount: number | null,
    source: ProgressContribution['source'],
    now: Date,
    reason: string,
  ): ProgressContribution {
    return {
      id,
      goalId,
      amount,
      source,
      actionId: null,
      completionKey: null,
      linkId: null,
      effectiveDate: localDate(now),
      occurredAt: now.toISOString(),
      voided: false,
      reason,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    };
  }
}
