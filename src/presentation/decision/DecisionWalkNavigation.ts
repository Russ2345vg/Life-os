import type { GetDecisionById, GetLatestWalkOutcomeForDecision } from '../../application';
import { EntityId, type DayDate, type Decision, type Walk } from '../../domain';

export interface DecisionWalkLaunchRequest {
  readonly decisionId: EntityId;
  readonly title: string;
}

export interface DecisionWalkIntegration {
  readonly getLatestOutcome: Pick<GetLatestWalkOutcomeForDecision, 'execute'>;
  readonly onStart: (decision: Decision) => void;
}

export type DecisionWalkContext =
  | { readonly status: 'not-linked' | 'loading' | 'unavailable' }
  | {
      readonly status: 'ready';
      readonly decisionId: EntityId;
      readonly title: string;
      readonly plannedDate: DayDate | null;
    };

/** Return routing never uses a title or the currently selected Decision. */
export function decisionWalkReturnId(walk: Walk): EntityId | null {
  const context = walk.returnContext;
  return context?.origin === 'decision' && context.entity?.type === 'decision'
    ? context.entity.id
    : null;
}

export async function loadDecisionWalkContext(
  walk: Walk,
  query: Pick<GetDecisionById, 'execute'>,
): Promise<DecisionWalkContext> {
  const id =
    decisionWalkReturnId(walk) ??
    (walk.linkedEntity?.type === 'decision' ? walk.linkedEntity.id : null);
  if (id === null) return { status: 'not-linked' };
  try {
    const result = await query.execute(id);
    if (!result.ok || result.value.isDeleted()) return { status: 'unavailable' };
    return {
      status: 'ready',
      decisionId: result.value.id,
      title: result.value.title.toString(),
      plannedDate: result.value.plannedDate,
    };
  } catch {
    return { status: 'unavailable' };
  }
}
