import { WALK_STATUS, type EntityId, type Walk } from '../../domain';
import type { WalkRepository } from '../ports/WalkRepository';

/** Walk remains the sole owner of the result; nothing is copied into Decision. */
export class GetLatestWalkOutcomeForDecision {
  public constructor(private readonly repository: Pick<WalkRepository, 'findAll'>) {}

  public async execute(decisionId: EntityId): Promise<Walk | null> {
    const walks = await this.repository.findAll();
    return (
      walks
        .filter(
          (walk) =>
            walk.status === WALK_STATUS.completed &&
            walk.impact !== null &&
            walk.reentry !== null &&
            walk.linkedEntity?.type === 'decision' &&
            walk.linkedEntity.id.equals(decisionId),
        )
        .sort(
          (left, right) =>
            right.reentry!.preparedAt.getTime() - left.reentry!.preparedAt.getTime() ||
            left.id.toString().localeCompare(right.id.toString()),
        )[0] ?? null
    );
  }
}
