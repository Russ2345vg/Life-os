import { DomainError } from '../../shared/errors/DomainError';

export const FOCUS_MS = 25 * 60_000;
export const SHORT_BREAK_MS = 5 * 60_000;
export const LONG_BREAK_MS = 15 * 60_000;

export interface PomodoroSettings {
  readonly focusMinutes: number;
  readonly shortBreakMinutes: number;
  readonly longBreakMinutes: number;
}
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

export function validatePomodoroSettings(value: PomodoroSettings): PomodoroSettings {
  for (const [minutes, maximum] of [
    [value.focusMinutes, 180],
    [value.shortBreakMinutes, 60],
    [value.longBreakMinutes, 60],
  ]) {
    if (!Number.isInteger(minutes) || minutes! < 1 || minutes! > maximum!)
      throw new DomainError(
        'pomodoro.invalid_settings',
        'Фокус: от 1 до 180 минут; перерывы: от 1 до 60 минут.',
      );
  }
  return {
    focusMinutes: value.focusMinutes,
    shortBreakMinutes: value.shortBreakMinutes,
    longBreakMinutes: value.longBreakMinutes,
  };
}

export interface ActionPomodoroSnapshot {
  readonly settings: PomodoroSettings;
  readonly actionId: string;
  readonly title: string;
  readonly phase: 'ready' | 'focus' | 'paused' | 'break';
  readonly completedFocuses: number;
  readonly remainingMs: number;
  readonly deadline: number | null;
  readonly sessionId: string | null;
}

export function createPomodoro(
  actionId: string,
  title: string,
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS,
): ActionPomodoroSnapshot {
  return {
    settings: validatePomodoroSettings(settings),
    actionId,
    title,
    phase: 'ready',
    completedFocuses: 0,
    remainingMs: settings.focusMinutes * 60_000,
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
    remainingMs:
      snapshot.phase === 'paused' ? snapshot.remainingMs : snapshot.settings.focusMinutes * 60_000,
    deadline:
      now +
      (snapshot.phase === 'paused'
        ? snapshot.remainingMs
        : snapshot.settings.focusMinutes * 60_000),
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
    const remainingMs =
      (completedFocuses % 4 === 0
        ? snapshot.settings.longBreakMinutes
        : snapshot.settings.shortBreakMinutes) * 60_000;
    return {
      ...snapshot,
      phase: 'break',
      completedFocuses,
      remainingMs,
      deadline: now + remainingMs,
      sessionId: null,
    };
  }
  if (snapshot.phase === 'break' && pomodoroRemaining(snapshot, now) === 0) {
    return {
      ...snapshot,
      phase: 'ready',
      remainingMs: snapshot.settings.focusMinutes * 60_000,
      deadline: null,
      sessionId: null,
    };
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
    const settings =
      candidate.settings === undefined
        ? DEFAULT_POMODORO_SETTINGS
        : validatePomodoroSettings(candidate.settings as PomodoroSettings);
    return { ...candidate, settings } as unknown as ActionPomodoroSnapshot;
  } catch {
    return null;
  }
}
