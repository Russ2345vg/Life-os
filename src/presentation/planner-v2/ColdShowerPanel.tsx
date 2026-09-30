import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColdShowerService } from '../../application/sleep/ColdShowerService';
import {
  summarizeColdShowers,
  type ColdShowerEntry,
  type ColdShowerInput,
  type ColdShowerFeeling,
  type ColdShowerSkipReason,
} from '../../domain/sleep/ColdShower';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import { useQuickAccessGuard } from './QuickAccessContext';
import './cold-shower.css';

const feelings: Record<ColdShowerFeeling, string> = {
  better: 'Лучше',
  unchanged: 'Без изменений',
  worse: 'Хуже',
};
const reasons: Record<ColdShowerSkipReason, string> = {
  forgot: 'Забыл',
  time: 'Не хватило времени',
  unwell: 'Плохо себя чувствовал',
  other: 'Другое',
};

export function ColdShowerPanel({
  service,
  today,
}: {
  readonly service: ColdShowerService;
  readonly today: string;
}) {
  const [entries, setEntries] = useState<readonly ColdShowerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const load = useCallback(() => {
    if (working.current) return;
    const request = ++generation.current;
    void service
      .getEntries()
      .then((next) => {
        if (alive.current && generation.current === request) {
          setEntries(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (alive.current && generation.current === request)
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить отметки душа.');
      });
  }, [service]);
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  useSyncContentChanged('sleepSchedules', load);
  const run = async (command: () => Promise<readonly ColdShowerEntry[]>) => {
    if (working.current) return;
    working.current = true;
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      const next = await command();
      if (alive.current) setEntries(next);
    } catch (reason: unknown) {
      if (alive.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось сохранить отметку. Повторите действие.',
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <ColdShowerView
      today={today}
      entries={entries}
      busy={busy}
      error={error}
      onRetry={load}
      onRecord={(input) => {
        void run(() => service.record(input));
      }}
      onRemove={(date) => {
        void run(() => service.remove(date));
      }}
    />
  );
}

export function ColdShowerView({
  today,
  entries,
  busy,
  error,
  onRecord,
  onRemove,
  onRetry,
}: {
  readonly today: string;
  readonly entries: readonly ColdShowerEntry[] | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onRecord: (input: ColdShowerInput) => void;
  readonly onRemove: (date: string) => void;
  readonly onRetry: () => void;
}) {
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const selected = entries?.find((entry) => entry.date === date);
  const stats = summarizeColdShowers(entries ?? [], today, month);
  useQuickAccessGuard(() => ({ dirty: false, busy }));
  const select = (nextDate: string) => {
    setDate(nextDate);
    setMonth(nextDate.slice(0, 7));
  };
  const monthStart = new Date(`${month}-01T12:00:00Z`);
  const weekday = monthStart.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const monthDays = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const changeMonth = (delta: number) => {
    const next = new Date(monthStart);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
  };
  return (
    <section className="cold-shower" aria-labelledby="cold-shower-title" aria-busy={busy}>
      <div className="cold-shower__header">
        <div>
          <h2 id="cold-shower-title">Холодный душ</h2>
          <p className="planner-muted">Утром, после воды и отключения будильника в ванной</p>
        </div>
        <span className="cold-shower__date">{date === today ? 'Сегодня' : formatDate(date)}</span>
      </div>
      {error && (
        <p className="planner-error" role="alert">
          {error}
        </p>
      )}
      {entries === null ? (
        <div>
          <p role="status">{error ? 'Отметки пока недоступны.' : 'Загружаем отметки душа…'}</p>
          {error && (
            <button type="button" onClick={onRetry}>
              Повторить загрузку
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="cold-shower__actions">
            <span
              role="status"
              className={
                selected?.status === 'completed' ? 'cold-shower__success' : 'planner-muted'
              }
            >
              {selected?.status === 'completed'
                ? '✓ Душ отмечен'
                : selected?.status === 'skipped'
                  ? 'Пропуск отмечен'
                  : 'Нет отметки'}
            </span>
            {selected?.status !== 'completed' && (
              <button
                className="planner-primary"
                type="button"
                disabled={busy}
                onClick={() => onRecord({ date, status: 'completed' })}
              >
                Принял душ
              </button>
            )}
            {selected === undefined && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRecord({ date, status: 'skipped' })}
              >
                Пропустил
              </button>
            )}
            {date !== today && (
              <button type="button" disabled={busy} onClick={() => select(today)}>
                К сегодня
              </button>
            )}
          </div>
          {selected && (
            <AssessmentForm
              key={`${date}:${selected.status}:${selected.energy}:${selected.feeling}:${selected.skipReason}:${selected.updatedAt.toISOString()}`}
              entry={selected}
              busy={busy}
              onRecord={onRecord}
            />
          )}
          {selected && (
            <details className="cold-shower__correction">
              <summary>Изменить отметку</summary>
              <div className="cold-shower__actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onRecord({
                      date,
                      status: selected.status === 'completed' ? 'skipped' : 'completed',
                    })
                  }
                >
                  {selected.status === 'completed' ? 'Отметить пропуск' : 'Отметить выполнение'}
                </button>
                <button type="button" disabled={busy} onClick={() => onRemove(date)}>
                  Убрать отметку
                </button>
              </div>
            </details>
          )}
          <details className="cold-shower__history">
            <summary>
              Регулярность и история{' '}
              <span className="planner-muted">{stats.weeklyCompleted} за неделю</span>
            </summary>
            <dl className="cold-shower__stats">
              <div>
                <dt>За неделю</dt>
                <dd>{stats.weeklyCompleted}</dd>
              </div>
              <div>
                <dt>За месяц</dt>
                <dd>{stats.monthlyCompleted}</dd>
              </div>
              <div>
                <dt>Всего</dt>
                <dd>{stats.totalCompleted}</dd>
              </div>
            </dl>
            <div className="cold-shower__month">
              <button
                type="button"
                aria-label="Предыдущий месяц"
                disabled={busy}
                onClick={() => changeMonth(-1)}
              >
                ←
              </button>
              <strong>
                {new Intl.DateTimeFormat('ru-RU', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(monthStart)}
              </strong>
              <button
                type="button"
                aria-label="Следующий месяц"
                disabled={busy || month >= today.slice(0, 7)}
                onClick={() => changeMonth(1)}
              >
                →
              </button>
            </div>
            <div
              className="cold-shower__calendar"
              role="group"
              aria-label="Календарь холодного душа"
            >
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                <span key={day} aria-hidden="true">
                  {day}
                </span>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {Array.from({ length: monthDays }, (_, index) => {
                const day = `${month}-${String(index + 1).padStart(2, '0')}`;
                const entry = entries.find((entry) => entry.date === day);
                const label =
                  entry?.status === 'completed'
                    ? 'Выполнено'
                    : entry?.status === 'skipped'
                      ? 'Пропущено'
                      : 'Нет отметки';
                return (
                  <button
                    key={day}
                    type="button"
                    className={`cold-shower__day${entry ? ` cold-shower__day--${entry.status}` : ''}`}
                    aria-label={`${day}: ${label}`}
                    disabled={busy || day > today}
                    aria-pressed={date === day}
                    onClick={() => select(day)}
                  >
                    <span>{index + 1}</span>
                    <small aria-hidden="true">
                      {entry?.status === 'completed'
                        ? '✓'
                        : entry?.status === 'skipped'
                          ? '−'
                          : '·'}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="planner-muted">✓ выполнено · − пропущено · точка — нет отметки</p>
            <p className="planner-muted">
              {stats.averageEnergy === null
                ? 'Оценок бодрости за этот месяц пока нет.'
                : `Бодрость за месяц: ${stats.averageEnergy.toFixed(1)} из 5 · оценок: ${stats.ratedCount}`}
            </p>
            <ul className="cold-shower__entries">
              {entries
                .filter((entry) => entry.date.startsWith(`${month}-`))
                .map((entry) => (
                  <li key={entry.date}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => select(entry.date)}
                      aria-label={`Изменить день ${entry.date}`}
                    >
                      <span>{formatDate(entry.date)}</span>
                      <span>{entry.status === 'completed' ? 'Выполнено' : 'Пропущено'}</span>
                      <small>
                        {entry.status === 'completed'
                          ? [
                              entry.energy === null ? null : `Бодрость ${entry.energy}/5`,
                              entry.feeling === null ? null : feelings[entry.feeling],
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Без оценки'
                          : entry.skipReason === null
                            ? 'Без причины'
                            : reasons[entry.skipReason]}
                      </small>
                    </button>
                  </li>
                ))}
            </ul>
            {!entries.some((entry) => entry.date.startsWith(`${month}-`)) && (
              <p className="planner-muted">
                В этом месяце пока нет отметок. Выберите прошедший день в календаре, чтобы добавить
                запись.
              </p>
            )}
          </details>
        </>
      )}
    </section>
  );
}

function AssessmentForm({
  entry,
  busy,
  onRecord,
}: {
  readonly entry: ColdShowerEntry;
  readonly busy: boolean;
  readonly onRecord: (input: ColdShowerInput) => void;
}) {
  const [energy, setEnergy] = useState(entry.energy?.toString() ?? '');
  const [feeling, setFeeling] = useState<ColdShowerFeeling | ''>(entry.feeling ?? '');
  const [reason, setReason] = useState<ColdShowerSkipReason | ''>(entry.skipReason ?? '');
  useQuickAccessGuard(() => ({
    busy,
    dirty:
      energy !== (entry.energy?.toString() ?? '') ||
      feeling !== (entry.feeling ?? '') ||
      reason !== (entry.skipReason ?? ''),
  }));
  return (
    <details className="cold-shower__assessment">
      <summary>
        {entry.status === 'completed' ? 'Оценить самочувствие' : 'Указать причину пропуска'}{' '}
        <span className="planner-muted">необязательно</span>
      </summary>
      <form
        aria-label={
          entry.status === 'completed' ? 'Самочувствие после душа' : 'Причина пропуска душа'
        }
        onSubmit={(event) => {
          event.preventDefault();
          onRecord(
            entry.status === 'completed'
              ? {
                  date: entry.date,
                  status: 'completed',
                  energy: energy ? Number(energy) : null,
                  feeling: feeling || null,
                }
              : { date: entry.date, status: 'skipped', skipReason: reason || null },
          );
        }}
      >
        {entry.status === 'completed' ? (
          <>
            <label>
              <span>Бодрость после душа</span>
              <select
                value={energy}
                disabled={busy}
                onChange={(event) => setEnergy(event.target.value)}
              >
                <option value="">Без оценки</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} из 5
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Ощущение после душа</span>
              <select
                value={feeling}
                disabled={busy}
                onChange={(event) => setFeeling(event.target.value as ColdShowerFeeling | '')}
              >
                <option value="">Без оценки</option>
                {Object.entries(feelings).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label>
            <span>Почему пропустил</span>
            <select
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value as ColdShowerSkipReason | '')}
            >
              <option value="">Без причины</option>
              {Object.entries(reasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" disabled={busy}>
          Сохранить {entry.status === 'completed' ? 'самочувствие' : 'причину'}
        </button>
      </form>
    </details>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
