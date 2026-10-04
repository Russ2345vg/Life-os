export const FOCUS_MS = 25 * 60_000;
export const SHORT_BREAK_MS = 5 * 60_000;
export const LONG_BREAK_MS = 15 * 60_000;

export interface ActionPomodoroSnapshot {
  readonly actionId: string;
  readonly title: string;
  readonly phase: 'ready' | 'focus' | 'paused' | 'break';
  readonly completedFocuses: number;
  readonly remainingMs: number;
  readonly deadline: number | null;
  readonly sessionId: string | null;
}

export function createPomodoro(actionId: string, title: string): ActionPomodoroSnapshot {
  return {
    actionId,
    title,
    phase: 'ready',
    completedFocuses: 0,
    remainingMs: FOCUS_MS,
    deadline: null,
    sessionId: null,
  };
}

export function pomodoroRemaining(snapshot: ActionPomodoroSnapshot, now: number): number {
  return snapshot.deadline === null ? snapshot.remainingMs : Math.max(0, snapshot.deadline - now);
}

export function startPomodoroPhase(
  snapshot: ActionPomodoroSnapshot,
  now: number,
  sessionId: string | null = snapshot.sessionId,
): ActionPomodoroSnapshot {
  return {
    ...snapshot,
    phase: 'focus',
    remainingMs: snapshot.phase === 'paused' ? snapshot.remainingMs : FOCUS_MS,
    deadline: now + (snapshot.phase === 'paused' ? snapshot.remainingMs : FOCUS_MS),
    sessionId,
  };
}

export function pausePomodoro(
  snapshot: ActionPomodoroSnapshot,
  now: number,
): ActionPomodoroSnapshot {
  return {
    ...snapshot,
    phase: 'paused',
    remainingMs: pomodoroRemaining(snapshot, now),
    deadline: null,
  };
}

export function advancePomodoro(
  snapshot: ActionPomodoroSnapshot,
  now: number,
): ActionPomodoroSnapshot {
  if (snapshot.phase === 'focus' && pomodoroRemaining(snapshot, now) === 0) {
    const completedFocuses = snapshot.completedFocuses + 1;
    const remainingMs = completedFocuses % 4 === 0 ? LONG_BREAK_MS : SHORT_BREAK_MS;
    return {
      ...snapshot,
      phase: 'break',
      completedFocuses,
      remainingMs,
      deadline: now + remainingMs,
    };
  }
  if (snapshot.phase === 'break' && pomodoroRemaining(snapshot, now) === 0) {
    return { ...snapshot, phase: 'ready', remainingMs: FOCUS_MS, deadline: null };
  }
  return snapshot;
}

export function readPomodoro(raw: string | null): ActionPomodoroSnapshot | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.actionId !== 'string' ||
      typeof candidate.title !== 'string' ||
      !['ready', 'focus', 'paused', 'break'].includes(String(candidate.phase)) ||
      typeof candidate.completedFocuses !== 'number' ||
      !Number.isInteger(candidate.completedFocuses) ||
      candidate.completedFocuses < 0 ||
      typeof candidate.remainingMs !== 'number' ||
      !Number.isFinite(candidate.remainingMs) ||
      candidate.remainingMs < 0 ||
      (candidate.deadline !== null &&
        (typeof candidate.deadline !== 'number' || !Number.isFinite(candidate.deadline))) ||
      (candidate.sessionId !== null && typeof candidate.sessionId !== 'string')
    )
      return null;
    return candidate as unknown as ActionPomodoroSnapshot;
  } catch {
    return null;
  }
}
