import { WALK_STATUS, type EntityId, type Walk, type WalkCapture } from '../../domain';
import type { WalkRepository } from '../ports/WalkRepository';
import type { WalkSourceContext, WalkSourceContextReader } from '../walk/WalkSourceContextReader';
import type { GetWalkCaptures } from './GetWalkCaptures';

export interface WalkHistoryDetail {
  readonly walk: Walk;
  readonly captures: readonly WalkCapture[];
  readonly sourceContext: WalkSourceContext | null;
}

export class GetWalkHistoryDetail {
  public constructor(
    private readonly walks: Pick<WalkRepository, 'findById'>,
    private readonly captures: Pick<GetWalkCaptures, 'execute'>,
    private readonly context: WalkSourceContextReader,
  ) {}

  public async execute(id: EntityId): Promise<WalkHistoryDetail | null> {
    const walk = await this.walks.findById(id);
    if (walk === null || walk.status !== WALK_STATUS.completed) return null;
    const [captures, sourceContext] = await Promise.all([
      this.captures.execute(id),
      this.context.read(walk),
    ]);
    return { walk, captures: captures.map((item) => item.capture), sourceContext };
  }
}
