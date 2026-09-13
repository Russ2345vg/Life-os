import type { GetApplicationMode } from '../application';
import type { DayDate } from '../domain';
import { loadEveningStartup } from '../presentation/pages/EveningStartupPresentation';

interface ApplicationStartupInput {
  readonly getActiveWalk: {
    execute(): Promise<Readonly<{ date: DayDate }> | null>;
  };
  readonly getApplicationMode: Pick<GetApplicationMode, 'execute'>;
  readonly hasInitialRoutineRoute: boolean;
  readonly hasInitialPlannerRoute?: boolean;
}

export type ApplicationStartupResult =
  | Readonly<{ status: 'active-walk'; date: DayDate }>
  | Readonly<{ status: 'routine-route' }>
  | Readonly<{ status: 'evening'; date: DayDate }>
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'storage-error' }>;

export async function loadApplicationStartup(
  input: ApplicationStartupInput,
): Promise<ApplicationStartupResult> {
  if (input.hasInitialPlannerRoute) return { status: 'idle' };
  const activeWalk = await input.getActiveWalk.execute();
  if (activeWalk !== null) return { status: 'active-walk', date: activeWalk.date };
  if (input.hasInitialRoutineRoute) return { status: 'routine-route' };

  const eveningResult = await loadEveningStartup(input.getApplicationMode);
  if (eveningResult.status === 'error') return { status: 'storage-error' };
  if (eveningResult.cycleDate === null) return { status: 'idle' };
  return { status: 'evening', date: eveningResult.cycleDate };
}
