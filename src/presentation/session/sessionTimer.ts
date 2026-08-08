import type { ActionSession } from '../../domain';

export function scheduleSessionTimer(onTick: () => void): () => void {
  const timerId = globalThis.setInterval(onTick, 1_000);
  return () => globalThis.clearInterval(timerId);
}

export function resolveSafeSessionNow(
  session: ActionSession | null,
  ...candidates: readonly Date[]
): Date {
  const candidateTimestamp = candidates.reduce(
    (latest, candidate) => Math.max(latest, candidate.getTime()),
    Number.NEGATIVE_INFINITY,
  );

  if (session === null) {
    return new Date(candidateTimestamp);
  }

  const lastPauseEndedAt = session.pauseIntervals.at(-1)?.endedAt ?? null;
  const minimumTimestamp = Math.max(
    session.startedAt.getTime(),
    session.pausedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
    lastPauseEndedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
    session.completedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
  );

  return new Date(Math.max(candidateTimestamp, minimumTimestamp));
}

export function formatDuration(durationMilliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMilliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [minutes, seconds].map((value) => value.toString().padStart(2, '0'));

  if (hours === 0) {
    return parts.join(':');
  }

  return [hours.toString().padStart(2, '0'), ...parts].join(':');
}
