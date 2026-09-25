import { addDays } from '../../domain/planner/PlanningPeriod';
import { localDate } from '../planner/planningSupport';
import type { TrashFilter, TrashItem } from './TrashItem';
import type { TrashRepository } from './TrashRepository';

export class TrashCatalog {
  public constructor(private readonly repository: TrashRepository) {}

  public async list(filter: TrashFilter): Promise<readonly TrashItem[]> {
    const [goals, actions, series] = await Promise.all([
      filter === 'all' || filter === 'goals' ? this.repository.listDeletedGoals() : [],
      filter === 'all' || filter === 'actions' ? this.repository.listDeletedActions() : [],
      filter === 'all' || filter === 'series' ? this.repository.listRemovedSeries() : [],
    ]);
    const items: TrashItem[] = [];
    for (const goal of goals) {
      const deletedAt = goal.deletedAt;
      if (deletedAt)
        items.push({
          type: 'goal',
          id: goal.id.toString(),
          title: goal.title,
          deletedAt,
          purgeAt: addDays(localDate(deletedAt), 30),
        });
    }
    for (const action of actions) {
      const deletedAt = action.deletedAt;
      if (deletedAt && !action.occurrence)
        items.push({
          type: 'action',
          id: action.id.toString(),
          title: action.title.toString(),
          deletedAt,
          purgeAt: addDays(localDate(deletedAt), 30),
        });
    }
    for (const rule of series) {
      if (rule.removedAt == null || rule.purgedAt != null) continue;
      const deletedAt = new Date(rule.removedAt);
      items.push({
        type: 'series',
        id: rule.id,
        title: rule.title,
        deletedAt,
        purgeAt: addDays(localDate(deletedAt), 30),
      });
    }
    return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }
}
