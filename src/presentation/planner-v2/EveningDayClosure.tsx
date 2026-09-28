import { useEffect, useRef, useState } from 'react';
import type {
  GetPlannerToday,
  PlannerTodayOverview,
} from '../../application/queries/GetPlannerToday';
import type { SetLifeActionPlan } from '../../application/commands/SetLifeActionPlan';
import type { PlannerInbox } from '../../application/planner/PlannerInbox';
import { DayDate } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { planPlannerAction } from './plannerTodayCommands';
import { useQuickAccess, useQuickAccessGuard } from './QuickAccessContext';
import { useSyncStatus } from '../sync/SyncStatusContext';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';

export interface EveningPlannerServices {
  readonly getPlannerToday: Pick<GetPlannerToday, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute'>;
  readonly plannerInbox: Pick<PlannerInbox, 'capture'>;
}

export function EveningDayClosure({
  services,
  cycleDate,
  calendarDate,
}: {
  readonly services: EveningPlannerServices;
  readonly cycleDate: string;
  readonly calendarDate: string;
}) {
  const [today, setToday] = useState<PlannerTodayOverview | null>(null);
  const [tomorrow, setTomorrow] = useState<PlannerTodayOverview | null>(null);
  const [thought, setThought] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  const nextDate = addDays(cycleDate, 1);
  const revision = useQuickAccess()?.revision;
  const syncData = useSyncStatus().data;
  useQuickAccessGuard(() => ({ dirty: thought.trim().length > 0, busy }));
  useEffect(() => {
    let active = true;
    void Promise.all([
      services.getPlannerToday.execute(DayDate.create(cycleDate)),
      services.getPlannerToday.execute(DayDate.create(nextDate)),
    ])
      .then(([current, next]) => {
        if (active) {
          setToday(current);
          setTomorrow(next);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить дела.');
      });
    return () => {
      active = false;
    };
  }, [services, cycleDate, nextDate, revision, syncData]);
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setStatus('');
    try {
      await work();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить. Повторите действие.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    const [current, next] = await Promise.all([
      services.getPlannerToday.execute(DayDate.create(cycleDate)),
      services.getPlannerToday.execute(DayDate.create(nextDate)),
    ]);
    setToday(current);
    setTomorrow(next);
  };
  const actions = today ? [...(today.main ? [today.main] : []), ...today.actions] : [];
  const nextActions = tomorrow
    ? [...(tomorrow.main ? [tomorrow.main] : []), ...tomorrow.actions]
    : [];
  return (
    <details className="sleep-day-closure">
      <summary>Закрыть день</summary>
      <p>
        Дела за {cycleDate} · Завтра {nextDate}. Разбери только то, что важно сейчас.
      </p>
      {error ? (
        <p className="planner-error" role="alert">
          {error}{' '}
          <button type="button" disabled={busy} onClick={() => void run(refresh)}>
            Повторить загрузку
          </button>
        </p>
      ) : null}
      <h3>Осталось сегодня</h3>
      {today === null ? (
        <p>Загружаем дела…</p>
      ) : actions.length === 0 ? (
        <p>На этот день незавершённых дел нет.</p>
      ) : (
        <ul className="sleep-closure-list">
          {actions.map((action) => (
            <li key={action.id.toString()}>
              <span>{action.title.toString()}</span>
              {action.status === 'in_progress' ? (
                <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
                  Открыть действие
                </a>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await planPlannerAction(
                        services.setLifeActionPlan,
                        action.id.toString(),
                        nextDate,
                        false,
                        ['draft', 'ready'],
                      );
                      setStatus('Дело перенесено на завтра.');
                      await refresh();
                    })
                  }
                >
                  На завтра
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const text = thought.trim();
            await services.plannerInbox.capture({
              title: text.slice(0, 200),
              ...(text.length > 200 ? { note: text } : {}),
            });
            setThought('');
            setStatus('Мысль сохранена во входящие.');
          });
        }}
      >
        <label htmlFor="evening-thought">Что осталось в голове?</label>
        <VoiceTextArea
          id="evening-thought"
          value={thought}
          onValueChange={setThought}
          disabled={busy}
          maxLength={500}
        />
        <button type="submit" disabled={busy || !thought.trim()}>
          Во входящие
        </button>
      </form>
      <h3>Главное на завтра</h3>
      {tomorrow === null ? (
        <p>Загружаем план…</p>
      ) : (
        <>
          <p>
            {tomorrow.main
              ? `Сейчас главное: ${tomorrow.main.title.toString()}`
              : 'Главное пока не выбрано.'}
          </p>
          {nextActions.filter(
            (action) => !action.isNext && (action.status === 'draft' || action.status === 'ready'),
          ).length === 0 ? (
            <a href={nextDate === calendarDate ? '#/v2/today' : '#/v2/today?day=tomorrow'}>
              Открыть план на завтра
            </a>
          ) : (
            <ul className="sleep-closure-list">
              {nextActions
                .filter(
                  (action) =>
                    !action.isNext && (action.status === 'draft' || action.status === 'ready'),
                )
                .map((action) => (
                  <li key={action.id.toString()}>
                    <span>{action.title.toString()}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await planPlannerAction(
                            services.setLifeActionPlan,
                            action.id.toString(),
                            nextDate,
                            true,
                            ['draft', 'ready'],
                          );
                          setStatus('Главное на завтра выбрано.');
                          await refresh();
                        })
                      }
                    >
                      {tomorrow.main ? 'Заменить главное' : 'Сделать главным'}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </details>
  );
}
