import { WALK_MODE, type Walk } from '../../domain';

export interface WalkTimeSnapshot {
  readonly seconds: number;
  readonly expired: boolean;
}

export function getWalkTimeSnapshot(walk: Walk, now: Date): WalkTimeSnapshot {
  if (walk.startedAt === null || walk.mode === null) return { seconds: 0, expired: false };
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - walk.startedAt.getTime()) / 1000));
  if (walk.mode === WALK_MODE.stopwatch) return { seconds: elapsedSeconds, expired: false };
  const targetSeconds = (walk.timerTargetMinutes ?? 0) * 60;
  return {
    seconds: Math.max(0, targetSeconds - elapsedSeconds),
    expired: elapsedSeconds >= targetSeconds,
  };
}

export function formatStopwatch(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(padTwoDigits).join(':');
}

export function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${padTwoDigits(minutes)}:${padTwoDigits(remainder)}`;
}

function padTwoDigits(value: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(2, '0');
}
