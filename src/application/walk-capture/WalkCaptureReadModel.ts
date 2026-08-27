import type { Walk, WalkCapture } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { WalkRepository } from '../ports/WalkRepository';
import { WalkSourceContextReader } from '../walk/WalkSourceContextReader';

export interface WalkCaptureReadModel {
  readonly capture: WalkCapture;
  readonly walk: Walk | null;
  readonly contextLabel: string | null;
}

/** Context is read-only and optional. Capture remains accessible when its source is unavailable. */
export class WalkCaptureContextReader {
  private readonly sourceContext: WalkSourceContextReader;

  public constructor(
    private readonly walks: Pick<WalkRepository, 'findById'>,
    decisions: Pick<DecisionRepository, 'findById'>,
    routines: Pick<RoutineBlockRepository, 'findById'>,
  ) {
    this.sourceContext = new WalkSourceContextReader(decisions, routines);
  }

  public async read(captures: readonly WalkCapture[]): Promise<readonly WalkCaptureReadModel[]> {
    return Promise.all(
      [...captures]
        .sort(
          (left, right) =>
            right.capturedAt.getTime() - left.capturedAt.getTime() ||
            left.id.toString().localeCompare(right.id.toString()),
        )
        .map(async (capture) => {
          const walk = await this.walks.findById(capture.walkId).catch(() => null);
          const contextLabel = (await this.sourceContext.read(walk))?.label ?? null;
          return { capture, walk, contextLabel };
        }),
    );
  }
}
