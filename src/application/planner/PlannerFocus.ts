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
  ) {}
  get(date: string) {
    return this.repository.getFocus(focusWeek(date).id);
  }
  async setRole(date: string, goalId: string, role: FocusRole | null) {
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
