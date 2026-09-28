import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SleepScheduleState, WakeOccurrence } from '../../domain/sleep/SleepSchedule';
import type { WakeAlarmStatus } from '../../application/sleep/WakeAlarmGateway';
import {
  futureWakeOccurrences,
  isWakeScheduleAcknowledged,
  wakeDateLabel,
  wakeTimeLabel,
} from './wakeManagementModel';
import { useQuickAccessGuard } from './QuickAccessContext';
import './wake-management.css';

export function WakeManagementPanel({
  state,
  status,
  busy,
  onSetNearestTime,
  onClearNearestTime,
  onSkipNearest,
  onEditSettings,
  onSetEnabled,
  children,
}: {
  readonly state: SleepScheduleState;
  readonly status: WakeAlarmStatus;
  readonly busy: boolean;
  readonly onSetNearestTime?: (time: string, id: string) => void | Promise<boolean>;
  readonly onClearNearestTime?: () => void | Promise<boolean>;
  readonly onSkipNearest: (id: string) => void | Promise<boolean>;
  readonly onEditSettings: () => void;
  readonly onSetEnabled?: (enabled: boolean) => void;
  readonly children: ReactNode;
}) {
  const [mode, setMode] = useState<'time' | 'skip' | null>(null);
  const [time, setTime] = useState('');
  const [target, setTarget] = useState<WakeOccurrence | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  useQuickAccessGuard(() => ({ dirty: mode === 'time', busy }));
  useEffect(() => {
    if (mode === 'skip') cancelRef.current?.focus();
    else if (mode === 'time') timeRef.current?.focus();
  }, [mode]);
  const close = () => {
    const previous = mode;
    setMode(null);
    if (previous === 'skip') skipRef.current?.focus();
    else editRef.current?.focus();
  };
  const settings = state.settings;
  if (!settings) return null;
  const now = new Date();
  const future = futureWakeOccurrences(state, now);
  const next = future[0];
  const timeLabel = next ? wakeTimeLabel(next.scheduledAt, settings.timeZone) : settings.wakeTime;
  const once = next && settings.wakeOverride?.cycleDate === next.cycleDate;
  const acknowledged = isWakeScheduleAcknowledged(state, status, now);
  const targetChanged = target !== null && next?.id !== target.id;
  return (
    <section className="sleep-summary-card wake-management" aria-label="Управление подъёмом">
      <div className="wake-management__overview">
        <div>
          <p className="planner-eyebrow">
            {settings.enabled ? 'Ближайший подъём' : 'Будильник выключен'}
          </p>
          <strong className="wake-management__time">{timeLabel}</strong>
          <p className="wake-management__date">
            {next
              ? wakeDateLabel(next.scheduledAt, settings.timeZone)
              : 'Нет запланированного сигнала'}
          </p>
          <p className="wake-management__status">
            {acknowledged
              ? 'Постановка подтверждена Android'
              : settings.enabled
                ? 'Время по вашему расписанию'
                : 'Включите расписание для следующего подъёма'}
          </p>
        </div>
        <div className="wake-management__schedule">
          <span>
            Обычно <strong>{settings.wakeTime}</strong> · сон {settings.bedtime}
          </span>
          <span>{settings.alarmSound.title}</span>
          {once ? (
            <div className="wake-management__once">
              <strong>Разовое время</strong>
              <span>Следующий подъём — {settings.wakeTime}</span>
              <button
                type="button"
                disabled={busy || !onClearNearestTime}
                onClick={onClearNearestTime}
              >
                Отменить разовое время
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="wake-management__actions">
        {settings.enabled ? (
          <>
            <button
              ref={editRef}
              type="button"
              className="planner-primary"
              disabled={busy || !next || !onSetNearestTime}
              onClick={() => {
                setTime(timeLabel);
                setTarget(next ?? null);
                setMode('time');
              }}
            >
              Только ближайший подъём
            </button>
            <button
              ref={skipRef}
              type="button"
              disabled={busy || !next}
              onClick={() => {
                setTarget(next ?? null);
                setMode('skip');
              }}
            >
              Пропустить ближайший
            </button>
          </>
        ) : (
          <button
            className="planner-primary"
            type="button"
            disabled={busy || !onSetEnabled}
            onClick={() => onSetEnabled?.(true)}
          >
            Включить будильник
          </button>
        )}
        <button type="button" disabled={busy} onClick={onEditSettings}>
          Обычное расписание
        </button>
      </div>
      {mode && target ? (
        <div
          className="wake-management__confirmation"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              close();
            }
          }}
        >
          {targetChanged ? (
            <p role="alert">
              Ближайший подъём изменился. Отмените действие и проверьте новую дату.
            </p>
          ) : null}
          {mode === 'time' ? (
            <form
              aria-label="Разовое время подъёма"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  if (targetChanged) return;
                  const success = await onSetNearestTime?.(time, target.id);
                  if (success !== false) close();
                })();
              }}
            >
              <p>
                Изменится только подъём: {wakeDateLabel(target.scheduledAt, settings.timeZone)}.
                Обычное время {settings.wakeTime} сохранится.
              </p>
              <label>
                Разовое время
                <input
                  ref={timeRef}
                  type="time"
                  required
                  value={time}
                  disabled={busy}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
              <div className="wake-management__actions">
                <button type="submit" className="planner-primary" disabled={busy || targetChanged}>
                  Сохранить разовое время
                </button>
                <button type="button" disabled={busy} onClick={close}>
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <div role="group" aria-label="Подтверждение пропуска">
              <p>
                Пропустить {wakeDateLabel(target.scheduledAt, settings.timeZone)} в{' '}
                {wakeTimeLabel(target.scheduledAt, settings.timeZone)}?
              </p>
              <p>
                {future[1]
                  ? `Следующий сигнал: ${wakeDateLabel(future[1].scheduledAt, settings.timeZone)} в ${wakeTimeLabel(future[1].scheduledAt, settings.timeZone)}.`
                  : 'Следующий сигнал появится после обновления расписания.'}
              </p>
              <div className="wake-management__actions">
                <button ref={cancelRef} type="button" disabled={busy} onClick={close}>
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={busy || targetChanged}
                  onClick={() => {
                    void (async () => {
                      if (targetChanged) return;
                      const success = await onSkipNearest(target.id);
                      if (success !== false) close();
                    })();
                  }}
                >
                  Подтвердить пропуск
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {children}
    </section>
  );
}
