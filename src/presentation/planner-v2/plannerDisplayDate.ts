/** Format a domain day without shifting it through the device time zone. */
export function plannerDisplayDate(value: string | null): string {
  if (!value) return 'Без даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}
