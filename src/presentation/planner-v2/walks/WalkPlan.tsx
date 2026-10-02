import { useCallback, useEffect, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { LifeAction } from '../../../domain/life-action/LifeAction';
import type { PlannerRoute } from '../PlannerNavigation';
import { useWalkMutation, walkError } from './useWalkState';
import { WalkPreferencesView } from './WalkPreferences';

export function WalkPlan({
  services,
  today,
  onNavigate,
}: {
  services: WalkServices;
  today: string;
  onNavigate: (route: PlannerRoute) => void;
}) {
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState('');
  const [recurrence, setRecurrence] = useState<'once' | 'daily' | 'weekdays'>('once');
  const [plans, setPlans] = useState<readonly LifeAction[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const mutation = useWalkMutation();
  const refresh = useCallback(() => {
    void services.planning
      .list()
      .then((items) => {
        setPlans(items);
        setError('');
      })
      .catch((failure: unknown) => setError(walkError(failure)))
      .finally(() => setLoading(false));
  }, [services]);
  useEffect(() => {
    refresh();
    return services.changes.subscribe(refresh);
  }, [refresh, services]);

  const plan = () => {
    const targetMinutes = minutes === '' ? null : Number(minutes);
    if (
      targetMinutes !== null &&
      (!Number.isInteger(targetMinutes) || targetMinutes < 1 || targetMinutes > 1440)
    ) {
      setError('Укажите целое число минут от 1 до 1440.');
      return;
    }
    void mutation.perform(
      `plan:${date}:${targetMinutes}:${recurrence}`,
      (requestId) => services.planning.plan({ requestId, date, targetMinutes, recurrence }),
      () => refresh(),
    );
  };

  return (
    <div className="walk-plan-layout">
      <section className="walk-panel">
        <span className="walk-label">Своя регулярность</span>
        <h2>Запланировать прогулку</h2>
        <p>
          План появится среди действий на выбранный день. После прогулки действие можно завершить
          отдельно.
        </p>
        <form
          className="walk-form"
          onSubmit={(event) => {
            event.preventDefault();
            plan();
          }}
        >
          <label>
            Дата
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Ориентир по времени, минуты — необязательно
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <label>
            Повторять
            <select
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}
            >
              <option value="once">Один раз</option>
              <option value="daily">Каждый день</option>
              <option value="weekdays">По будням</option>
            </select>
          </label>
          {(error || mutation.error) && <p role="alert">{error || mutation.error}</p>}
          <button className="planner-primary" disabled={mutation.busy}>
            Добавить в план
          </button>
        </form>
      </section>
      <section className="walk-panel">
        <h2>Ближайшие планы</h2>
        {loading ? (
          <p role="status">Загружаем планы…</p>
        ) : plans.length === 0 ? (
          <p>Пока нет запланированных прогулок.</p>
        ) : (
          <div className="walk-plan-list">
            {plans.map((action) => (
              <article key={action.id.toString()}>
                <div>
                  <strong>{action.title.toString()}</strong>
                  <small>
                    {action.plannedDate?.toString() ?? 'Дата не указана'}
                    {action.walkPlan?.targetMinutes
                      ? ` · ${action.walkPlan.targetMinutes} мин`
                      : ''}
                  </small>
                </div>
                <div className="walk-plan-actions">
                  <button
                    disabled={mutation.busy}
                    onClick={() =>
                      void mutation.perform(
                        `startPlanned:${action.id}`,
                        (requestId) =>
                          services.planning.startPlanned({
                            actionId: action.id.toString(),
                            requestId,
                          }),
                        (walk) => onNavigate({ view: 'walks', id: walk.id.toString() }),
                      )
                    }
                  >
                    Начать
                  </button>
                  <button onClick={() => onNavigate({ view: 'action', id: action.id.toString() })}>
                    Открыть действие
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <WalkPreferencesView services={services} today={today} />
    </div>
  );
}
