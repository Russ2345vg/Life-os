import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type {
  WalkCaptureContextReader,
  WalkCaptureReadModel,
} from '../walk-capture/WalkCaptureReadModel';

export class GetPendingWalkCaptures {
  public constructor(
    private readonly repository: WalkCaptureRepository,
    private readonly context: WalkCaptureContextReader,
  ) {}
  public async execute(): Promise<readonly WalkCaptureReadModel[]> {
    return this.context.read(await this.repository.findPending());
  }
}
