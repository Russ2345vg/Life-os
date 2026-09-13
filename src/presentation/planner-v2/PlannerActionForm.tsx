import { useRef, useState } from 'react';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { emptyActionDraft, type PlannerActionDraft } from './plannerFormSubmission';

export interface PlannerOption {
  readonly id: string;
  readonly title: string;
}
export function PlannerActionForm({
  goals,
  onSubmit,
  onCancel,
  currentDate,
  initialGoalId = null,
  initialTitle = null,
}: {
  readonly goals: readonly PlannerOption[];
  readonly onSubmit: (draft: PlannerActionDraft) => Promise<void>;
  readonly onCancel: () => void;
  readonly currentDate: string;
  readonly initialGoalId?: string | null;
  readonly initialTitle?: string | null;
}) {
  const [draft, setDraft] = useState(() => emptyActionDraft(initialGoalId, initialTitle));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const goalUnavailable = draft.goalId !== '' && !goals.some((goal) => goal.id === draft.goalId);
  const change = <K extends keyof PlannerActionDraft>(key: K, value: PlannerActionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="planner-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving.current) return;
        if (goalUnavailable) {
          setError('Выберите другую цель или «Без цели».');
          return;
        }
        saving.current = true;
        setBusy(true);
        setError(null);
        void onSubmit(draft)
          .catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : 'Не удалось сохранить действие.'),
          )
          .finally(() => {
            saving.current = false;
            setBusy(false);
          });
      }}
    >
      <header>
        <p className="planner-eyebrow">Действие</p>
        <h1>Новое действие</h1>
        <p className="planner-muted">Достаточно названия. Всё остальное — по желанию.</p>
      </header>
      <fieldset disabled={busy}>
        <VoiceField>
          <span>Название</span>
          <VoiceTextInput
            id="planner-action-title"
            name="title"
            value={draft.title}
            onValueChange={(value) => change('title', value)}
            required
            maxLength={200}
            placeholder="Что хотите сделать?"
          />
        </VoiceField>
        <label>
          <span>
            Цель <small>необязательно</small>
          </span>
          <select
            name="goalId"
            value={draft.goalId}
            onChange={(event) => change('goalId', event.target.value)}
          >
            <option value="">Без цели</option>
            {goalUnavailable ? (
              <option value={draft.goalId} disabled>
                Цель недоступна
              </option>
            ) : null}
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        {goalUnavailable ? (
          <p className="planner-error" role="alert">
            Выберите другую цель или «Без цели».
          </p>
        ) : null}
        <label>
          <span>
            Дата <small>необязательно</small>
          </span>
          <span className="planner-date-field">
            <input
              name="date"
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  date: event.target.value,
                  isNext: event.target.value ? current.isNext : false,
                }))
              }
            />
            <button type="button" onClick={() => change('date', currentDate)}>
              Сегодня
            </button>
            {draft.date ? (
              <button
                type="button"
                aria-label="Убрать дату"
                onClick={() => setDraft((current) => ({ ...current, date: '', isNext: false }))}
              >
                ×
              </button>
            ) : null}
          </span>
        </label>
        <details className="planner-details">
          <summary>Дополнительно</summary>
          <div className="planner-details-body">
            <VoiceField>
              <span>Описание / заметки</span>
              <VoiceTextArea
                id="planner-action-description"
                value={draft.description}
                onValueChange={(value) => change('description', value)}
                rows={4}
                maxLength={4000}
              />
            </VoiceField>
            <label>
              <span>Приоритет</span>
              <select
                value={draft.isNext ? 'main' : 'normal'}
                onChange={(event) => change('isNext', event.target.value === 'main')}
              >
                <option value="normal">Обычное действие</option>
                <option value="main" disabled={!draft.date}>
                  Главное на выбранный день
                </option>
              </select>
            </label>
            <p className="planner-muted">
              Главное действие может быть одно. Выберите дату, если хотите его выделить.
            </p>
          </div>
        </details>
      </fieldset>
      {error ? (
        <p role="alert" className="planner-error">
          {error}
        </p>
      ) : null}
      <footer className="planner-form-actions">
        <button className="planner-primary" type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Создать действие'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </footer>
    </form>
  );
}
