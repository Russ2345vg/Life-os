import { DayDate } from '../../domain';

export const ROUTINE_SECTION = {
  morning: 'morning',
  day: 'day',
  evening: 'evening',
} as const;

export type RoutineSection = (typeof ROUTINE_SECTION)[keyof typeof ROUTINE_SECTION];

export const ROUTINE_MORNING_VIEW = {
  physicalExecution: 'physical-execution',
} as const;

export type RoutineMorningView = (typeof ROUTINE_MORNING_VIEW)[keyof typeof ROUTINE_MORNING_VIEW];

export interface RoutineRoute {
  readonly section: RoutineSection;
  readonly date: DayDate | null;
  readonly morningView: RoutineMorningView | null;
}

const ROUTINE_ROUTE_PATTERN = /^#\/routine\/(morning|day|evening)(?:\?(.*))?$/;

export function parseRoutineRoute(hash: string): RoutineRoute | null {
  const match = ROUTINE_ROUTE_PATTERN.exec(hash);
  if (match === null) return null;

  const section = match[1];
  if (section === undefined || !isRoutineSection(section)) return null;

  const parameters = new URLSearchParams(match[2] ?? '');
  const morningView =
    section === ROUTINE_SECTION.morning &&
    parameters.get('view') === ROUTINE_MORNING_VIEW.physicalExecution
      ? ROUTINE_MORNING_VIEW.physicalExecution
      : null;
  const dateValue = parameters.get('date');
  if (dateValue === null) return { section, date: null, morningView };

  try {
    return { section, date: DayDate.create(dateValue), morningView };
  } catch {
    return null;
  }
}

export function buildRoutineRoute(
  section: RoutineSection,
  date: DayDate,
  morningView: RoutineMorningView | null = null,
): string {
  const route = `#/routine/${section}?date=${encodeURIComponent(date.toString())}`;
  return section === ROUTINE_SECTION.morning &&
    morningView === ROUTINE_MORNING_VIEW.physicalExecution
    ? `${route}&view=${morningView}`
    : route;
}

function isRoutineSection(value: string): value is RoutineSection {
  return (Object.values(ROUTINE_SECTION) as readonly string[]).includes(value);
}
