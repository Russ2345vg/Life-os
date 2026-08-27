import type { GetPendingWalkReentry } from '../application';
import type { Walk } from '../domain';
import { APP_SECTION, type AppSection } from '../presentation/navigation/AppSection';

export type PendingWalkReentryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly walk: Walk | null }
  | { readonly status: 'error' };

export async function loadPendingWalkReentry(
  query: Pick<GetPendingWalkReentry, 'execute'>,
): Promise<Exclude<PendingWalkReentryState, { status: 'loading' }>> {
  try {
    return { status: 'ready', walk: await query.execute() };
  } catch {
    return { status: 'error' };
  }
}

export function shouldShowWalkReentryReminder(input: {
  readonly pendingState: PendingWalkReentryState;
  readonly activeSection: AppSection;
  readonly activeWalkRestored: boolean;
}): boolean {
  return (
    input.pendingState.status === 'ready' &&
    input.pendingState.walk !== null &&
    input.activeSection !== APP_SECTION.walks &&
    !input.activeWalkRestored
  );
}
