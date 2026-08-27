import type { EntityId, WalkCapture } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import { captureNotFound, captureVersionConflict } from './walkCaptureCommandSupport';

export interface ProcessWalkCaptureInput {
  readonly captureId: EntityId;
  readonly expectedVersion: number;
}

export class ProcessWalkCapture {
  public constructor(
    private readonly repository: WalkCaptureRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(input: ProcessWalkCaptureInput): Promise<Result<WalkCapture, DomainError>> {
    try {
      const stored = await this.repository.findById(input.captureId);
      if (stored === null) return captureNotFound();
      if (stored.status === 'processed') return success(stored);
      if (stored.version !== input.expectedVersion) return captureVersionConflict();
      const processed = stored.process(this.clock.now());
      if (await this.repository.updateIfVersionMatches(processed, input.expectedVersion))
        return success(processed);
      return captureVersionConflict();
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
