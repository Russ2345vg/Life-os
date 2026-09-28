import { useRef } from 'react';
import type { WeeklyGoalReview } from '../../application/queries/GetWeeklyGoalReview';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { PlannerOverdueActions } from './PlannerOverdueActions';
import { PlanningProgress } from './PlanningProgress';
import './weekly-review.css';
import { WeeklyGoalNextStep } from './WeeklyGoalNextStep';

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );
const sourceLabels = {
  manual: 'Ручная запись',
  completion: 'Выполнение',
  backfill: 'Запись задним числом',
  initial: 'Начальное значение',
};

export function PlannerWeeklyReview({
  review,
  today,
  busy,
  onWeek,
  onOpenGoal,
  onOpenAction,
  onPlan,
  onSelectStep,
  onCreateStep,
}: {
  readonly review: WeeklyGoalReview;
  readonly today: string;
  readonly busy: boolean;
  readonly onWeek: (date: string) => void;
  readonly onOpenGoal: (id: string) => void;
  readonly onOpenAction: (id: string) => void;
  readonly onPlan: (id: string, date: string) => Promise<void>;
  readonly onSelectStep: (goalId: string, actionId: string) => Promise<void>;
  readonly onCreateStep: (goalId: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const uncertain = review.goals.filter(
    (row) => row.pending > 0 || row.progress?.complete === false,
  ).length;
  return (
    <div className="planner-weekly-review">
      <div className="planner-inline-actions weekly-period" role="group" aria-label="Неделя обзора">
        <button
          type="button"
          disabled={busy}
          aria-label="Предыдущая неделя"
          onClick={() => onWeek(addDays(review.week.startDate, -7))}
        >
          ←
        </button>
        <strong>
          {formatDate(review.week.startDate)} — {formatDate(review.week.endDate)}
        </strong>
        <button
          type="button"
          disabled={busy || review.current}
          aria-label="Следующая неделя"
          onClick={() => onWeek(addDays(review.week.startDate, 7))}
        >
          →
        </button>
        <span className="planner-muted">
          {review.current ? 'Неделя ещё идёт' : 'Завершённая неделя'}
        </span>
      </div>
      <section className="weekly-summary" aria-labelledby="weekly-summary-title">
        <h2 id="weekly-summary-title" ref={heading} tabIndex={-1}>
          Итоги недели
        </h2>
        <p className="planner-muted">Завершённые дела и записи результата считаются отдельно.</p>
        <dl className="weekly-stats">
          <div>
            <dt>Дел завершено за неделю</dt>
            <dd>{review.completed.length}</dd>
          </div>
          <div>
            <dt>Целей с записями результата</dt>
            <dd>{review.withRecords}</dd>
          </div>
          <div>
            <dt>Целей без записей результата</dt>
            <dd>{review.withoutRecords}</dd>
          </div>
        </dl>
        {uncertain > 0 && (
          <p className="planner-muted">
            Целей с неполными или неуказанными результатами: {uncertain}. Они не включены в число
            целей без записей.
          </p>
        )}
        <details className="planner-details">
          <summary>Завершённые дела · {review.completed.length}</summary>
          {review.completed.length ? (
            <ul>
              {review.completed.map((action) => (
                <li key={action.id.toString()}>
                  <button type="button" onClick={() => onOpenAction(action.id.toString())}>
                    {action.title.toString()}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="planner-empty">За эту неделю нет сохранённых завершений.</p>
          )}
        </details>
      </section>
      <div className="weekly-grid">
        <section className="weekly-goals" aria-labelledby="weekly-goals-title">
          <h2 id="weekly-goals-title">Результаты по целям</h2>
          <p className="planner-muted">
            Активные цели сейчас · {review.goals.length}. Состав целей не является историческим
            снимком.
          </p>
          {!review.goals.length && (
            <p className="planner-empty">Активных целей пока нет. Создайте цель кнопкой выше.</p>
          )}
          {review.goals.map(
            ({
              goal,
              progress,
              recordCount,
              pending,
              weeklyAmount,
              records,
              completedCount,
              openActions,
              nextAction,
            }) => (
              <article className="weekly-goal" key={goal.id.toString()}>
                <h3>
                  <button
                    type="button"
                    className="planner-action-title"
                    onClick={() => onOpenGoal(goal.id.toString())}
                  >
                    {goal.title}
                  </button>
                </h3>
                {goal.measurement ? (
                  <>
                    <p className="planner-muted">
                      Результат сейчас
                      {progress?.cycle
                        ? ` · цикл ${formatDate(progress.cycle.startDate)} — ${formatDate(progress.cycle.endDate)}`
                        : ''}
                    </p>
                    <PlanningProgress goal={goal} date={today} />
                  </>
                ) : (
                  <p className="planner-muted">Без измерения · числовой результат не настроен</p>
                )}
                {progress?.complete === false ? (
                  <p role="status">Данные прогресса ещё неполные</p>
                ) : (
                  <>
                    {recordCount ? (
                      <p>
                        {goal.measurement
                          ? `Учтённое изменение за неделю: ${weeklyAmount.toLocaleString('ru-RU')} ${goal.measurement.unit}`
                          : `Записей результата за неделю: ${recordCount}`}
                      </p>
                    ) : (
                      !pending && <p className="planner-muted">За неделю нет записей результата</p>
                    )}
                  </>
                )}
                {pending > 0 && (
                  <p>Есть неуказанные результаты · {pending}. Откройте цель для ввода.</p>
                )}
                <p className="planner-muted">
                  Выполнено связанных действий: {completedCount}. Это не процент готовности цели.
                </p>
                {records.length > 0 && (
                  <details className="planner-details">
                    <summary>Посмотреть записи · {records.length}</summary>
                    <ul>
                      {records.map((record) => (
                        <li key={record.id}>
                          {formatDate(record.effectiveDate)} · {sourceLabels[record.source]} ·{' '}
                          {record.amount === null
                            ? 'Результат не указан'
                            : record.amount.toLocaleString('ru-RU')}
                          <p className="planner-muted">
                            {record.reason} · обновлено {formatDate(record.updatedAt.slice(0, 10))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <WeeklyGoalNextStep
                  goal={goal}
                  actions={openActions}
                  next={nextAction}
                  today={today}
                  busy={busy}
                  onSelect={onSelectStep}
                  onPlan={onPlan}
                  onCreate={onCreateStep}
                />
                <button type="button" onClick={() => onOpenGoal(goal.id.toString())}>
                  Открыть цель
                </button>
              </article>
            ),
          )}
        </section>
        <section className="weekly-next" aria-labelledby="weekly-next-title">
          <p className="planner-eyebrow">
            Следующая неделя · с {formatDate(addDays(review.week.startDate, 7))}
          </p>
          <h2 id="weekly-next-title">С чего начать</h2>
          <p className="planner-muted">
            Выберите дату для незавершённого дела. Главное действие выбирается для конкретного дня.
          </p>
          <PlannerOverdueActions
            title="Что продолжить"
            headingId="weekly-unfinished-title"
            description="Выберите конкретную дату. Перенос не заменит главное дело на новой дате."
            actions={review.unfinished}
            today={today}
            busy={busy}
            onReschedule={onPlan}
            onListResolved={() => heading.current?.focus()}
            renderAction={(action, controls) => (
              <li key={action.id.toString()}>
                <button
                  className="planner-action-title planner-action-open"
                  type="button"
                  onClick={() => onOpenAction(action.id.toString())}
                >
                  {action.title.toString()}
                </button>
                {controls}
              </li>
            )}
          />
          {!review.unfinished.length && (
            <p className="planner-empty">
              Незавершённых дел выбранной недели нет. Следующий шаг можно выбрать в блоке цели.
            </p>
          )}
        </section>
      </div>
      <p className="planner-muted">
        Обзор пересчитывается по текущим сохранённым данным. Переносы и изменения результатов
        происходят только по вашему выбору.
      </p>
    </div>
  );
}
