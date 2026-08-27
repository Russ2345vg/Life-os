import type { EntityId, WalkCapture } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import { captureNotFound, captureVersionConflict } from './walkCaptureCommandSupport';

export interface UpdateWalkCaptureInput {
  readonly captureId: EntityId;
  readonly content: string;
  readonly expectedVersion: number;
}

export class UpdateWalkCapture {
  public constructor(
    private readonly repository: WalkCaptureRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(input: UpdateWalkCaptureInput): Promise<Result<WalkCapture, DomainError>> {
    try {
      const stored = await this.repository.findById(input.captureId);
      if (stored === null) return captureNotFound();
      if (stored.version !== input.expectedVersion) return captureVersionConflict();
      const updated = stored.updateContent(input.content, this.clock.now());
      if (await this.repository.updateIfVersionMatches(updated, input.expectedVersion))
        return success(updated);
      return captureVersionConflict();
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
