import type { Walk } from '../../domain';
import type { WalkRepository } from '../ports/WalkRepository';

export class GetRunningWalk {
  public constructor(readonly repository: WalkRepository) {}

  public async execute(): Promise<Walk | null> {
    return this.repository.findRunning();
  }
}
