import type { EntityId } from '../../domain';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type {
  WalkCaptureContextReader,
  WalkCaptureReadModel,
} from '../walk-capture/WalkCaptureReadModel';

export class GetWalkCaptures {
  public constructor(
    private readonly repository: WalkCaptureRepository,
    private readonly context: WalkCaptureContextReader,
  ) {}
  public async execute(walkId: EntityId): Promise<readonly WalkCaptureReadModel[]> {
    return this.context.read(await this.repository.findByWalkId(walkId));
  }
}
