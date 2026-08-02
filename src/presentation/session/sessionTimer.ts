export function scheduleSessionTimer(onTick: () => void): () => void {
  const timerId = globalThis.setInterval(onTick, 1_000);
  return () => globalThis.clearInterval(timerId);
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
