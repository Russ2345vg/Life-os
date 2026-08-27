import { WALK_REENTRY_STATUS, type Walk } from '../../domain';
import type { WalkRepository } from '../ports/WalkRepository';

export class GetPendingWalkReentry {
  public constructor(readonly repository: WalkRepository) {}

  public async execute(): Promise<Walk | null> {
    const latest =
      (await this.repository.findAll())
        .filter((walk) => walk.reentry !== null)
        .sort(compareNewestReentry)[0] ?? null;
    return latest?.reentry?.status === WALK_REENTRY_STATUS.pending ? latest : null;
  }
}

function compareNewestReentry(left: Walk, right: Walk): number {
  const preparedDifference =
    right.reentry!.preparedAt.getTime() - left.reentry!.preparedAt.getTime();
  if (preparedDifference !== 0) return preparedDifference;
  const updatedDifference = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedDifference !== 0) return updatedDifference;
  return right.id.toString().localeCompare(left.id.toString());
}
