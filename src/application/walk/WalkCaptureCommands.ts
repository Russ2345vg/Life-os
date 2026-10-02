import { WalkCapture } from '../../domain/walk-capture/WalkCapture';
import { EntityId } from '../../domain/shared/EntityId';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import { DomainError } from '../../shared/errors/DomainError';
import { assertCurrent, walkRequest } from './WalkCommands';

export class WalkCaptureCommands {
  public constructor(
    private readonly repository: WalkCaptureRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}
  public capture(input: {
    walkId: string;
    requestId: string;
    content: string;
  }): Promise<WalkCapture> {
    return this.repository.runCapture(walkRequest('capture', input), async (tx) => {
      const walk = await tx.getWalk(input.walkId);
      if (!walk || (walk.status !== 'running' && walk.status !== 'paused'))
        throw new DomainError(
          'walk_capture.requires_active',
          'Новую мысль можно сохранить во время активной прогулки.',
        );
      const now = this.clock.now();
      const capture = WalkCapture.create({
        id: this.ids.generate(),
        walkId: EntityId.create(input.walkId),
        content: input.content,
        capturedAt: now,
        walkElapsedMs: walk.elapsedDurationMilliseconds(now)!,
      });
      await tx.saveCapture(capture, null);
      return capture;
    });
  }
  public update(input: {
    captureId: string;
    expectedVersion: number;
    requestId: string;
    content: string;
  }): Promise<WalkCapture> {
    return this.repository.runCapture(walkRequest('editCapture', input), async (tx) => {
      const current = await tx.getCapture(input.captureId);
      assertCurrent(current, input.expectedVersion);
      const next = current.updateContent(input.content, this.clock.now());
      await tx.saveCapture(next, current.version);
      return next;
    });
  }
  public markProcessed(input: {
    captureId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<WalkCapture> {
    return this.repository.runCapture(walkRequest('processCapture', input), async (tx) => {
      const current = await tx.getCapture(input.captureId);
      assertCurrent(current, input.expectedVersion);
      const next = current.process(this.clock.now());
      if (next !== current) await tx.saveCapture(next, current.version);
      return next;
    });
  }
}
