import { DayDate, type ActionSession, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { localDate, localMidnight, nextMidnight, workIntervals } from './GetWorkTimeReport';

export interface FocusHistoryRow {
  readonly sessionId: string;
  readonly actionId: string;
  readonly title: string;
  readonly available: boolean;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly milliseconds: number;
  readonly status: 'running' | 'paused' | 'completed' | 'interrupted';
}
export interface FocusHistory {
  readonly totalMilliseconds: number;
  readonly rows: readonly FocusHistoryRow[];
  readonly days: readonly {
    readonly date: string;
    readonly totalMilliseconds: number;
    readonly rows: readonly FocusHistoryRow[];
  }[];
}
export function buildFocusHistory(input: {
  readonly from: string;
  readonly to: string;
  readonly asOf: Date;
  readonly sessions: readonly ActionSession[];
  readonly actions: readonly LifeAction[];
}): FocusHistory {
  DayDate.create(input.from);
  DayDate.create(input.to);
  if (input.from > input.to || !Number.isFinite(input.asOf.getTime()))
    throw new DomainError('focus_history.invalid_range', 'Период истории указан некорректно.');
  const start = localMidnight(input.from).getTime();
  const end = nextMidnight(localMidnight(input.to)).getTime();
  const rows: FocusHistoryRow[] = [];
  const days = new Map<
    string,
    { date: string; totalMilliseconds: number; rows: FocusHistoryRow[] }
  >();
  const actions = new Map(input.actions.map((action) => [action.id.toString(), action]));
  for (const session of [...input.sessions].sort(
    (a, b) =>
      b.startedAt.getTime() - a.startedAt.getTime() ||
      a.id.toString().localeCompare(b.id.toString()),
  )) {
    if (session.kind !== 'focus') continue;
    const perDay = new Map<string, number>();
    for (const interval of workIntervals(session, input.asOf.getTime())) {
      let cursor = Math.max(interval.start, start);
      const until = Math.min(interval.end, end);
      while (cursor < until) {
        const boundary = Math.min(nextMidnight(new Date(cursor)).getTime(), until);
        const date = localDate(new Date(cursor));
        perDay.set(date, (perDay.get(date) ?? 0) + boundary - cursor);
        cursor = boundary;
      }
    }
    const milliseconds = [...perDay.values()].reduce((sum, duration) => sum + duration, 0);
    if (milliseconds === 0) continue;
    const action = actions.get(session.lifeActionId.toString());
    const completed =
      session.completedAt !== null && session.completedAt.getTime() <= input.asOf.getTime();
    const row: FocusHistoryRow = {
      sessionId: session.id.toString(),
      actionId: session.lifeActionId.toString(),
      title: action && !action.isDeleted() ? action.title.toString() : 'Действие недоступно',
      available: !!action && !action.isDeleted(),
      startedAt: session.startedAt.toISOString(),
      endedAt: completed ? session.completedAt!.toISOString() : null,
      milliseconds,
      status: completed
        ? session.isInterrupted()
          ? 'interrupted'
          : 'completed'
        : session.isPaused()
          ? 'paused'
          : 'running',
    };
    rows.push(row);
    for (const [date, duration] of perDay) {
      const day = days.get(date) ?? { date, totalMilliseconds: 0, rows: [] };
      day.totalMilliseconds += duration;
      day.rows.push({ ...row, milliseconds: duration });
      days.set(date, day);
    }
  }
  return {
    totalMilliseconds: rows.reduce((sum, row) => sum + row.milliseconds, 0),
    rows,
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
