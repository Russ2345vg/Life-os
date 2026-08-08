import type { ActionSession } from '../domain';
import { resolveSafeSessionNow } from './session/sessionTimer';

export interface ActionSessionOverviewItem {
  readonly session: ActionSession;
  readonly workedDurationMs: number;
  readonly pausedDurationMs: number;
  readonly isLatest: boolean;
}

export interface ActionSessionOverview {
  readonly totalSessionCount: number;
  readonly completedSessionCount: number;
  readonly totalWorkedDurationMs: number;
  readonly averageCompletedWorkedDurationMs: number;
  readonly latestSession: ActionSession | null;
  readonly items: readonly ActionSessionOverviewItem[];
}

export function buildActionSessionOverview(
  sessions: readonly ActionSession[],
  now: Date,
): ActionSessionOverview {
  const orderedSessions = [...sessions].sort(compareNewestFirst);
  const latestSession = orderedSessions[0] ?? null;
  let completedSessionCount = 0;
  let completedWorkedDurationMs = 0;
  let totalWorkedDurationMs = 0;

  const items = orderedSessions.map((session): ActionSessionOverviewItem => {
    const safeNow = resolveSafeSessionNow(session, now);
    const workedDurationMs = session.workedDurationAt(safeNow);
    const pausedDurationMs = session.pausedDurationAt(safeNow);

    totalWorkedDurationMs += workedDurationMs;
    if (session.isCompleted()) {
      completedSessionCount += 1;
      completedWorkedDurationMs += workedDurationMs;
    }

    return Object.freeze({
      session,
      workedDurationMs,
      pausedDurationMs,
      isLatest: latestSession !== null && session.id.equals(latestSession.id),
    });
  });

  return Object.freeze({
    totalSessionCount: orderedSessions.length,
    completedSessionCount,
    totalWorkedDurationMs,
    averageCompletedWorkedDurationMs:
      completedSessionCount === 0 ? 0 : completedWorkedDurationMs / completedSessionCount,
    latestSession,
    items: Object.freeze(items),
  });
}

function compareNewestFirst(left: ActionSession, right: ActionSession): number {
  const startedAtDifference = right.startedAt.getTime() - left.startedAt.getTime();

  if (startedAtDifference !== 0) {
    return startedAtDifference;
  }

  return right.id.toString().localeCompare(left.id.toString());
}
