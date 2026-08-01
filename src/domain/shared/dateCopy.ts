export function copyDate(value: Date): Date {
  return new Date(value.getTime());
}

export function copyOptionalDate(value: Date | null): Date | null {
  return value === null ? null : copyDate(value);
}
