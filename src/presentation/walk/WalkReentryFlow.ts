import type { CloseWalkReentry, CompleteWalkReentry } from '../../application';
import type { Walk, WalkReentryAction } from '../../domain';
import type { RoutineWalkLaunchRequest } from '../routine/RoutineWalkNavigation';
import type { DecisionWalkLaunchRequest } from '../decision/DecisionWalkNavigation';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Result } from '../../shared/result/Result';

export interface CompleteWalkReentryFlowInput {
  readonly walk: Walk;
  readonly command: Pick<CompleteWalkReentry, 'execute'>;
  readonly onReentryChanged: () => Promise<void>;
  readonly onNavigate: (action: WalkReentryAction) => void;
}

export interface CloseWalkReentryFlowInput {
  readonly walk: Walk;
  readonly command: Pick<CloseWalkReentry, 'execute'>;
  readonly onReentryChanged: () => Promise<void>;
  readonly onReturnToCenter: () => void;
}

export type WalkSessionEntry =
  | { readonly phase: 'active'; readonly walk: Walk }
  | { readonly phase: 'reentry'; readonly walk: Walk }
  | { readonly phase: 'reentryError'; readonly walk: null }
  | { readonly phase: 'routineLaunch'; readonly walk: null }
  | { readonly phase: 'decisionLaunch'; readonly walk: null }
  | { readonly phase: 'center'; readonly walk: null };

export function selectWalkSessionEntry(input: {
  readonly activeWalk: Walk | null;
  readonly pendingReentry: Walk | null;
  readonly pendingLoadFailed: boolean;
  readonly routineLaunchRequest?: RoutineWalkLaunchRequest | null;
  readonly decisionLaunchRequest?: DecisionWalkLaunchRequest | null;
}): WalkSessionEntry {
  if (input.activeWalk !== null) return { phase: 'active', walk: input.activeWalk };
  if (input.pendingReentry !== null) return { phase: 'reentry', walk: input.pendingReentry };
  if (input.pendingLoadFailed) return { phase: 'reentryError', walk: null };
  if (input.decisionLaunchRequest != null) return { phase: 'decisionLaunch', walk: null };
  if (input.routineLaunchRequest != null) return { phase: 'routineLaunch', walk: null };
  return { phase: 'center', walk: null };
}

export async function completeWalkReentryFlow(
  input: CompleteWalkReentryFlowInput,
): Promise<Result<Walk, DomainError>> {
  const result = await input.command.execute({ walkId: input.walk.id });
  if (!result.ok) return result;

  const action = result.value.reentry?.action;
  if (action === undefined) return missingReentry();
  await input.onReentryChanged();
  input.onNavigate(action);
  return result;
}

export async function closeWalkReentryFlow(
  input: CloseWalkReentryFlowInput,
): Promise<Result<Walk, DomainError>> {
  const result = await input.command.execute({ walkId: input.walk.id });
  if (!result.ok) return result;
  if (input.walk.reentry === null) return missingReentry();

  await input.onReentryChanged();
  input.onReturnToCenter();
  return result;
}

function missingReentry(): Result<never, DomainError> {
  return failure(
    new DomainError('walk.reentry_not_pending', 'Возвращение уже завершено или не подготовлено.'),
  );
}
