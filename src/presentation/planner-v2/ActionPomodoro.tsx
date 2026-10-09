import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { DesktopFocusWindow } from '../../application/ports/DesktopFocusWindow';
import type { PomodoroPreferences } from '../../application/ports/PomodoroPreferences';
import { PomodoroSettingsForm } from './PomodoroSettingsForm';
import { useDesktopFocusWindow } from './useDesktopFocusWindow';
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
  DEFAULT_POMODORO_SETTINGS,
  validatePomodoroSettings,
  type PomodoroSettings,
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
  preferences,
  desktopWindow,
}: {
  readonly selection: PomodoroSelection | null;
  readonly onCloseSelection: () => void;
  readonly workTime: PlannerWorkTimeController;
  readonly service:
    | Pick<
        WorkSessions,
        'list' | 'start' | 'pause' | 'pauseAtDeadline' | 'finishAtDeadline' | 'resume' | 'finish'
      >
    | undefined;
  readonly onOpenWorkTime: () => void;
  readonly preferences?: PomodoroPreferences | undefined;
  readonly desktopWindow?: DesktopFocusWindow | undefined;
}) {
  const [settings, setSettings] = useState(() => preferences?.read() ?? DEFAULT_POMODORO_SETTINGS);
  const [snapshot, setSnapshot] = useState<ActionPomodoroSnapshot | null>(() =>
    typeof window === 'undefined' ? null : readPomodoro(window.localStorage.getItem(STORAGE_KEY)),
  );
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const native = useDesktopFocusWindow(
    desktopWindow,
    snapshot?.phase === 'focus' || snapshot?.phase === 'paused',
  );
  const wasCompact = useRef(false);
  useEffect(() => {
    const previousCompact = wasCompact.current;
    wasCompact.current = native.compact;
    if (native.compact) {
      queueMicrotask(() => {
        setOpen(false);
        if (!previousCompact) onCloseSelection();
      });
    } else if (previousCompact && snapshot) queueMicrotask(() => setOpen(true));
  }, [native.compact, snapshot, onCloseSelection]);
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
    activeForSelection && activeForSelection.phase !== 'ready'
      ? activeForSelection
      : visible
        ? {
            ...createPomodoro(visible.actionId, visible.title, settings),
            completedFocuses: activeForSelection?.completedFocuses ?? 0,
          }
        : null;
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
  const start = (target = display) => {
    const display = target;
    if (!display || !service || workTime.sessions === null) return;
    void command(async () => {
      const latest = await service.list();
      if (latest.filter((item) => !item.isCompleted()).length > 1)
        throw new Error('Завершите незаконченные сессии в «Рабочем времени».');
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
      if (session && session.id.toString() !== display.sessionId)
        throw new Error(
          'У действия уже есть рабочая сессия. Завершите её в «Рабочем времени», чтобы начать фокус.',
        );
      await desktopWindow?.setActive(true);
      try {
        if (session?.isPaused())
          session = await service.resume(session.id.toString(), session.version);
        else if (!session) session = await service.start(display.actionId, 'focus');
        if (selection?.morningDateKey && selection.actionId === display.actionId) {
          const dateKey = selection.morningDateKey;
          const previous = readMorningFocusLedger(window.localStorage, dateKey, display.actionId);
          const next = recordMorningFocusSession(previous, dateKey, session, new Date());
          window.localStorage.setItem(
            morningFocusStorageKey(dateKey, display.actionId),
            JSON.stringify(next),
          );
        }
        setSnapshot(
          startPomodoroPhase(
            display,
            session.isRunning() && display.phase === 'ready'
              ? session.startedAt.getTime()
              : (session.pauseIntervals.at(-1)?.endedAt.getTime() ?? Date.now()),
            session.id.toString(),
          ),
        );
      } catch (reason: unknown) {
        await desktopWindow?.setActive(snapshot?.phase === 'focus' || snapshot?.phase === 'paused');
        throw reason;
      }
    });
  };
  const pause = (target = display) => {
    const display = target;
    if (!display || !service) return;
    void command(async () => {
      const session = await findSession(display);
      if (!session?.isRunning()) throw new Error('Рабочая сессия изменилась. Обновите фокус.');
      const paused = await service.pause(session.id.toString(), session.version);
      setSnapshot(pausePomodoro(display, paused.pausedAt?.getTime() ?? Date.now()));
    });
  };
  const finish = (target = display) => {
    const display = target;
    if (!display || !service) return;
    if (snapshot && display.actionId !== snapshot.actionId) return;
    void command(async () => {
      const session = await findSession(display);
      if (session) await service.finish(session.id.toString(), session.version, true);
      setSnapshot(null);
      setOpen(false);
      onCloseSelection();
      try {
        await desktopWindow?.setActive(false);
      } catch (reason: unknown) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Фокус сохранён. Не удалось восстановить окно; нажмите «Открыть LifeOS».',
        );
      }
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
        if (session.isPaused()) {
          setSnapshot(pausePomodoro(snapshot, session.pausedAt!.getTime()));
          return;
        }
        if (session.isRunning())
          await service.finishAtDeadline(
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
    if (busy || working.current || workTime.busy || !snapshot || workTime.sessions === null) return;
    if (!snapshot.sessionId) return;
    const session = workTime.sessions.find((item) => item.id.toString() === snapshot.sessionId);
    if (!session) return;
    const next = session.isCompleted()
      ? null
      : snapshot.phase === 'focus' && session.isPaused()
        ? pausePomodoro(snapshot, session.pausedAt?.getTime() ?? now)
        : snapshot.phase === 'paused' && session.isRunning()
          ? startPomodoroPhase(snapshot, session.pauseIntervals.at(-1)?.endedAt.getTime() ?? now)
          : snapshot;
    if (next !== snapshot)
      queueMicrotask(() => setSnapshot((current) => (current === snapshot ? next : current)));
  }, [workTime.sessions, workTime.busy, busy, snapshot, now]);

  const close = () => {
    setOpen(false);
    onCloseSelection();
  };
  const remaining = display ? pomodoroRemaining(display, now) : 0;
  const duration =
    display?.phase === 'break'
      ? display.remainingMs
      : (display?.settings.focusMinutes ?? settings.focusMinutes) * 60_000;
  const progress = display ? Math.min(100, Math.max(0, (remaining / duration) * 100)) : 0;
  const phaseLabel =
    display?.phase === 'break'
      ? 'Перерыв'
      : display?.phase === 'paused'
        ? 'Фокус на паузе'
        : 'Фокус';
  const saveSettings = (value: PomodoroSettings): boolean => {
    try {
      const validated = validatePomodoroSettings(value);
      if (!preferences) throw new Error('Настройки фокуса недоступны.');
      preferences.save(validated);
      setSettings(validated);
      setError(null);
      return true;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки.');
      return false;
    }
  };
  return (
    <>
      {native.compact &&
        createPortal(
          <section className="planner-v2 focus-mini" aria-label="Мини-таймер фокуса">
            <header
              onMouseDown={(event) => {
                if (
                  event.button === 0 &&
                  !(event.target instanceof Element && event.target.closest('button'))
                )
                  void desktopWindow?.drag().catch(() => {});
              }}
            >
              <span>
                {snapshot?.phase === 'paused'
                  ? 'Фокус на паузе'
                  : snapshot?.phase === 'break'
                    ? 'Перерыв'
                    : 'Фокус'}
              </span>
              <button type="button" onClick={() => void native.restore()}>
                Открыть LifeOS ↗
              </button>
            </header>
            <h2>{snapshot?.title ?? 'Фокус завершён'}</h2>
            <strong role="timer" aria-label="Осталось времени">
              {clockLabel(snapshot ? pomodoroRemaining(snapshot, now) : 0)}
            </strong>
            <div className="focus-mini__controls">
              {snapshot?.phase === 'focus' && (
                <button
                  type="button"
                  className="planner-primary"
                  disabled={busy}
                  onClick={() => pause(snapshot)}
                >
                  Пауза
                </button>
              )}
              {snapshot?.phase === 'paused' && (
                <button
                  type="button"
                  className="planner-primary"
                  disabled={busy}
                  onClick={() => start(snapshot)}
                >
                  Продолжить
                </button>
              )}
              {snapshot && (
                <button type="button" disabled={busy} onClick={() => finish(snapshot)}>
                  Завершить
                </button>
              )}
            </div>
            {(error || native.error) && <p role="alert">{error ?? native.error}</p>}
          </section>,
          document.body,
        )}
      {snapshot && !open && !native.compact && (
        <button type="button" className="action-pomodoro-indicator" onClick={() => setOpen(true)}>
          {snapshot.phase === 'break' ? 'Перерыв' : 'Фокус'} ·{' '}
          {clockLabel(pomodoroRemaining(snapshot, now))} · {snapshot.title}
        </button>
      )}
      {open && display && !native.compact && (
        <PlannerSheet title="Фокус" onClose={close} lockScroll initialFocus={() => heading.current}>
          <section className="action-pomodoro" aria-label="Помодоро по действию">
            <p className="planner-eyebrow">Фокус по действию</p>
            <h2 ref={heading} tabIndex={-1}>
              {display.title}
            </h2>
            <p className="planner-muted">
              {display.settings.focusMinutes} минут работы · {display.settings.shortBreakMinutes}{' '}
              минут перерыв · {display.settings.longBreakMinutes} минут после четырёх фокусов
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
            <PomodoroSettingsForm settings={settings} onSave={saveSettings} />
            {desktopWindow?.available && (
              <p className="planner-muted">
                При сворачивании или закрытии LifeOS активный фокус останется в мини-таймере поверх
                окон.
              </p>
            )}
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
            {(error || workTime.error || native.error) && (
              <div className="planner-error" role="alert">
                <p>{error ?? workTime.error ?? native.error}</p>
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
                  onClick={() => start()}
                >
                  {display.phase === 'paused' ? 'Продолжить фокус' : 'Начать фокус'}
                </button>
              )}
              {display.phase === 'focus' && (
                <button
                  type="button"
                  className="planner-primary"
                  disabled={busy}
                  onClick={() => pause()}
                >
                  Пауза
                </button>
              )}
              {display.phase === 'break' && (
                <p role="status">Перерыв не учитывается как рабочее время.</p>
              )}
              {activeForSelection && (
                <button type="button" disabled={busy} onClick={() => finish()}>
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
