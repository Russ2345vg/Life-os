import type { EntityId } from '../../domain';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type {
  WalkCaptureContextReader,
  WalkCaptureReadModel,
} from '../walk-capture/WalkCaptureReadModel';

export class GetWalkCaptureById {
  public constructor(
    private readonly repository: WalkCaptureRepository,
    private readonly context: WalkCaptureContextReader,
  ) {}
  public async execute(captureId: EntityId): Promise<WalkCaptureReadModel | null> {
    const capture = await this.repository.findById(captureId);
    return capture === null ? null : ((await this.context.read([capture]))[0] ?? null);
  }
}
