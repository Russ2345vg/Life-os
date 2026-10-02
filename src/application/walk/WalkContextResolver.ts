import type { Walk } from '../../domain/walk/Walk';
import type { GoalRepository } from '../ports/GoalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export type WalkSource = {
  readonly kind: 'action' | 'goal' | 'today' | 'walks';
  readonly id?: string;
  readonly label: string;
  readonly available: boolean;
};

export class WalkContextResolver {
  public constructor(
    private readonly actions: LifeActionRepository,
    private readonly goals: GoalRepository,
  ) {}

  public async resolve(walk: Walk): Promise<WalkSource> {
    const link = walk.linkedEntity;
    if (link?.type === 'lifeAction') {
      const action = await this.actions.findById(link.id);
      return {
        kind: 'action',
        id: link.id.toString(),
        label: action?.title.toString() ?? 'Связанное действие удалено или недоступно',
        available: action !== null,
      };
    }
    if (link?.type === 'goal') {
      const goal = await this.goals.findById(link.id);
      return {
        kind: 'goal',
        id: link.id.toString(),
        label: goal?.title.toString() ?? 'Связанная цель удалена или недоступна',
        available: goal !== null,
      };
    }
    if (walk.returnContext?.origin === 'today')
      return { kind: 'today', label: 'Сегодня', available: true };
    return { kind: 'walks', label: 'Прогулки', available: true };
  }
}
