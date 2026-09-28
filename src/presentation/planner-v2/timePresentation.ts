export function clockTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return (
    [hours ? `${hours} ч` : '', remainder ? `${remainder} мин` : ''].filter(Boolean).join(' ') ||
    '0 мин'
  );
}
