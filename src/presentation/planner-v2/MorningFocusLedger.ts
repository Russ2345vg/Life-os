import type { ActionSession } from '../../domain';

export const MORNING_FOCUS_MINIMUM_MS = 60 * 60_000;
export const MORNING_FOCUS_TARGET_MS = 75 * 60_000;

export interface MorningFocusLedger {
  readonly dateKey: string;
  readonly actionId: string;
  readonly sessions: readonly {
    readonly sessionId: string;
    readonly baselineMs: number;
  }[];
}

export function morningFocusWorkedMilliseconds(
  ledger: MorningFocusLedger | null,
  sessions: readonly ActionSession[],
  now: Date,
): number {
  if (!ledger) return 0;
  return ledger.sessions.reduce((total, entry) => {
    const session = sessions.find(
      (candidate) =>
        candidate.id.toString() === entry.sessionId &&
        candidate.lifeActionId.toString() === ledger.actionId,
    );
    if (!session) return total;
    const effectiveNow = now.getTime() < session.startedAt.getTime() ? session.startedAt : now;
    return total + Math.max(0, session.workedDurationAt(effectiveNow) - entry.baselineMs);
  }, 0);
}

export function recordMorningFocusSession(
  ledger: MorningFocusLedger | null,
  dateKey: string,
  session: ActionSession,
  now: Date,
): MorningFocusLedger {
  const actionId = session.lifeActionId.toString();
  const current =
    ledger?.dateKey === dateKey && ledger.actionId === actionId
      ? ledger
      : { dateKey, actionId, sessions: [] };
  if (current.sessions.some((entry) => entry.sessionId === session.id.toString())) return current;
  return {
    ...current,
    sessions: [
      ...current.sessions,
      { sessionId: session.id.toString(), baselineMs: session.workedDurationAt(now) },
    ],
  };
}

export function morningFocusStorageKey(dateKey: string, actionId: string): string {
  return `lifeos-morning-focus-v1:${dateKey}:${actionId}`;
}

export function readMorningFocusLedger(
  storage: Pick<Storage, 'getItem'>,
  dateKey: string,
  actionId: string,
): MorningFocusLedger | null {
  try {
    const raw = storage.getItem(morningFocusStorageKey(dateKey, actionId));
    if (!raw) return null;
    const candidate: unknown = JSON.parse(raw);
    if (typeof candidate !== 'object' || candidate === null) return null;
    const data = candidate as Record<string, unknown>;
    if (data.dateKey !== dateKey || data.actionId !== actionId || !Array.isArray(data.sessions))
      return null;
    if (
      !data.sessions.every((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return false;
        const value = entry as Record<string, unknown>;
        return (
          typeof value.sessionId === 'string' &&
          typeof value.baselineMs === 'number' &&
          Number.isFinite(value.baselineMs) &&
          value.baselineMs >= 0
        );
      })
    )
      return null;
    return candidate as MorningFocusLedger;
  } catch {
    return null;
  }
}
