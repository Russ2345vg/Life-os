import type { DayDate, Walk } from '../../domain';
import type { WalkRepository } from '../ports/WalkRepository';

export class GetWalksForDate {
  public constructor(readonly repository: WalkRepository) {}

  public async execute(date: DayDate): Promise<readonly Walk[]> {
    const walks = await this.repository.findByDate(date);
    return [...walks].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.toString().localeCompare(right.id.toString()),
    );
  }
}
