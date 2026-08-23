import { DayDate } from '../../domain';

export const ROUTINE_SECTION = {
  morning: 'morning',
  day: 'day',
  evening: 'evening',
} as const;

export type RoutineSection = (typeof ROUTINE_SECTION)[keyof typeof ROUTINE_SECTION];

export interface RoutineRoute {
  readonly section: RoutineSection;
  readonly date: DayDate | null;
}

const ROUTINE_ROUTE_PATTERN = /^#\/routine\/(morning|day|evening)(?:\?(.*))?$/;

export function parseRoutineRoute(hash: string): RoutineRoute | null {
  const match = ROUTINE_ROUTE_PATTERN.exec(hash);
  if (match === null) return null;

  const section = match[1];
  if (section === undefined || !isRoutineSection(section)) return null;

  const dateValue = new URLSearchParams(match[2] ?? '').get('date');
  if (dateValue === null) return { section, date: null };

  try {
    return { section, date: DayDate.create(dateValue) };
  } catch {
    return null;
  }
}

export function buildRoutineRoute(section: RoutineSection, date: DayDate): string {
  return `#/routine/${section}?date=${encodeURIComponent(date.toString())}`;
}

function isRoutineSection(value: string): value is RoutineSection {
  return (Object.values(ROUTINE_SECTION) as readonly string[]).includes(value);
}
