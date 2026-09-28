import { useId, useRef, useState } from 'react';
import type { Goal, LifeAction } from '../../domain';

/** All changes go through the existing Goal selection and Action planning commands. */
export function WeeklyGoalNextStep({
  goal,
  actions,
  next,
  today,
  busy,
  onSelect,
  onPlan,
  onCreate,
}: {
  readonly goal: Goal;
  readonly actions: readonly LifeAction[];
  readonly next: LifeAction | null;
  readonly today: string;
  readonly busy: boolean;
  readonly onSelect: (goalId: string, actionId: string) => Promise<void>;
  readonly onPlan: (id: string, date: string) => Promise<void>;
  readonly onCreate: (goalId: string) => void;
}) {
  const selectId = useId();
  const [candidate, setCandidate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const working = useRef(false);
  const choose = async () => {
    if (working.current || busy) return;
    working.current = true;
    setPending(true);
    setError(null);
    try {
      await onSelect(goal.id.toString(), candidate);
      setCandidate('');
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось выбрать шаг. Повторите попытку.',
      );
    } finally {
      working.current = false;
      setPending(false);
    }
  };
  return (
    <details className="planner-details weekly-step" aria-label={`Следующий шаг: ${goal.title}`}>
      <summary>Следующий шаг</summary>
      <p>{next ? `Выбран: ${next.title}` : 'Следующий шаг не выбран'}</p>
      {next && (
        <StepDate
          key={next.id.toString()}
          action={next}
          today={today}
          busy={busy || pending}
          onPlan={onPlan}
        />
      )}
      {actions.length > 0 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (actions.some((action) => action.id.toString() === candidate)) void choose();
          }}
        >
          <label htmlFor={selectId}>Связанное действие</label>
          <select
            id={selectId}
            value={candidate}
            disabled={busy || pending}
            onChange={(event) => setCandidate(event.target.value)}
          >
            <option value="">Выберите действие</option>
            {actions.map((action) => (
              <option key={action.id.toString()} value={action.id.toString()}>
                {action.title.toString()}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={
              busy || pending || !actions.some((action) => action.id.toString() === candidate)
            }
          >
            Выбрать следующим шагом
          </button>
        </form>
      ) : (
        <p className="planner-empty">Связанных открытых дел пока нет.</p>
      )}
      <button type="button" disabled={busy || pending} onClick={() => onCreate(goal.id.toString())}>
        Создать связанное действие
      </button>
      <p className="planner-muted">Выбор шага цели не меняет главное дело дня.</p>
      {pending && <p role="status">Сохраняем…</p>}
      {error && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
    </details>
  );
}

function StepDate({
  action,
  today,
  busy,
  onPlan,
}: {
  readonly action: LifeAction;
  readonly today: string;
  readonly busy: boolean;
  readonly onPlan: (id: string, date: string) => Promise<void>;
}) {
  const inputId = useId();
  const planned = action.plannedDate?.toString();
  const [date, setDate] = useState(planned && planned >= today ? planned : today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  const save = async () => {
    if (working.current || busy || !date || date < today) return;
    working.current = true;
    setPending(true);
    setError(null);
    try {
      await onPlan(action.id.toString(), date);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить дату. Повторите попытку.',
      );
    } finally {
      working.current = false;
      setPending(false);
    }
  };
  return (
    <div>
      <p className="planner-muted">
        {planned ? `Запланировано: ${planned}` : 'Дата пока не назначена'}
      </p>
      {action.status === 'in_progress' ? (
        <p className="planner-muted">
          Действие уже выполняется. Для продолжения откройте карточку.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={inputId}>Дата следующего шага</label>
          <input
            id={inputId}
            type="date"
            min={today}
            required
            value={date}
            disabled={busy || pending}
            onChange={(event) => setDate(event.target.value)}
          />
          <button type="submit" disabled={busy || pending || !date || date < today}>
            Назначить дату
          </button>
        </form>
      )}
      {pending && <p role="status">Сохраняем…</p>}
      {error && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
    </div>
  );
}
