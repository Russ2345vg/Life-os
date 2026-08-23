import {
  APPLICATION_MODE,
  type ApplicationModeSnapshot,
  type GetApplicationMode,
} from '../../application';
import type { DayDate } from '../../domain';

export type EveningStartupLoadResult =
  Readonly<{ status: 'ready'; cycleDate: DayDate | null }> | Readonly<{ status: 'error' }>;

export interface EveningStartRequestGate {
  current: boolean;
}

export function eveningStartupDate(snapshot: ApplicationModeSnapshot): DayDate | null {
  if (snapshot.mode === APPLICATION_MODE.activeDay) return null;
  return snapshot.cycleDate;
}

export async function loadEveningStartup(
  query: Pick<GetApplicationMode, 'execute'>,
): Promise<EveningStartupLoadResult> {
  try {
    return { status: 'ready', cycleDate: eveningStartupDate(await query.execute()) };
  } catch {
    return { status: 'error' };
  }
}

export function tryBeginEveningStart(gate: EveningStartRequestGate): boolean {
  if (gate.current) return false;
  gate.current = true;
  return true;
}
