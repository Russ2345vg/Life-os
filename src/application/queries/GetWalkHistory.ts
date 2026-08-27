import { WALK_STATUS, type Walk, type WalkIntent } from '../../domain';
import type { WalkRepository } from '../ports/WalkRepository';

/** History is a projection of completed Walks, never a second persisted lifecycle. */
export class GetWalkHistory {
  public constructor(private readonly walks: Pick<WalkRepository, 'findAll'>) {}

  public async execute(intent?: WalkIntent): Promise<readonly Walk[]> {
    return (await this.walks.findAll())
      .filter(
        (walk) =>
          walk.status === WALK_STATUS.completed && (intent === undefined || walk.intent === intent),
      )
      .sort(
        (left, right) =>
          right.endedAt!.getTime() - left.endedAt!.getTime() ||
          left.id.toString().localeCompare(right.id.toString()),
      );
  }
}
