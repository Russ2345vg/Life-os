import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import type { DiaryMemoryField, MemoryDraft } from '../../../domain/memory';
import { MemoryEditor } from '../memory/MemoryEditor';
import { memoryError, type MemoryCatalog } from '../memory/memoryPresentation';

type DiaryMemoryTransfer = (field: DiaryMemoryField, getVersion: () => number | null) => void;

export function PlannerDiary({
  service,
  route,
  currentDate,
  onNavigate,
  memory,
}: {
  readonly service: DiaryService;
  readonly route: Extract<PlannerRoute, { view: 'diary' }>;
  readonly currentDate: DayDate;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly memory?:
    { readonly services: MemoryServices; readonly catalog: MemoryCatalog } | undefined;
}) {
  const resolved = resolveDiaryRoute(route, currentDate);
  const guard = useRouteLeaveGuard();
  const periodKey = `${resolved.period}:${resolved.date}`;
  const [preparedMemory, setPreparedMemory] = useState<{
    periodKey: string;
    draft: MemoryDraft;
  } | null>(null);
  const memoryDraft = preparedMemory?.periodKey === periodKey ? preparedMemory.draft : null;
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<{ periodKey: string; message: string } | null>(
    null,
  );
  const [previousPeriod, setPreviousPeriod] = useState(periodKey);
  if (previousPeriod !== periodKey) {
    setPreviousPeriod(periodKey);
    setPreparedMemory(null);
    setImportError(null);
  }
  const importingNow = useRef(false);
  const importGeneration = useRef(0);
  const memoryOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (memoryDraft === null && !importing && memoryOpener.current) {
      if (memoryOpener.current.isConnected) memoryOpener.current.focus();
      memoryOpener.current = null;
    }
  }, [memoryDraft, importing]);
  useEffect(() => {
    return () => {
      importGeneration.current += 1;
    };
  }, [resolved.date, resolved.period]);
  const importMemory = async (field: DiaryMemoryField, getVersion: () => number | null) => {
    if (!memory?.services.commands.enabled || importingNow.current) return;
    memoryOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    importingNow.current = true;
    setImporting(true);
    setImportError(null);
    const generation = importGeneration.current;
    try {
      if (!(await guard.flushBeforeLeave()))
        throw new Error(
          'Сначала повторите сохранение ответа дневника. Локальный текст остаётся на месте.',
        );
      const anchor = DayDate.create(resolved.date);
      const sourceVersion = getVersion();
      if (sourceVersion === null) throw new Error('Сначала сохраните ответ дневника.');
      const draft = await memory.services.diaryImport.prepare(
        resolved.period,
        anchor,
        field,
        sourceVersion,
      );
      if (generation === importGeneration.current) setPreparedMemory({ periodKey, draft });
    } catch (error: unknown) {
      if (generation === importGeneration.current)
        setImportError({ periodKey, message: memoryError(error) });
    } finally {
      importingNow.current = false;
      setImporting(false);
    }
  };
  const memoryAction = memory?.services.commands.enabled
    ? (field: DiaryMemoryField, getVersion: () => number | null) =>
        void importMemory(field, getVersion)
    : undefined;
  const [state, setState] = useState<
    | { readonly kind: 'loading' }
    | { readonly kind: 'day'; readonly date: string; readonly entry: DiaryDayEntry | null }
    | { readonly kind: 'week'; readonly date: string; readonly overview: DiaryWeekOverview }
    | { readonly kind: 'month'; readonly date: string; readonly overview: DiaryMonthOverview }
    | {
        readonly kind: 'error';
        readonly date: string;
        readonly period: ResolvedDiaryRoute['period'];
        readonly message: string;
      }
  >({ kind: 'loading' });
  useEffect(() => {
    let active = true;
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
            date: resolved.date,
            period: resolved.period,
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
      {importError?.periodKey === periodKey && (
        <p className="planner-error" role="alert">
          {importError.message}
        </p>
      )}
      {state.kind === 'loading' ? (
        <div className="planner-diary-loading" role="status">
          <span />
          <span />
          <span />
          Загружаем дневник…
        </div>
      ) : state.kind === 'error' &&
        state.date === resolved.date &&
        state.period === resolved.period ? (
        <div className="planner-error" role="alert">
          {state.message}
        </div>
      ) : state.kind === 'day' && state.date === resolved.date ? (
        <DiaryDayEditor
          key={resolved.date}
          service={service}
          date={DayDate.create(resolved.date)}
          entry={state.entry}
          onMemory={memoryAction}
          memoryBusy={importing}
        />
      ) : state.kind === 'week' && state.date === resolved.date ? (
        <DiaryWeekEditor
          key={resolved.date}
          service={service}
          overview={state.overview}
          onMemory={memoryAction}
          memoryBusy={importing}
        />
      ) : state.kind === 'month' && state.date === resolved.date ? (
        <DiaryMonthEditor
          key={resolved.date}
          service={service}
          overview={state.overview}
          onMemory={memoryAction}
          memoryBusy={importing}
        />
      ) : (
        <div className="planner-diary-loading" role="status">
          Загружаем дневник…
        </div>
      )}
      {memoryDraft && memory && (
        <MemoryEditor
          initialDraft={memoryDraft}
          expectedVersion={null}
          services={memory.services}
          today={currentDate.toString()}
          catalog={memory.catalog}
          onCancel={() => setPreparedMemory(null)}
          onSaved={(event) => {
            setPreparedMemory(null);
            onNavigate({
              view: 'memory',
              id: event.id.toString(),
              year: Number(event.occurredOn.toString().slice(0, 4)),
              mode: 'timeline',
            });
          }}
        />
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
  onMemory,
  memoryBusy = false,
}: {
  readonly service: DiaryService;
  readonly date: DayDate;
  readonly entry: DiaryDayEntry | null;
  readonly onMemory?: DiaryMemoryTransfer | undefined;
  readonly memoryBusy?: boolean;
}) {
  const guard = useRouteLeaveGuard();
  const initial = useMemo(
    () => entry ?? createDiaryDraft(diaryPeriod('day', date), new Date()),
    [date, entry],
  );
  const [payload, setPayload] = useState<DiaryDayPayload>(initial.payload);
  const [completed, setCompleted] = useState(entry?.status === 'completed');
  const [completing, setCompleting] = useState(false);
  const completionInProgress = useRef(false);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<unknown>(null);
  const autosave = useDiaryAutosave<DiaryDayPayload>({
    initialVersion: entry?.version ?? null,
    guard,
    saveDraft: (next, expectedVersion) =>
      service.saveDraft({ kind: 'day', anchor: date, payload: next, expectedVersion }),
  });
  const status: DiarySaveStatus =
    completing || autosave.inspect.pending
      ? 'saving'
      : autosave.inspect.failed
        ? 'failed'
        : completed
          ? 'completed'
          : 'saved';
  const change = (next: DiaryDayPayload) => {
    if (completionInProgress.current || memoryBusy) return;
    setPayload(next);
    setCompleted(false);
    setConflictVersion(null);
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
    if (completionInProgress.current) return;
    completionInProgress.current = true;
    setCompleting(true);
    setCompletionError(null);
    try {
      await autosave.flush();
      await autosave.runOperation(async () => {
        const saved = await service.complete({
          kind: 'day',
          anchor: date,
          payload,
          expectedVersion: autosave.getVersion(),
        });
        autosave.replaceVersion(saved.version);
      });
      setCompleted(true);
    } catch (error: unknown) {
      setCompletionError(error);
    } finally {
      completionInProgress.current = false;
      setCompleting(false);
    }
  };
  const retryCompletion = async () => {
    try {
      if (isConflict(completionError)) {
        const remote = await service.get('day', date);
        autosave.replaceVersion(remote?.version ?? null);
        setConflictVersion(remote?.version ?? null);
      }
      await complete();
    } catch (error: unknown) {
      setCompletionError(error);
    }
  };
  return (
    <>
      {autosave.draftFailed ? (
        <DiarySaveError
          error={autosave.error}
          conflictVersion={conflictVersion}
          onRetry={() => void retry()}
        />
      ) : completionError !== null ? (
        <DiarySaveError
          error={completionError}
          conflictVersion={conflictVersion}
          onRetry={() => void retryCompletion()}
        />
      ) : null}
      <DiaryDayView
        payload={payload}
        status={status}
        disabled={completing || memoryBusy}
        onMemory={onMemory ? (field) => onMemory(field, autosave.getVersion) : undefined}
        onChange={change}
        onComplete={() => void complete()}
      />
    </>
  );
}

function DiaryWeekEditor({
  service,
  overview,
  onMemory,
  memoryBusy = false,
}: {
  readonly service: DiaryService;
  readonly overview: DiaryWeekOverview;
  readonly onMemory?: DiaryMemoryTransfer | undefined;
  readonly memoryBusy?: boolean;
}) {
  const guard = useRouteLeaveGuard();
  const initial = useMemo(
    () => overview.entry ?? createDiaryDraft(overview.period, new Date()),
    [overview],
  );
  const [payload, setPayload] = useState<DiaryWeekPayload>(initial.payload);
  const [completed, setCompleted] = useState(overview.entry?.status === 'completed');
  const [completing, setCompleting] = useState(false);
  const completionInProgress = useRef(false);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<unknown>(null);
  const anchor = overview.period.periodStart;
  const autosave = useDiaryAutosave<DiaryWeekPayload>({
    initialVersion: overview.entry?.version ?? null,
    guard,
    saveDraft: (next, expectedVersion) =>
      service.saveDraft({ kind: 'week', anchor, payload: next, expectedVersion }),
  });
  const status = diarySaveStatus(autosave.inspect, completed, completing);
  const change = (next: DiaryWeekPayload) => {
    if (completionInProgress.current) return;
    setPayload(next);
    setCompleted(false);
    setConflictVersion(null);
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
    if (completionInProgress.current) return;
    completionInProgress.current = true;
    setCompleting(true);
    setCompletionError(null);
    try {
      await autosave.flush();
      await autosave.runOperation(async () => {
        const saved = await service.complete({
          kind: 'week',
          anchor,
          payload,
          expectedVersion: autosave.getVersion(),
        });
        autosave.replaceVersion(saved.version);
      });
      setCompleted(true);
    } catch (error: unknown) {
      setCompletionError(error);
    } finally {
      completionInProgress.current = false;
      setCompleting(false);
    }
  };
  const retryCompletion = async () => {
    try {
      if (isConflict(completionError)) {
        const remote = await service.get('week', anchor);
        autosave.replaceVersion(remote?.version ?? null);
        setConflictVersion(remote?.version ?? null);
      }
      await complete();
    } catch (error: unknown) {
      setCompletionError(error);
    }
  };
  return (
    <>
      {autosave.draftFailed ? (
        <DiarySaveError
          error={autosave.error}
          conflictVersion={conflictVersion}
          onRetry={() => void retry()}
        />
      ) : completionError !== null ? (
        <DiarySaveError
          error={completionError}
          conflictVersion={conflictVersion}
          onRetry={() => void retryCompletion()}
        />
      ) : null}
      <DiaryWeekView
        payload={payload}
        summary={overview.summary}
        completedActions={overview.planning.completed.length}
        goalsWithRecords={overview.planning.withRecords}
        status={status}
        disabled={completing || memoryBusy}
        onMemory={onMemory ? (field) => onMemory(field, autosave.getVersion) : undefined}
        onChange={change}
        onComplete={() => void complete()}
      />
    </>
  );
}

function DiaryMonthEditor({
  service,
  overview,
  onMemory,
  memoryBusy = false,
}: {
  readonly service: DiaryService;
  readonly overview: DiaryMonthOverview;
  readonly onMemory?: DiaryMemoryTransfer | undefined;
  readonly memoryBusy?: boolean;
}) {
  const guard = useRouteLeaveGuard();
  const initial = useMemo(
    () => overview.entry ?? createDiaryDraft(overview.period, new Date()),
    [overview],
  );
  const [payload, setPayload] = useState<DiaryMonthPayload>(initial.payload);
  const [completed, setCompleted] = useState(overview.entry?.status === 'completed');
  const [completing, setCompleting] = useState(false);
  const completionInProgress = useRef(false);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<unknown>(null);
  const anchor = overview.period.periodStart;
  const autosave = useDiaryAutosave<DiaryMonthPayload>({
    initialVersion: overview.entry?.version ?? null,
    guard,
    saveDraft: (next, expectedVersion) =>
      service.saveDraft({ kind: 'month', anchor, payload: next, expectedVersion }),
  });
  const status = diarySaveStatus(autosave.inspect, completed, completing);
  const change = (next: DiaryMonthPayload) => {
    if (completionInProgress.current) return;
    setPayload(next);
    setCompleted(false);
    setConflictVersion(null);
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
    if (completionInProgress.current) return;
    completionInProgress.current = true;
    setCompleting(true);
    setCompletionError(null);
    try {
      await autosave.flush();
      await autosave.runOperation(async () => {
        const saved = await service.complete({
          kind: 'month',
          anchor,
          payload,
          expectedVersion: autosave.getVersion(),
        });
        autosave.replaceVersion(saved.version);
      });
      setCompleted(true);
    } catch (error: unknown) {
      setCompletionError(error);
    } finally {
      completionInProgress.current = false;
      setCompleting(false);
    }
  };
  const retryCompletion = async () => {
    try {
      if (isConflict(completionError)) {
        const remote = await service.get('month', anchor);
        autosave.replaceVersion(remote?.version ?? null);
        setConflictVersion(remote?.version ?? null);
      }
      await complete();
    } catch (error: unknown) {
      setCompletionError(error);
    }
  };
  return (
    <>
      {autosave.draftFailed ? (
        <DiarySaveError
          error={autosave.error}
          conflictVersion={conflictVersion}
          onRetry={() => void retry()}
        />
      ) : completionError !== null ? (
        <DiarySaveError
          error={completionError}
          conflictVersion={conflictVersion}
          onRetry={() => void retryCompletion()}
        />
      ) : null}
      <DiaryMonthView
        payload={payload}
        summary={overview.summary}
        weekBuckets={overview.weekBuckets}
        weeklyReflections={overview.weeklyReflections}
        completedActions={overview.planning.completed.length}
        goalsWithRecords={overview.planning.withRecords}
        status={status}
        disabled={completing || memoryBusy}
        onMemory={onMemory ? (field) => onMemory(field, autosave.getVersion) : undefined}
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
  completing = false,
): DiarySaveStatus {
  return completing || inspect.pending
    ? 'saving'
    : inspect.failed
      ? 'failed'
      : completed
        ? 'completed'
        : 'saved';
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
