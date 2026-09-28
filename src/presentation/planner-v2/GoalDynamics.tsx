import type { GoalDynamicsModel } from '../../application/queries/GetGoalDynamics';
import { addDays } from '../../domain/planner/PlanningPeriod';
import './goal-dynamics.css';

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );
const amountText = (amount: number) => `${amount > 0 ? '+' : ''}${amount.toLocaleString('ru-RU')}`;
const sources = {
  manual: 'Ручная запись',
  completion: 'Выполнение действия',
  backfill: 'Запись задним числом',
  initial: 'Начальное значение',
};

export function GoalDynamics({ model }: { readonly model: GoalDynamicsModel }) {
  const knownDays = model.days.filter((day) => day.amount !== null);
  return (
    <section className="goal-dynamics" aria-label="Динамика цели">
      <h2>Динамика цели</h2>
      <p>{model.measured ? 'Записанные изменения за 30 дней' : 'Выполненные шаги за 30 дней'}</p>
      <p className="planner-muted">
        {formatDate(model.startDate)} — {formatDate(model.endDate)}
      </p>
      {model.incomplete && (
        <p role="status">Часть данных пока недоступна. Показаны сохранённые записи.</p>
      )}
      {model.measured && (
        <>
          <p className="planner-muted">
            Текущая единица: {model.unit}. Показаны изменения, а не прошлые значения цели. Знак
            изменения не оценивает результат.
          </p>
          {model.pending > 0 && (
            <p role="status">
              Неуказанных результатов: {model.pending}. Такие даты не показаны полным столбцом.
            </p>
          )}
          {knownDays.length > 0 ? (
            <RecordedChangesChart model={model} />
          ) : (
            <p className="planner-empty">За этот период нет полностью указанных изменений.</p>
          )}
          <p className="planner-muted">
            Нет столбца — нет полностью указанного результата. Нулевой результат отмечен точкой.
          </p>
        </>
      )}
      {!model.days.length ? (
        <p className="planner-empty">Нет записей и выполнений за этот период.</p>
      ) : (
        <details className="planner-details goal-dynamics-events">
          <summary>Записи и выполнения · {model.recordCount + model.completionCount}</summary>
          {[...model.days].reverse().map((day) => (
            <div className="goal-dynamics-day" key={day.date}>
              <h3>
                <time dateTime={day.date}>{formatDate(day.date)}</time>
              </h3>
              {model.measured && day.records.length > 0 && (
                <p>
                  {day.amount === null
                    ? day.records.some(({ fact }) => fact.amount !== null)
                      ? `Результат дня не полностью указан · известные изменения: ${amountText(day.knownAmount)} ${model.unit}`
                      : 'Результат дня не указан'
                    : `Изменение: ${amountText(day.amount)} ${model.unit}`}
                </p>
              )}
              {day.records.map(({ fact, action }) => (
                <details className="goal-dynamics-record" key={fact.id}>
                  <summary>
                    {fact.reason} ·{' '}
                    {fact.amount === null ? 'Результат не указан' : amountText(fact.amount)}
                  </summary>
                  <p>{sources[fact.source]}</p>
                  <p>Дата результата: {formatDate(fact.effectiveDate)}</p>
                  <p className="planner-muted">
                    Обновлено:{' '}
                    {new Intl.DateTimeFormat('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(fact.updatedAt))}
                  </p>
                  {action && !action.isDeleted() ? (
                    <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
                      Открыть исходное действие
                    </a>
                  ) : fact.actionId ? (
                    <p className="planner-muted">Исходное действие недоступно.</p>
                  ) : null}
                </details>
              ))}
              {day.completed.length > 0 && (
                <ul className="goal-dynamics-completions">
                  {day.completed.map((action) => (
                    <li key={action.id.toString()}>
                      <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
                        {action.title.toString()}
                      </a>
                      {action.actualResult && (
                        <p className="planner-muted">{action.actualResult.toString()}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="planner-muted">
            Выполнение связанного дела само по себе не означает числовой вклад в цель.
          </p>
        </details>
      )}
    </section>
  );
}

function RecordedChangesChart({ model }: { readonly model: GoalDynamicsModel }) {
  const points = model.days.filter((day) => day.amount !== null);
  const maximum = Math.max(0, ...points.map((day) => day.amount!));
  const minimum = Math.min(0, ...points.map((day) => day.amount!));
  const y = (value: number) =>
    maximum === minimum ? 80 : 16 + ((maximum - value) / (maximum - minimum)) * 128;
  const baseline = y(0);
  const dates = Array.from({ length: 30 }, (_, index) => addDays(model.startDate, index));
  return (
    <figure className="goal-dynamics-chart">
      <p className="goal-dynamics-scale">
        Диапазон изменений: {amountText(minimum)} … {amountText(maximum)} {model.unit}. Линия —
        ноль.
      </p>
      <svg
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        role="img"
        aria-label="Изменения результата по датам"
      >
        <line x1={0} x2={600} y1={baseline} y2={baseline} className="goal-dynamics-zero" />
        {points.map((day) => {
          const x = 10 + dates.indexOf(day.date) * 20;
          const value = day.amount!;
          const top = Math.min(y(value), baseline);
          return (
            <g key={day.date} data-recorded-date={day.date}>
              <title>
                {formatDate(day.date)}: {amountText(value)} {model.unit}
              </title>
              {value === 0 ? (
                <circle cx={x} cy={baseline} r={3} />
              ) : (
                <rect
                  x={x - 6}
                  y={top}
                  width={12}
                  height={Math.max(1, Math.abs(y(value) - baseline))}
                />
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span>{formatDate(model.startDate)}</span>
        <span>{formatDate(model.endDate)}</span>
      </figcaption>
    </figure>
  );
}
