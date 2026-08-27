import { WalkCapture, WALK_STATUS, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type { WalkRepository } from '../ports/WalkRepository';

export interface CreateWalkCaptureInput {
  readonly walkId: EntityId;
  readonly content: string;
}

export class CreateWalkCapture {
  public constructor(
    private readonly captures: WalkCaptureRepository,
    private readonly walks: Pick<WalkRepository, 'findById'>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(input: CreateWalkCaptureInput): Promise<Result<WalkCapture, DomainError>> {
    try {
      const walk = await this.walks.findById(input.walkId);
      if (
        walk === null ||
        (walk.status !== WALK_STATUS.running && walk.status !== WALK_STATUS.paused)
      ) {
        return failure(
          new DomainError(
            'walk_capture.requires_active_walk',
            'Мысль можно сохранить во время прогулки или на паузе.',
          ),
        );
      }
      const capturedAt = this.clock.now();
      const capture = WalkCapture.create({
        id: this.ids.generate(),
        walkId: walk.id,
        content: input.content,
        capturedAt,
        walkElapsedMs: walk.elapsedDurationMilliseconds(capturedAt)!,
      });
      // The active-state check is a read snapshot. A concurrent finish must not discard the thought.
      await this.captures.insert(capture);
      return success(capture);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
