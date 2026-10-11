import type { NightCycle } from '../../../domain/sleep/SleepSchedule';

export function selectPreparationStep(cycle: NightCycle) {
  const pending =
    cycle.preparationCompletionKind === null
      ? cycle.preparationItems.filter(({ status }) => status === 'PENDING')
      : [];
  return {
    current: pending[0] ?? null,
    next: pending[1] ?? null,
    done: cycle.preparationItems.filter(({ status }) => status === 'DONE').length,
    total: cycle.preparationItems.length,
  };
}

export interface PreparationTimer {
  readonly remainingMs: number;
  readonly deadline: number | null;
}

export function startPreparationTimer(minutes: number, now: number): PreparationTimer {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120)
    throw new RangeError('Выберите от 1 до 120 целых минут.');
  return { remainingMs: minutes * 60_000, deadline: now + minutes * 60_000 };
}

export function preparationTimerRemaining(timer: PreparationTimer, now: number): number {
  return timer.deadline === null ? timer.remainingMs : Math.max(0, timer.deadline - now);
}

export function pausePreparationTimer(timer: PreparationTimer, now: number): PreparationTimer {
  return { remainingMs: preparationTimerRemaining(timer, now), deadline: null };
}

export function resumePreparationTimer(timer: PreparationTimer, now: number): PreparationTimer {
  return { ...timer, deadline: now + timer.remainingMs };
}
