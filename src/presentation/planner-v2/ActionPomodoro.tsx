import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { WorkSessions } from '../../application/time/WorkSessions';
import type { ActionSession } from '../../domain';
import { PlannerSheet } from './PlannerSheet';
import type { PlannerWorkTimeController } from './usePlannerWorkTime';
import {
  advancePomodoro,
  createPomodoro,
  pausePomodoro,
  pomodoroRemaining,
  readPomodoro,
  startPomodoroPhase,
  type ActionPomodoroSnapshot,
  FOCUS_MS,
} from '../../domain/pomodoro/ActionPomodoroCycle';
import {
  morningFocusStorageKey,
  readMorningFocusLedger,
  recordMorningFocusSession,
} from './MorningFocusLedger';
import './action-pomodoro.css';

const STORAGE_KEY = 'lifeos-action-pomodoro-v1';

export interface PomodoroSelection {
  readonly actionId: string;
  readonly title: string;
  readonly morningDateKey?: string;
}

export function ActionPomodoro({
  selection,
  onCloseSelection,
  workTime,
  service,
  onOpenWorkTime,
}: {
  readonly selection: PomodoroSelection | null;
  readonly onCloseSelection: () => void;
  readonly workTime: PlannerWorkTimeController;
  readonly service:
    | Pick<WorkSessions, 'list' | 'start' | 'pause' | 'pauseAtDeadline' | 'resume' | 'finish'>
    | undefined;
  readonly onOpenWorkTime: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ActionPomodoroSnapshot | null>(() =>
    typeof window === 'undefined' ? null : readPomodoro(window.localStorage.getItem(STORAGE_KEY)),
  );
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastSelection = useRef<PomodoroSelection | null>(null);
  useEffect(() => {
    if (selection && selection !== lastSelection.current) {
      setOpen(true);
      setError(null);
    }
    lastSelection.current = selection;
  }, [selection]);
  useEffect(() => {
    if (snapshot) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [snapshot]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, []);

  const visible = selection ?? snapshot;
  const activeForSelection = snapshot?.actionId === visible?.actionId ? snapshot : null;
  const display =
    activeForSelection ?? (visible ? createPomodoro(visible.actionId, visible.title) : null);
  const unfinished = workTime.sessions?.filter((session) => !session.isCompleted()) ?? [];
  const conflict = visible
    ? unfinished.some((session) => session.lifeActionId.toString() !== visible.actionId) ||
      unfinished.length > 1
    : false;

  const refreshWorkTime = workTime.refresh;
  const command = useCallback(
    async (perform: () => Promise<void>) => {
      if (working.current) return;
      working.current = true;
      setBusy(true);
      setError(null);
      try {
        await perform();
        await refreshWorkTime();
      } catch (reason: unknown) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось обновить фокус. Повторите попытку.',
        );
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [refreshWorkTime],
  );
  const findSession = useCallback(
    async (state: ActionPomodoroSnapshot): Promise<ActionSession | null> => {
      if (!service) throw new Error('Рабочие сессии недоступны.');
      const sessions = await service.list();
      return (
        sessions.find(
          (session) => session.id.toString() === state.sessionId && !session.isCompleted(),
        ) ?? null
      );
    },
    [service],
  );
  const start = () => {
    if (!display || !service || conflict || workTime.sessions === null) return;
    void command(async () => {
      const latest = await service.list();
      if (
        latest.some(
          (session) =>
            !session.isCompleted() && session.lifeActionId.toString() !== display.actionId,
        )
      )
        throw new Error('Другое действие уже в работе. Завершите его в «Рабочем времени».');
      let session = latest.find(
        (item) => !item.isCompleted() && item.lifeActionId.toString() === display.actionId,
      );
      if (session?.isPaused())
        session = await service.resume(session.id.toString(), session.version);
      else if (!session) session = await service.start(display.actionId);
      if (selection?.morningDateKey && selection.actionId === display.actionId) {
        const dateKey = selection.morningDateKey;
        const previous = readMorningFocusLedger(window.localStorage, dateKey, display.actionId);
        const next = recordMorningFocusSession(previous, dateKey, session, new Date());
        window.localStorage.setItem(
          morningFocusStorageKey(dateKey, display.actionId),
          JSON.stringify(next),
        );
      }
      setSnapshot(startPomodoroPhase(display, Date.now(), session.id.toString()));
    });
  };
  const pause = () => {
    if (!display || !service) return;
    void command(async () => {
      const session = await findSession(display);
      if (!session?.isRunning()) throw new Error('Рабочая сессия изменилась. Обновите фокус.');
      await service.pause(session.id.toString(), session.version);
      setSnapshot(pausePomodoro(display, Date.now()));
    });
  };
  const finish = () => {
    if (!display || !service) return;
    void command(async () => {
      const session = await findSession(display);
      if (session) await service.finish(session.id.toString(), session.version);
      setSnapshot(null);
      setOpen(false);
      onCloseSelection();
    });
  };
  useEffect(() => {
    if (
      !snapshot ||
      snapshot.deadline === null ||
      pomodoroRemaining(snapshot, now) > 0 ||
      working.current
    )
      return;
    if (snapshot.phase === 'break') {
      queueMicrotask(() =>
        setSnapshot((current) =>
          current === snapshot ? advancePomodoro(snapshot, Date.now()) : current,
        ),
      );
      return;
    }
    if (snapshot.phase !== 'focus' || !service) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void command(async () => {
        const session = await findSession(snapshot);
        if (!session) {
          setSnapshot(null);
          return;
        }
        if (session.isRunning())
          await service.pauseAtDeadline(
            session.id.toString(),
            session.version,
            new Date(snapshot.deadline!),
          );
        setSnapshot(advancePomodoro(snapshot, Date.now()));
      });
    });
    return () => {
      active = false;
    };
  }, [snapshot, now, service, command, findSession]);
  useEffect(() => {
    if (!snapshot || workTime.sessions === null) return;
    if (!snapshot.sessionId) return;
    const session = workTime.sessions.find((item) => item.id.toString() === snapshot.sessionId);
    if (!session) return;
    const next = session.isCompleted()
      ? null
      : snapshot.phase === 'focus' && session.isPaused() && pomodoroRemaining(snapshot, now) > 0
        ? pausePomodoro(snapshot, now)
        : snapshot.phase === 'paused' && session.isRunning()
          ? startPomodoroPhase(snapshot, now)
          : snapshot;
    if (next !== snapshot)
      queueMicrotask(() => setSnapshot((current) => (current === snapshot ? next : current)));
  }, [workTime.sessions, snapshot, now]);

  const close = () => {
    setOpen(false);
    onCloseSelection();
  };
  const remaining = display ? pomodoroRemaining(display, now) : 0;
  const duration = display?.phase === 'break' ? display.remainingMs : FOCUS_MS;
  const progress = display ? Math.min(100, Math.max(0, (remaining / duration) * 100)) : 0;
  const phaseLabel =
    display?.phase === 'break'
      ? 'Перерыв'
      : display?.phase === 'paused'
        ? 'Фокус на паузе'
        : 'Фокус';
  return (
    <>
      {snapshot && !open && (
        <button type="button" className="action-pomodoro-indicator" onClick={() => setOpen(true)}>
          {snapshot.phase === 'break' ? 'Перерыв' : 'Фокус'} ·{' '}
          {clockLabel(pomodoroRemaining(snapshot, now))} · {snapshot.title}
        </button>
      )}
      {open && display && (
        <PlannerSheet title="Фокус" onClose={close} lockScroll initialFocus={() => heading.current}>
          <section className="action-pomodoro" aria-label="Помодоро по действию">
            <p className="planner-eyebrow">Фокус по действию</p>
            <h2 ref={heading} tabIndex={-1}>
              {display.title}
            </h2>
            <p className="planner-muted">
              25 минут работы · 5 минут перерыв · длинный перерыв после четырёх циклов
            </p>
            <div
              className="action-pomodoro__dial"
              style={{ '--pomodoro-progress': `${progress}%` } as CSSProperties}
            >
              <div>
                <span>{phaseLabel}</span>
                <strong role="timer" aria-label="Осталось времени">
                  {clockLabel(remaining)}
                </strong>
                <small>
                  {display.phase === 'ready'
                    ? 'Готовы начать'
                    : `${display.completedFocuses} фокусных отрезков завершено`}
                </small>
              </div>
            </div>
            {workTime.sessions === null && !workTime.error && (
              <p role="status">Загружаем рабочие сессии…</p>
            )}
            {conflict && (
              <div className="planner-error" role="alert">
                <p>Другое действие уже в работе. Завершите его, чтобы начать новый фокус.</p>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onOpenWorkTime();
                  }}
                >
                  Открыть рабочее время
                </button>
              </div>
            )}
            {(error || workTime.error) && (
              <div className="planner-error" role="alert">
                <p>{error ?? workTime.error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    void workTime.refresh().catch(() => {});
                  }}
                >
                  Повторить
                </button>
              </div>
            )}
            <div className="action-pomodoro__controls">
              {(display.phase === 'ready' || display.phase === 'paused') && (
                <button
                  type="button"
                  className="planner-primary"
                  disabled={busy || conflict || workTime.sessions === null || !service}
                  onClick={start}
                >
                  {display.phase === 'paused' ? 'Продолжить фокус' : 'Начать фокус'}
                </button>
              )}
              {display.phase === 'focus' && (
                <button type="button" className="planner-primary" disabled={busy} onClick={pause}>
                  Пауза
                </button>
              )}
              {display.phase === 'break' && (
                <p role="status">Перерыв не учитывается как рабочее время.</p>
              )}
              {activeForSelection && (
                <button type="button" disabled={busy} onClick={finish}>
                  Закончить работу
                </button>
              )}
            </div>
          </section>
        </PlannerSheet>
      )}
    </>
  );
}

function clockLabel(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
