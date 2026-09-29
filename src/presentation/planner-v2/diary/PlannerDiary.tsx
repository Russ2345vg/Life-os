import { useEffect, useMemo, useState } from 'react';
import type { DiaryMonthOverview, DiaryService, DiaryWeekOverview } from '../../../application';
import {
  createDiaryDraft,
  DayDate,
  diaryPeriod,
  type DiaryDayEntry,
  type DiaryDayPayload,
  type DiaryMonthPayload,
  type DiaryWeekPayload,
} from '../../../domain';
import { addDays } from '../../../domain/planner/PlanningPeriod';
import { DomainError } from '../../../shared/errors/DomainError';
import { useRouteLeaveGuard } from '../../navigation/RouteLeaveGuard';
import {
  resolveDiaryRoute,
  type PlannerRoute,
  type ResolvedDiaryRoute,
} from '../PlannerNavigation';
import { DiaryDayView, type DiarySaveStatus } from './DiaryDayView';
import { DiaryMonthView } from './DiaryMonthView';
import { DiaryWeekView } from './DiaryWeekView';
import { useDiaryAutosave } from './useDiaryAutosave';

export function PlannerDiary({
  service,
  route,
  currentDate,
  onNavigate,
}: {
  readonly service: DiaryService;
  readonly route: Extract<PlannerRoute, { view: 'diary' }>;
  readonly currentDate: DayDate;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  const resolved = resolveDiaryRoute(route, currentDate);
  const [state, setState] = useState<
    | { readonly kind: 'loading' }
    | { readonly kind: 'day'; readonly date: string; readonly entry: DiaryDayEntry | null }
    | { readonly kind: 'week'; readonly date: string; readonly overview: DiaryWeekOverview }
    | { readonly kind: 'month'; readonly date: string; readonly overview: DiaryMonthOverview }
    | { readonly kind: 'error'; readonly message: string }
  >({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    const date = DayDate.create(resolved.date);
    const load =
      resolved.period === 'day'
        ? service.get('day', date).then((entry) => {
            if (entry !== null && entry.kind !== 'day')
              throw new Error('Запись дневника относится к другому периоду.');
            return { kind: 'day' as const, date: resolved.date, entry };
          })
        : resolved.period === 'week'
          ? service
              .getWeekOverview(date)
              .then((overview) => ({ kind: 'week' as const, date: resolved.date, overview }))
          : service
              .getMonthOverview(date)
              .then((overview) => ({ kind: 'month' as const, date: resolved.date, overview }));
    void load
      .then((next) => {
        if (active) setState(next);
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Не удалось загрузить дневник.',
          });
      });
    return () => {
      active = false;
    };
  }, [resolved.date, resolved.period, service]);

  return (
    <section className="planner-diary" aria-labelledby="planner-diary-title">
      <DiaryHeader route={resolved} currentDate={currentDate} onNavigate={onNavigate} />
      {state.kind === 'loading' ? (
        <div className="planner-diary-loading" role="status">
          <span />
          <span />
          <span />
          Загружаем дневник…
        </div>
      ) : state.kind === 'error' ? (
        <div className="planner-error" role="alert">
          {state.message}
        </div>
      ) : state.kind === 'day' && state.date === resolved.date ? (
        <DiaryDayEditor
          key={resolved.date}
          service={service}
          date={DayDate.create(resolved.date)}
          entry={state.entry}
        />
      ) : state.kind === 'week' && state.date === resolved.date ? (
        <DiaryWeekEditor key={resolved.date} service={service} overview={state.overview} />
      ) : state.kind === 'month' && state.date === resolved.date ? (
        <DiaryMonthEditor key={resolved.date} service={service} overview={state.overview} />
      ) : (
        <div className="planner-diary-loading" role="status">
          Загружаем дневник…
        </div>
      )}
    </section>
  );
}

function DiaryHeader({
  route,
  currentDate,
  onNavigate,
}: {
  readonly route: ResolvedDiaryRoute;
  readonly currentDate: DayDate;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  const next = shiftRoute(route, 1, currentDate);
  return (
    <header className="planner-diary-header">
      <div>
        <p className="planner-eyebrow">Личная запись</p>
        <h1 id="planner-diary-title">Дневник</h1>
      </div>
      <div className="planner-segments" aria-label="Период дневника">
        {(['day', 'week', 'month'] as const).map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={route.period === period}
            onClick={() =>
              onNavigate({
                view: 'diary',
                period,
                date: resolveDiaryRoute({ view: 'diary', period }, currentDate).date,
              })
            }
          >
            {{ day: 'День', week: 'Неделя', month: 'Месяц' }[period]}
          </button>
        ))}
      </div>
      <div className="planner-diary-calendar" aria-label="Выбранный период">
        <button
          type="button"
          aria-label="Предыдущий период"
          onClick={() => onNavigate(shiftRoute(route, -1, currentDate))}
        >
          ←
        </button>
        <strong>{periodLabel(route)}</strong>
        <button
          type="button"
          aria-label="Следующий период"
          disabled={next.date === route.date}
          onClick={() => onNavigate(next)}
        >
          →
        </button>
      </div>
    </header>
  );
}

function DiaryDayEditor({
  service,
  date,
  entry,
}: {
  readonly service: DiaryService;
  readonly date: DayDate;
  readonly entry: DiaryDayEntry | null;
}) {
  const guard = useRouteLeaveGuard();
  const initial = useMemo(
    () => entry ?? createDiaryDraft(diaryPeriod('day', date), new Date()),
    [date, entry],
  );
  const [payload, setPayload] = useState<DiaryDayPayload>(initial.payload);
  const [completed, setCompleted] = useState(entry?.status === 'completed');
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<unknown>(null);
  const autosave = useDiaryAutosave<DiaryDayPayload>({
    initialVersion: entry?.version ?? null,
    guard,
    saveDraft: (next, expectedVersion) =>
      service.saveDraft({ kind: 'day', anchor: date, payload: next, expectedVersion }),
  });
  const status: DiarySaveStatus = autosave.inspect.pending
    ? 'saving'
    : autosave.inspect.failed
      ? 'failed'
      : completed
        ? 'completed'
        : 'saved';
  const change = (next: DiaryDayPayload) => {
    setPayload(next);
    setCompleted(false);
    setCompletionError(null);
    autosave.enqueue(next);
  };
  const retry = async () => {
    if (isConflict(autosave.error)) {
      const remote = await service.get('day', date);
      autosave.replaceVersion(remote?.version ?? null);
      setConflictVersion(remote?.version ?? null);
    }
    await autosave.retry();
  };
  const complete = async () => {
    setCompletionError(null);
    try {
      await autosave.flush();
      const saved = await service.complete({
        kind: 'day',
        anchor: date,
        payload,
        expectedVersion: autosave.getVersion(),
      });
      autosave.replaceVersion(saved.version);
      setCompleted(true);
    } catch (error: unknown) {
      setCompletionError(error);
    }
  };
  return (
    <>
      {autosave.inspect.failed ? (
        <DiarySaveError
          error={autosave.error}
          conflictVersion={conflictVersion}
          onRetry={() => void retry()}
        />
      ) : completionError !== null ? (
        <DiarySaveError error={completionError} onRetry={() => void complete()} />
      ) : null}
      <DiaryDayView
        payload={payload}
        status={status}
        onChange={change}
        onComplete={() => void complete()}
      />
    </>
  );
}

function DiaryWeekEditor({
  service,
  overview,
}: {
  readonly service: DiaryService;
  readonly overview: DiaryWeekOverview;
}) {
  const guard = useRouteLeaveGuard();
  const initial = useMemo(
    () => overview.entry ?? createDiaryDraft(overview.period, new Date()),
    [overview],
  );
  const [payload, setPayload] = useState<DiaryWeekPayload>(initial.payload);
  const [completed, setCompleted] = useState(overview.entry?.status === 'completed');
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<unknown>(null);
  const anchor = overview.period.periodStart;
  const autosave = useDiaryAutosave<DiaryWeekPayload>({
    initialVersion: overview.entry?.version ?? null,
    guard,
    saveDraft: (next, expectedVersion) =>
      service.saveDraft({ kind: 'week', anchor, payload: next, expectedVersion }),
  });
  const status = diarySaveStatus(autosave.inspect, completed);
  const change = (next: DiaryWeekPayload) => {
    setPayload(next);
    setCompleted(false);
    setCompletionError(null);
    autosave.enqueue(next);
  };
  const retry = async () => {
    if (isConflict(autosave.error)) {
      const remote = await service.get('week', anchor);
      autosave.replaceVersion(remote?.version ?? null);
      setConflictVersion(remote?.version ?? null);
    }
    await autosave.retry();
  };
  const complete = async () => {
    setCompletionError(null);
    try {
      await autosave.flush();
      const saved = await service.complete({
        kind: 'week',
        anchor,
        payload,
        expectedVersion: autosave.getVersion(),
      });
      autosave.replaceVersion(saved.version);
      setCompleted(true);
    } catch (error: unknown) {
      setCompletionError(error);
    }
  };
  return (
    <>
      {autosave.inspect.failed ? (
        <DiarySaveError
          error={autosave.error}
          conflictVersion={conflictVersion}
          onRetry={() => void retry()}
        />
      ) : completionError !== null ? (
        <DiarySaveError error={completionError} onRetry={() => void complete()} />
      ) : null}
      <DiaryWeekView
        payload={payload}
        summary={overview.summary}
        completedActions={overview.planning.completed.length}
        goalsWithRecords={overview.planning.withRecords}
        status={status}
        onChange={change}
        onComplete={() => void complete()}
      />
    </>
  );
}

function DiaryMonthEditor({
  service,
  overview,
}: {
  readonly service: DiaryService;
  readonly overview: DiaryMonthOverview;
}) {
  const guard = useRouteLeaveGuard();
  const initial = useMemo(
    () => overview.entry ?? createDiaryDraft(overview.period, new Date()),
    [overview],
  );
  const [payload, setPayload] = useState<DiaryMonthPayload>(initial.payload);
  const [completed, setCompleted] = useState(overview.entry?.status === 'completed');
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<unknown>(null);
  const anchor = overview.period.periodStart;
  const autosave = useDiaryAutosave<DiaryMonthPayload>({
    initialVersion: overview.entry?.version ?? null,
    guard,
    saveDraft: (next, expectedVersion) =>
      service.saveDraft({ kind: 'month', anchor, payload: next, expectedVersion }),
  });
  const status = diarySaveStatus(autosave.inspect, completed);
  const change = (next: DiaryMonthPayload) => {
    setPayload(next);
    setCompleted(false);
    setCompletionError(null);
    autosave.enqueue(next);
  };
  const retry = async () => {
    if (isConflict(autosave.error)) {
      const remote = await service.get('month', anchor);
      autosave.replaceVersion(remote?.version ?? null);
      setConflictVersion(remote?.version ?? null);
    }
    await autosave.retry();
  };
  const complete = async () => {
    setCompletionError(null);
    try {
      await autosave.flush();
      const saved = await service.complete({
        kind: 'month',
        anchor,
        payload,
        expectedVersion: autosave.getVersion(),
      });
      autosave.replaceVersion(saved.version);
      setCompleted(true);
    } catch (error: unknown) {
      setCompletionError(error);
    }
  };
  return (
    <>
      {autosave.inspect.failed ? (
        <DiarySaveError
          error={autosave.error}
          conflictVersion={conflictVersion}
          onRetry={() => void retry()}
        />
      ) : completionError !== null ? (
        <DiarySaveError error={completionError} onRetry={() => void complete()} />
      ) : null}
      <DiaryMonthView
        payload={payload}
        summary={overview.summary}
        weekBuckets={overview.weekBuckets}
        weeklyReflections={overview.weeklyReflections}
        completedActions={overview.planning.completed.length}
        goalsWithRecords={overview.planning.withRecords}
        status={status}
        onChange={change}
        onComplete={() => void complete()}
      />
    </>
  );
}

function DiarySaveError({
  error,
  conflictVersion = null,
  onRetry,
}: {
  readonly error: unknown;
  readonly conflictVersion?: number | null;
  readonly onRetry: () => void;
}) {
  const conflict = isConflict(error);
  return (
    <div className="planner-diary-save-error" role="alert">
      <p>
        {conflict
          ? `Запись изменилась в другом окне${conflictVersion === null ? '' : ` · версия ${conflictVersion}`}. Локальный текст сохранён.`
          : 'Сохранение не завершилось. Локальный текст сохранён.'}
      </p>
      <button type="button" onClick={onRetry}>
        {conflict ? 'Применить мои изменения повторно' : 'Повторить сохранение'}
      </button>
    </div>
  );
}

function diarySaveStatus(
  inspect: { readonly pending: boolean; readonly failed: boolean },
  completed: boolean,
): DiarySaveStatus {
  return inspect.pending ? 'saving' : inspect.failed ? 'failed' : completed ? 'completed' : 'saved';
}

function shiftRoute(
  route: ResolvedDiaryRoute,
  direction: -1 | 1,
  today: DayDate,
): ResolvedDiaryRoute {
  const date =
    route.period === 'day'
      ? addDays(route.date, direction)
      : route.period === 'week'
        ? addDays(route.date, direction * 7)
        : shiftMonth(route.date, direction);
  return resolveDiaryRoute({ view: 'diary', period: route.period, date }, today);
}

function shiftMonth(date: string, direction: -1 | 1): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return value.toISOString().slice(0, 10);
}

function periodLabel(route: ResolvedDiaryRoute): string {
  const start = new Date(`${route.date}T12:00:00Z`);
  if (route.period === 'day')
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    }).format(start);
  if (route.period === 'month')
    return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(start);
  return `${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(start)} — ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${addDays(route.date, 6)}T12:00:00Z`))}`;
}

function isConflict(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'persistence.version_conflict';
}
