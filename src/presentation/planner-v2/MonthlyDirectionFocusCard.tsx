import type { PlannerOption } from './PlannerActionForm';

export interface MonthlyDirectionFocusView {
  readonly month: string;
  readonly hasCurrent: boolean;
  readonly directionId: string | null;
  readonly directionLabel: string | null;
  readonly suggestion: {
    readonly directionId: string;
    readonly directionLabel: string;
  } | null;
  readonly choices: readonly PlannerOption[];
}

export function MonthlyDirectionFocusCard({
  value,
  busy,
  onChange,
}: {
  readonly value: MonthlyDirectionFocusView;
  readonly busy: boolean;
  readonly onChange: (directionId: string | null) => void;
}) {
  const active = value.hasCurrent && value.directionId !== null;
  const title = active
    ? (value.directionLabel ?? 'Недоступное направление')
    : value.hasCurrent
      ? 'Главное направление не выбрано'
      : 'Выберите главное направление';
  return (
    <section
      className={`planner-main-direction planner-month-focus${active ? ' planner-month-focus--active' : ''}`}
      aria-labelledby="planner-month-focus-title"
    >
      <div className="planner-month-focus__summary">
        <span className="planner-eyebrow">Фокус месяца · {formatMonth(value.month)}</span>
        <strong id="planner-month-focus-title">{title}</strong>
        {value.suggestion ? (
          <p>
            Продолжить в {monthPrepositional(value.month)}: {value.suggestion.directionLabel}?
          </p>
        ) : (
          <p>
            {active
              ? 'Ориентир месяца во вкладке «Сегодня».'
              : 'Выберите направление, которое хотите держать в поле зрения.'}
          </p>
        )}
      </div>
      <div className="planner-month-focus__controls">
        {value.suggestion ? (
          <button
            type="button"
            className="planner-primary"
            disabled={busy}
            onClick={() => onChange(value.suggestion!.directionId)}
          >
            Подтвердить направление
          </button>
        ) : null}
        <select
          id="planner-month-direction"
          aria-label="Главное направление"
          value={value.directionId ?? ''}
          disabled={busy}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">Не выбрано</option>
          {value.directionId && !value.choices.some((choice) => choice.id === value.directionId) ? (
            <option value={value.directionId}>Недоступное направление</option>
          ) : null}
          {value.choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.title}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

function monthPrepositional(month: string): string {
  const names = [
    'январе',
    'феврале',
    'марте',
    'апреле',
    'мае',
    'июне',
    'июле',
    'августе',
    'сентябре',
    'октябре',
    'ноябре',
    'декабре',
  ];
  return names[Number(month.slice(5, 7)) - 1] ?? 'новом месяце';
}
