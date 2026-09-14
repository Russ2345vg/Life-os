import type { PeriodPlanning } from './PeriodPlanning';
import { automaticPeriod } from '../../domain/planner/PlanningPeriod';
import { EntityId } from '../../domain';
import {
  changeFocusRole,
  focusPeriod,
  focusWeek,
  type FocusRole,
} from '../../domain/planner/FocusPeriod';
import { DomainError } from '../../shared/errors/DomainError';
import type { PlannerRepository } from '../ports/PlannerRepository';
import type { GoalRepository } from '../ports/GoalRepository';
import type { Clock } from '../ports/Clock';

export class PlannerFocus {
  constructor(
    readonly repository: PlannerRepository,
    readonly goals: GoalRepository,
    readonly clock: Clock,
    readonly periods?: PeriodPlanning,
  ) {}
  async get(date: string) {
    if (this.periods) {
      const state = await this.periods.load(),
        key = automaticPeriod('week', date).id,
        p = state.periods.find((v) => v.id === key);
      if (!p) return null;
      return {
        id: focusWeek(date).id,
        startDate: p.startDate,
        endDate: p.endDate,
        goals: state.memberships
          .filter((m) => m.periodId === key && !m.removed && m.focused && m.entityType === 'goal')
          .map((m) => ({
            goalId: m.entityId,
            role: (p.primaryGoalId === m.entityId ? 'primary' : 'supporting') as FocusRole,
          })),
        updatedAt: p.updatedAt,
        version: p.version,
        schemaVersion: 1 as const,
      };
    }
    return this.repository.getFocus(focusWeek(date).id);
  }
  async setRole(date: string, goalId: string, role: FocusRole | null) {
    if (this.periods) {
      await this.periods.setFocus('week', date, goalId, role);
      return this.get(date);
    }
    const goal = await this.goals.findById(EntityId.create(goalId));
    if (role !== null && goal?.status !== 'active')
      throw new DomainError('focus.inactive_goal', 'В фокус можно добавить только активную цель.');
    const week = focusWeek(date);
    const now = this.clock.now().toISOString();
    return this.repository.changeFocus(week.id, (current) =>
      changeFocusRole(
        current ??
          focusPeriod({
            ...week,
            goals: [],
            updatedAt: now,
            version: 1,
            schemaVersion: 1,
          }),
        goalId,
        role,
        now,
      ),
    );
  }
}
