import { DayDate, type ActionSession, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { buildTimeScheduleDay } from './GetTimeSchedule';

export interface WorkTimeDay {
  readonly date: string;
  readonly plannedMinutes: number;
  readonly unknownEstimateCount: number;
  readonly capacityMinutes: number | null;
  readonly actualMilliseconds: number;
  readonly completedActionCount: number;
}
export interface WorkTimeRow {
  readonly actionId: string;
  readonly title: string;
  readonly plannedMinutes: number | null;
  readonly actualMilliseconds: number;
  readonly sessionCount: number;
  readonly completed: boolean;
}
export interface WorkTimeGoal {
  readonly goalId: string | null;
  readonly plannedMinutes: number;
  readonly actualMilliseconds: number;
}
export interface WorkTimeReport {
  readonly days: readonly WorkTimeDay[];
  readonly rows: readonly WorkTimeRow[];
  readonly goals: readonly WorkTimeGoal[];
  readonly plannedMinutes: number;
  readonly unknownEstimateCount: number;
  readonly capacityMinutes: number | null;
  readonly unknownCapacityDays: number;
  readonly actualMilliseconds: number;
  readonly completedActionCount: number;
}

/** Reads current plans and immutable session history; no derived totals are persisted. */
export function buildWorkTimeReport(input: {
  readonly from: string;
  readonly to: string;
  readonly asOf: Date;
  readonly actions: readonly LifeAction[];
  readonly sessions: readonly ActionSession[];
  readonly weekdays: readonly (number | null)[];
}): WorkTimeReport {
  DayDate.create(input.from);
  DayDate.create(input.to);
  if (input.from > input.to || !Number.isFinite(input.asOf.getTime()))
    throw new DomainError('time_report.invalid_range', 'Период отчёта указан некорректно.');
  const days = new Map<string, MutableDay>();
  const rows = new Map<string, MutableRow>();
  const goals = new Map<string | null, MutableGoal>();
  const byId = new Map(input.actions.map((action) => [action.id.toString(), action]));
  const goalRow = (goalId: string | null): MutableGoal => {
    let row = goals.get(goalId);
    if (!row) {
      row = { goalId, plannedMinutes: 0, actualMilliseconds: 0 };
      goals.set(goalId, row);
    }
    return row;
  };
  const actionRow = (actionId: string): MutableRow => {
    let row = rows.get(actionId);
    if (!row) {
      row = {
        actionId,
        title: byId.get(actionId)?.title.toString() ?? 'Действие недоступно',
        plannedMinutes: null,
        actualMilliseconds: 0,
        sessionCount: 0,
        completed: false,
      };
      rows.set(actionId, row);
    }
    return row;
  };
  let current = localMidnight(input.from);
  const last = localMidnight(input.to).getTime();
  for (; current.getTime() <= last; current = nextMidnight(current)) {
    const date = localDate(current);
    const capacity = input.weekdays[(current.getDay() + 6) % 7] ?? null;
    const schedule = buildTimeScheduleDay(date, input.actions, capacity);
    days.set(date, {
      date,
      plannedMinutes: schedule.plannedMinutes,
      unknownEstimateCount: schedule.unknownEstimateCount,
      capacityMinutes: capacity,
      actualMilliseconds: 0,
      completedActionCount: 0,
    });
    for (const action of [...schedule.timed, ...schedule.untimed]) {
      const plannedMinutes = action.scheduledDurationMinutes ?? action.estimateMinutes;
      actionRow(action.id.toString()).plannedMinutes = plannedMinutes;
      if (plannedMinutes !== null)
        goalRow(action.goalId?.toString() ?? null).plannedMinutes += plannedMinutes;
    }
  }
  const rangeStart = localMidnight(input.from).getTime();
  const rangeEnd = nextMidnight(localMidnight(input.to)).getTime();
  for (const action of input.actions) {
    if (action.status !== 'completed' || action.isDeleted()) continue;
    const completedDate =
      action.completedOn ?? (action.completedAt ? localDate(action.completedAt) : null);
    const day = completedDate ? days.get(completedDate) : undefined;
    if (!day || (action.completedAt && action.completedAt.getTime() > input.asOf.getTime()))
      continue;
    day.completedActionCount += 1;
    actionRow(action.id.toString()).completed = true;
  }
  for (const session of input.sessions) {
    const sessionStart = session.startedAt.getTime();
    const sessionEnd = Math.min(
      session.completedAt?.getTime() ?? input.asOf.getTime(),
      input.asOf.getTime(),
    );
    if (
      sessionEnd < sessionStart ||
      sessionStart >= rangeEnd ||
      sessionEnd < rangeStart ||
      (sessionEnd === rangeStart && sessionStart !== sessionEnd)
    )
      continue;
    const row = actionRow(session.lifeActionId.toString());
    row.sessionCount += 1;
    let actual = 0;
    for (const interval of workIntervals(session, input.asOf.getTime())) {
      let cursor = Math.max(interval.start, rangeStart);
      const end = Math.min(interval.end, rangeEnd);
      while (cursor < end) {
        const boundary = Math.min(nextMidnight(new Date(cursor)).getTime(), end);
        const duration = boundary - cursor;
        days.get(localDate(new Date(cursor)))!.actualMilliseconds += duration;
        actual += duration;
        cursor = boundary;
      }
    }
    if (actual > 0) {
      row.actualMilliseconds += actual;
      goalRow(session.goalIdAtStart?.toString() ?? null).actualMilliseconds += actual;
    }
  }
  const resultDays = [...days.values()];
  const unknownCapacityDays = resultDays.filter((day) => day.capacityMinutes === null).length;
  return {
    days: resultDays,
    rows: [...rows.values()].sort(
      (left, right) =>
        right.actualMilliseconds - left.actualMilliseconds ||
        left.title.localeCompare(right.title, 'ru'),
    ),
    goals: [...goals.values()].sort(
      (left, right) => right.actualMilliseconds - left.actualMilliseconds,
    ),
    plannedMinutes: resultDays.reduce((sum, day) => sum + day.plannedMinutes, 0),
    unknownEstimateCount: resultDays.reduce((sum, day) => sum + day.unknownEstimateCount, 0),
    capacityMinutes:
      unknownCapacityDays > 0
        ? null
        : resultDays.reduce((sum, day) => sum + (day.capacityMinutes ?? 0), 0),
    unknownCapacityDays,
    actualMilliseconds: resultDays.reduce((sum, day) => sum + day.actualMilliseconds, 0),
    completedActionCount: resultDays.reduce((sum, day) => sum + day.completedActionCount, 0),
  };
}

type MutableDay = { -readonly [Key in keyof WorkTimeDay]: WorkTimeDay[Key] };
type MutableRow = { -readonly [Key in keyof WorkTimeRow]: WorkTimeRow[Key] };
type MutableGoal = { -readonly [Key in keyof WorkTimeGoal]: WorkTimeGoal[Key] };
interface Interval {
  readonly start: number;
  readonly end: number;
}

export function workIntervals(session: ActionSession, asOf: number): readonly Interval[] {
  const end = Math.min(session.completedAt?.getTime() ?? asOf, asOf);
  let cursor = session.startedAt.getTime();
  if (cursor >= end) return [];
  const pauses = session.pauseIntervals.map((pause) => ({
    start: pause.startedAt.getTime(),
    end: pause.endedAt.getTime(),
  }));
  if (session.pausedAt) pauses.push({ start: session.pausedAt.getTime(), end });
  const work: Interval[] = [];
  for (const pause of pauses) {
    const start = Math.min(pause.start, end);
    if (cursor < start) work.push({ start: cursor, end: start });
    cursor = Math.max(cursor, Math.min(pause.end, end));
  }
  if (cursor < end) work.push({ start: cursor, end });
  return work;
}
export function localMidnight(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(0);
  result.setFullYear(year!, month! - 1, day!);
  result.setHours(0, 0, 0, 0);
  return result;
}
export function nextMidnight(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}
export function localDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
