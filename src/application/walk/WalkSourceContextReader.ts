import type { Walk, WalkLinkedEntity } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';

export interface WalkSourceContext {
  readonly source: WalkLinkedEntity;
  readonly label: string | null;
  readonly availability: 'available' | 'missing' | 'unavailable';
}

/** Optional live context; a missing source never makes historical facts inaccessible. */
export class WalkSourceContextReader {
  public constructor(
    private readonly decisions: Pick<DecisionRepository, 'findById'>,
    private readonly routines: Pick<RoutineBlockRepository, 'findById'>,
  ) {}

  public async read(walk: Walk | null): Promise<WalkSourceContext | null> {
    const source = walk?.linkedEntity ?? walk?.returnContext?.entity;
    if (
      source === undefined ||
      source === null ||
      (source.type !== 'decision' && source.type !== 'routine')
    )
      return null;
    try {
      let label: string | null;
      if (source.type === 'decision') {
        const decision = await this.decisions.findById(source.id);
        label = decision === null || decision.isDeleted() ? null : decision.title.toString();
      } else {
        label = (await this.routines.findById(source.id))?.title ?? null;
      }
      return { source, label, availability: label === null ? 'missing' : 'available' };
    } catch {
      return { source, label: null, availability: 'unavailable' };
    }
  }
}
