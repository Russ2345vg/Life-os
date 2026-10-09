import { useEffect, useRef, useState } from 'react';
import type {
  GetPlannerToday,
  PlannerTodayOverview,
} from '../../../application/queries/GetPlannerToday';
import type { SetLifeActionPlan } from '../../../application/commands/SetLifeActionPlan';
import { DayDate } from '../../../domain';
import { addDays } from '../../../domain/planner/PlanningPeriod';
import { planPlannerAction } from '../plannerTodayCommands';

export interface DiaryTomorrowTransferServices {
  readonly getPlannerToday: Pick<GetPlannerToday, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute'>;
}

export function DiaryTomorrowTransfer({
  date,
  services,
}: {
  readonly date: string;
  readonly services: DiaryTomorrowTransferServices;
}) {
  const [overview, setOverview] = useState<PlannerTodayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const tomorrow = addDays(date, 1);

  useEffect(() => {
    let active = true;
    void services.getPlannerToday
      .execute(DayDate.create(date))
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить действия.');
      });
    return () => {
      active = false;
    };
  }, [date, services.getPlannerToday]);

  const refresh = async () => {
    const result = await services.getPlannerToday.execute(DayDate.create(date));
    setOverview(result);
    setError(null);
  };
  const transfer = async (id: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await planPlannerAction(services.setLifeActionPlan, id, tomorrow, false, ['draft', 'ready']);
      await refresh();
      setMessage('Действие перенесено на завтра.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось перенести действие.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const actions = overview ? [...(overview.main ? [overview.main] : []), ...overview.actions] : [];

  return (
    <section
      className="planner-diary-card planner-diary-tomorrow"
      aria-label="Незавершённые действия"
    >
      <h2>Что перенести на завтра?</h2>
      <p>Выберите дела, которые хотите продолжить {tomorrow}. Остальные останутся в плане дня.</p>
      {error && (
        <p className="planner-error" role="alert">
          {error}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void refresh().catch((reason: unknown) =>
                setError(
                  reason instanceof Error ? reason.message : 'Не удалось загрузить действия.',
                ),
              )
            }
          >
            Повторить загрузку
          </button>
        </p>
      )}
      {overview === null ? (
        <p>Загружаем действия…</p>
      ) : actions.length === 0 ? (
        <p>Незавершённых действий на этот день нет.</p>
      ) : (
        <ul>
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
                  onClick={() => void transfer(action.id.toString())}
                >
                  Перенести на завтра
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
