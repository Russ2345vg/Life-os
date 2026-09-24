import { DayDate, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface PlannerTodayOverview {
  readonly main: LifeAction | null;
  readonly actions: readonly LifeAction[];
  readonly completed: readonly LifeAction[];
  readonly unscheduled: readonly LifeAction[];
  readonly overdue: readonly LifeAction[];
}

export class GetPlannerToday {
  public constructor(readonly repository: LifeActionRepository) {}
  public async execute(date: DayDate): Promise<PlannerTodayOverview> {
    if (!this.repository.findAll)
      throw new DomainError('planner.read_unavailable', 'Не удалось загрузить действия.');
    const all = (await this.repository.findAll())
      .filter((action) => !action.isArchived())
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.toString().localeCompare(b.id.toString()),
      );
    const open = all.filter(
      (action) => action.status !== 'completed' && action.status !== 'cancelled',
    );
    const today = open.filter((action) => action.plannedDate?.equals(date));
    const main = today.find((action) => action.isNext) ?? null;
    return {
      main,
      actions: today.filter((action) => action !== main),
      unscheduled: open.filter((action) => action.plannedDate === null),
      overdue: open
        .filter((action) => action.plannedDate !== null && action.plannedDate.isBefore(date))
        .sort((a, b) => a.plannedDate!.toString().localeCompare(b.plannedDate!.toString())),
      completed: all.filter((action) => {
        const at = action.completedAt;
        return (
          action.status === 'completed' &&
          at !== null &&
          DayDate.fromParts(at.getFullYear(), at.getMonth() + 1, at.getDate()).equals(date)
        );
      }),
    };
  }
}
