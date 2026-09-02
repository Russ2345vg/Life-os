import {
  APPLICATION_MODE,
  type ApplicationModeSnapshot,
  type GetApplicationMode,
} from '../../application';
import type { DayDate } from '../../domain';

export const LATE_EVENING_THRESHOLD_MINUTES = 30;

export interface LateEveningOffer {
  readonly minutesRemaining: number;
}

export function buildLateEveningOffer(
  now: Date,
  targetSleepTime: string | null,
): LateEveningOffer | null {
  if (targetSleepTime === null) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(targetSleepTime);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59 || Number.isNaN(now.getTime())) return null;
  const targetMinutes = hours * 60 + minutes;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const crossesMidnight = currentMinutes >= 18 * 60 && targetMinutes < 6 * 60;
  const effectiveTargetMinutes = crossesMidnight ? targetMinutes + 24 * 60 : targetMinutes;
  const minutesRemaining = Math.max(0, effectiveTargetMinutes - currentMinutes);
  if (minutesRemaining > LATE_EVENING_THRESHOLD_MINUTES) return null;
  return Object.freeze({ minutesRemaining });
}

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
