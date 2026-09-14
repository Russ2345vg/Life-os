import { goalProgress } from './GoalContributions';
import {
  automaticPeriod,
  thirtyDayPeriod,
  membershipId,
  focusWarning,
  type PeriodKind,
  type PlanningPeriod,
  type PeriodMembership,
} from '../../domain/planner/PlanningPeriod';
import type { PlanningRepository, PlanningState } from '../ports/PlanningRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import { DomainError } from '../../shared/errors/DomainError';
import { put, requireGoal, requireAction, planningJournal } from './planningSupport';
export class PeriodPlanning {
  constructor(
    readonly repository: PlanningRepository,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}
  async load(): Promise<PlanningState> {
    return this.repository.change((s) => {
      this.importFocus(s);
      return s;
    });
  }
  async startCycle(startDate: string) {
    return this.repository.change((s) => {
      const candidate = thirtyDayPeriod(startDate);
      const existing = s.periods
        .filter(
          (p) =>
            p.kind === 'thirty_days' && p.startDate <= candidate.endDate && p.endDate >= startDate,
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))[0];
      if (existing) return existing;
      const period = { ...candidate, updatedAt: this.clock.now().toISOString() };
      s.periods.push(period);
      return period;
    });
  }
  async setOutcome(kind: PeriodKind, date: string, outcome: string) {
    return this.repository.change((s) => {
      if (outcome.length > 2000)
        throw new DomainError(
          'planning.outcome_too_long',
          'Результат не должен превышать 2000 символов.',
        );
      const p = this.ensurePeriod(s, kind, date);
      put(s.periods, {
        ...p,
        outcome: outcome.trim(),
        version: p.version + 1,
        updatedAt: this.clock.now().toISOString(),
      });
    });
  }
  async participate(
    kind: PeriodKind,
    date: string,
    type: 'goal' | 'action',
    entityId: string,
    removed = false,
  ) {
    return this.repository.change((s) => {
      if (type === 'goal') requireGoal(s, entityId);
      else requireAction(s, entityId);
      const p = this.ensurePeriod(s, kind, date);
      this.membership(s, p.id, type, entityId, removed);
      if (removed && p.primaryGoalId === entityId)
        put(s.periods, {
          ...p,
          primaryGoalId: null,
          version: p.version + 1,
          updatedAt: this.clock.now().toISOString(),
        });
    });
  }
  async setFocus(
    kind: PeriodKind,
    date: string,
    goalId: string,
    role: 'primary' | 'supporting' | null,
  ) {
    return this.repository.change((s) => {
      const goal = requireGoal(s, goalId);
      if (role && goal.status !== 'active')
        throw new DomainError(
          'focus.inactive_goal',
          'В фокус можно добавить только активную цель.',
        );
      const p = this.ensurePeriod(s, kind, date);
      const m = this.membership(s, p.id, 'goal', goalId, false);
      put(s.memberships, {
        ...m,
        focused: role !== null,
        version: m.version + 1,
        updatedAt: this.clock.now().toISOString(),
      });
      const ownedPeriod = { ...p, legacyFocusVersion: null };
      if (role === 'primary' || p.primaryGoalId === goalId || p.legacyFocusVersion !== undefined)
        put(s.periods, {
          ...ownedPeriod,
          primaryGoalId:
            role === 'primary' ? goalId : p.primaryGoalId === goalId ? null : p.primaryGoalId,
          version: p.version + 1,
          updatedAt: this.clock.now().toISOString(),
        });
      return focusWarning(
        kind,
        s.memberships.filter((v) => v.periodId === p.id && !v.removed && v.focused).length,
      );
    });
  }
  async carryover(
    periodId: string,
    type: 'goal' | 'action',
    entityId: string,
    decision: 'continue' | 'unplanned' | 'stop' | 'achieved',
    target: PlanningPeriod | null,
  ) {
    return this.repository.change((s) => {
      const source = s.periods.find((p) => p.id === periodId);
      if (!source) throw new DomainError('planning.period_missing', 'Период не найден.');
      const entity = type === 'goal' ? requireGoal(s, entityId) : requireAction(s, entityId);
      const id = `decision:${membershipId(periodId, type, entityId)}`;
      if (s.decisions.some((d) => d.id === id)) return;
      if (decision === 'continue') {
        if (!target || target.startDate <= source.startDate)
          throw new DomainError('planning.target_required', 'Выберите следующий период.');
        if (!s.periods.some((p) => p.id === target.id)) s.periods.push(target);
        this.membership(s, target.id, type, entityId, false);
      }
      if (decision === 'achieved') {
        if (type !== 'goal')
          throw new DomainError(
            'planning.goal_required',
            'Завершите действие обычной командой выполнения.',
          );
        const goal = requireGoal(s, entityId);
        s.goals[s.goals.indexOf(goal)] = goal.update(
          { title: goal.title, status: 'achieved', stage: 'achieved' },
          this.clock.now(),
        );
      }
      const result = type === 'goal' ? goalProgress(s, entityId, source.endDate) : null;
      const snapshot = {
        title: entity.title.toString(),
        current: result?.current ?? null,
        target: result?.target ?? null,
        unit: result?.unit ?? null,
        percent: result?.percent ?? null,
        pending: result?.pending ?? 0,
      };
      const now = this.clock.now();
      s.decisions.push({
        id,
        periodId,
        entityType: type,
        entityId,
        decision,
        targetPeriodId: target?.id ?? null,
        statusAtDecision: decision === 'achieved' ? 'achieved' : entity.status,
        resultAtDecision: snapshot,
        version: 1,
        schemaVersion: 1,
        updatedAt: now.toISOString(),
      });
      s.journal.push(
        planningJournal(
          `journal:${id}`,
          'PlanningPeriod',
          periodId,
          'Решение по завершению периода',
          now,
          { decision, entityId, entityType: type },
        ),
      );
    });
  }
  private ensurePeriod(s: PlanningState, kind: PeriodKind, date: string): PlanningPeriod {
    const candidate = kind === 'thirty_days' ? thirtyDayPeriod(date) : automaticPeriod(kind, date);
    const existing = s.periods.find((p) => p.id === candidate.id);
    if (existing) return existing;
    if (kind === 'thirty_days')
      throw new DomainError('planning.start_cycle_first', 'Сначала начните 30-дневный цикл.');
    s.periods.push(candidate);
    return candidate;
  }
  private membership(
    s: PlanningState,
    periodId: string,
    entityType: 'goal' | 'action',
    entityId: string,
    removed: boolean,
  ): PeriodMembership {
    const id = membershipId(periodId, entityType, entityId),
      previous = s.memberships.find((m) => m.id === id);
    const owned = { ...previous, legacyVersion: null };
    const next: PeriodMembership = {
      ...owned,
      id,
      periodId,
      entityType,
      entityId,
      removed,
      focused: removed ? false : (previous?.focused ?? false),
      version: (previous?.version ?? 0) + 1,
      schemaVersion: 1,
      updatedAt: this.clock.now().toISOString(),
    };
    put(s.memberships, next);
    return next;
  }
  private importFocus(s: PlanningState): void {
    for (const focus of s.legacyFocus) {
      const candidate = automaticPeriod('week', focus.startDate),
        period = s.periods.find((p) => p.id === candidate.id);
      for (const entry of focus.goals) {
        if (!s.goals.some((g) => g.id.toString() === entry.goalId)) continue;
        const id = membershipId(candidate.id, 'goal', entry.goalId),
          previous = s.memberships.find((m) => m.id === id);
        if (previous && (previous.legacyVersion == null || previous.legacyVersion >= focus.version))
          continue;
        if (!previous && period && period.legacyFocusVersion == null) continue;
        put(s.memberships, {
          id,
          periodId: candidate.id,
          entityType: 'goal',
          entityId: entry.goalId,
          focused: true,
          removed: false,
          legacyVersion: focus.version,
          version: (previous?.version ?? 0) + 1,
          schemaVersion: 1,
          updatedAt: focus.updatedAt,
        });
      }
      for (const m of s.memberships) {
        if (
          m.periodId === candidate.id &&
          m.legacyVersion != null &&
          m.legacyVersion < focus.version &&
          !focus.goals.some((g) => g.goalId === m.entityId)
        )
          put(s.memberships, {
            ...m,
            removed: true,
            focused: false,
            legacyVersion: focus.version,
            version: m.version + 1,
            updatedAt: focus.updatedAt,
          });
      }
      if (
        !period ||
        (period.legacyFocusVersion != null && period.legacyFocusVersion < focus.version)
      ) {
        const primary =
          focus.goals.find(
            (g) => g.role === 'primary' && s.goals.some((goal) => goal.id.toString() === g.goalId),
          )?.goalId ?? null;
        put(s.periods, {
          ...candidate,
          ...period,
          primaryGoalId: primary,
          legacyFocusVersion: focus.version,
          version: (period?.version ?? 0) + 1,
          updatedAt: focus.updatedAt,
        });
      }
    }
  }
}
