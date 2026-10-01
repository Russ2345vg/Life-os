import { useEffect, useRef } from 'react';
import type { TodayGoalGuidance } from '../../application/queries/GetTodayGoalGuidance';
import { durationLabel } from './timePresentation';
import './planner-goal-guidance.css';

interface Props {
  readonly guidance: TodayGoalGuidance | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly writeError?: string | null;
  readonly busy: boolean;
  readonly needsConfirmation: boolean;
  readonly onSelectGoal: (id: string | null) => void;
  readonly onSelectAction: (id: string | null) => void;
  readonly onConfirm: () => void;
  readonly onPlan: () => void;
  readonly onOpenAction: (id: string) => void;
  readonly onOpenGoal: (id: string) => void;
  readonly onCreateAction: (goalId: string, title: string | null) => void;
  readonly onCreateGoal: () => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export function PlannerGoalGuidance({
  guidance,
  loading,
  error,
  writeError,
  busy,
  needsConfirmation,
  onSelectGoal,
  onSelectAction,
  onConfirm,
  onPlan,
  onOpenAction,
  onOpenGoal,
  onCreateAction,
  onCreateGoal,
  onRetry,
  onClose,
}: Props) {
  const goalSelect = useRef<HTMLSelectElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const focusedData = useRef(false);
  useEffect(() => {
    if (focusedData.current || loading || error || !guidance) return;
    const target = guidance.status === 'empty' ? createButton.current : goalSelect.current;
    target?.focus({ preventScroll: true });
    focusedData.current = true;
  }, [guidance, loading, error]);
  const blocked = loading || busy || Boolean(error);
  const selectedGoal = guidance?.goals.some((goal) => goal.id === guidance.goalId)
    ? (guidance.goalId ?? '')
    : '';
  const selectedAction = guidance?.actions.some((action) => action.id === guidance.actionId)
    ? (guidance.actionId ?? '')
    : '';
  return (
    <section className="planner-goal-guidance planner-form" aria-label="Шаг к цели">
      <header>
        <p className="planner-eyebrow">Навигатор</p>
        <h2>Шаг к цели</h2>
        <p className="planner-muted">Выберите действие своей цели и добавьте его в план дня.</p>
      </header>
      {loading || (guidance === null && !error) ? (
        <p role="status">Обновляем цели и действия…</p>
      ) : error ? (
        <div className="planner-error" role="alert">
          <p>Данные могли измениться. {error}</p>
          <button type="button" onClick={onRetry} disabled={busy}>
            Повторить загрузку
          </button>
        </div>
      ) : guidance?.status === 'empty' ? (
        <div className="planner-goal-guidance__empty">
          <p>Создайте цель, чтобы выбрать шаг на сегодня.</p>
          <button
            ref={createButton}
            className="planner-primary"
            type="button"
            onClick={onCreateGoal}
          >
            Создать цель
          </button>
        </div>
      ) : guidance ? (
        <>
          <div className="planner-goal-guidance__fields">
            <label htmlFor="goal-guidance-goal">Цель</label>
            <select
              ref={goalSelect}
              id="goal-guidance-goal"
              value={selectedGoal}
              disabled={blocked}
              onChange={(event) => onSelectGoal(event.target.value || null)}
            >
              <option value="">Выберите цель</option>
              {guidance.goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
            {guidance.status === 'ready' ? (
              <p className="planner-muted">
                {guidance.goalReason === 'weekly-primary'
                  ? 'Главная цель этой недели'
                  : guidance.goalReason === 'user-choice'
                    ? 'Ваш выбор на сегодня'
                    : 'Фокус недели изменился. Проверьте выбор.'}
              </p>
            ) : guidance.goalId === null ? (
              <p className="planner-muted">
                Главная цель недели не выбрана. Выберите цель для шага.
              </p>
            ) : null}
            {guidance.whyImportant ? (
              <p className="planner-goal-guidance__why">Почему важно: {guidance.whyImportant}</p>
            ) : null}
            {guidance.goalId && guidance.goalTitle ? (
              <button
                className="planner-text-link"
                type="button"
                disabled={busy}
                onClick={() => onOpenGoal(guidance.goalId!)}
              >
                Открыть цель
              </button>
            ) : null}
            {guidance.goalTitle ? (
              <>
                <label htmlFor="goal-guidance-action">Действие</label>
                <select
                  id="goal-guidance-action"
                  value={selectedAction}
                  disabled={blocked}
                  onChange={(event) => onSelectAction(event.target.value || null)}
                >
                  <option value="">Выберите действие</option>
                  {guidance.actions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.title}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
          {guidance.status === 'selection-unavailable' ? (
            <p className="planner-error" role="alert">
              {guidance.unavailable === 'goal'
                ? 'Выбранная цель больше недоступна. Выберите другую цель.'
                : 'Выбранный шаг больше недоступен. Выберите другое действие.'}
            </p>
          ) : guidance.status === 'choose-action' ? (
            <p className="planner-muted">
              У цели нет выбранного следующего шага. Выберите действие сами.
            </p>
          ) : null}
          {guidance.goalId && guidance.goalTitle && guidance.actions.length === 0 ? (
            <button
              type="button"
              className="planner-primary"
              disabled={blocked}
              onClick={() => onCreateAction(guidance.goalId!, guidance.nextProgress)}
            >
              Создать действие для цели
            </button>
          ) : null}
          {guidance.status === 'ready' ? (
            <div className="planner-goal-guidance__choice">
              <h3>{guidance.actionTitle}</h3>
              <p className="planner-muted">
                {guidance.actionReason === 'goal-next-action'
                  ? 'Вы выбрали это действие следующим шагом цели'
                  : guidance.actionReason === 'user-choice'
                    ? 'Ваш выбор на сегодня'
                    : 'Следующий шаг цели изменился. Проверьте выбор.'}
              </p>
              {guidance.plannedDate ? (
                <p>Сейчас запланировано: {guidance.plannedDate}</p>
              ) : (
                <p>Без даты</p>
              )}
              {guidance.estimateMinutes !== null ? (
                <p>Оценка: {durationLabel(guidance.estimateMinutes)}</p>
              ) : null}
              {guidance.mainOnPreviousDate ? (
                <p className="planner-goal-guidance__warning">
                  После переноса действие перестанет быть главным делом на прежней дате. Отменить
                  перенос можно из плана дня.
                </p>
              ) : null}
              {needsConfirmation ? (
                <div className="planner-goal-guidance__warning" role="status">
                  Фокус или следующий шаг изменился. Проверьте выбор перед добавлением.
                  <button type="button" onClick={onConfirm} disabled={blocked}>
                    Выбор проверен
                  </button>
                </div>
              ) : null}
              {writeError ? (
                <p className="planner-error" role="alert">
                  {writeError}
                </p>
              ) : null}
              <div className="planner-form-actions">
                <button
                  className="planner-primary"
                  type="button"
                  disabled={blocked || needsConfirmation}
                  onClick={
                    guidance.cta === 'open-action' ? () => onOpenAction(guidance.actionId) : onPlan
                  }
                >
                  {guidance.cta === 'open-action'
                    ? 'Открыть действие'
                    : guidance.cta === 'move-today'
                      ? 'Перенести на сегодня'
                      : 'Добавить на сегодня'}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="planner-form-actions">
        <button type="button" onClick={onClose} disabled={busy}>
          Закрыть
        </button>
      </div>
    </section>
  );
}
