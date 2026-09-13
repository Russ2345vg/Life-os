import { useRef, useState } from 'react';
import { GOAL_HORIZON, type GoalHorizon } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import type { PlannerOption } from './PlannerActionForm';
import { emptyGoalDraft, type PlannerGoalDraft } from './plannerFormSubmission';

const horizons: Record<GoalHorizon, string> = {
  [GOAL_HORIZON.now]: 'Сейчас',
  [GOAL_HORIZON.withinYear]: 'В течение года',
  [GOAL_HORIZON.oneToThreeYears]: '1–3 года',
  [GOAL_HORIZON.threeToFiveYears]: '3–5 лет',
  [GOAL_HORIZON.someday]: 'Когда-нибудь',
};
export function PlannerGoalForm({
  directions,
  onSubmit,
  onCancel,
}: {
  readonly directions: readonly PlannerOption[];
  readonly onSubmit: (draft: PlannerGoalDraft) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(emptyGoalDraft);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const change = <K extends keyof PlannerGoalDraft>(key: K, value: PlannerGoalDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="planner-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        setError(null);
        void onSubmit(draft)
          .catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : 'Не удалось сохранить цель.'),
          )
          .finally(() => {
            saving.current = false;
            setBusy(false);
          });
      }}
    >
      <header>
        <p className="planner-eyebrow">Цель</p>
        <h1>Новая цель</h1>
        <p className="planner-muted">К чему вы хотите прийти?</p>
      </header>
      <fieldset disabled={busy}>
        <VoiceField>
          <span>Название</span>
          <VoiceTextInput
            id="planner-goal-title"
            name="title"
            value={draft.title}
            onValueChange={(value) => change('title', value)}
            required
            maxLength={200}
            placeholder="Назовите цель"
          />
        </VoiceField>
        <VoiceField>
          <span>Желаемый результат</span>
          <VoiceTextArea
            id="planner-goal-outcome"
            value={draft.outcome}
            onValueChange={(value) => change('outcome', value)}
            rows={3}
            maxLength={2000}
            placeholder="Что изменится, когда цель будет достигнута?"
          />
        </VoiceField>
        <div className="planner-form-columns">
          <label>
            <span>
              Направление <small>необязательно</small>
            </span>
            <select
              value={draft.directionId}
              onChange={(event) => change('directionId', event.target.value)}
            >
              <option value="">Можно выбрать позже</option>
              {directions.map((direction) => (
                <option key={direction.id} value={direction.id}>
                  {direction.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Горизонт</span>
            <select
              value={draft.horizon}
              onChange={(event) => change('horizon', event.target.value as GoalHorizon | '')}
            >
              <option value="">Без срока</option>
              {Object.entries(horizons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <VoiceField>
          <span>
            Первый шаг <small>необязательно</small>
          </span>
          <VoiceTextInput
            id="planner-goal-first-step"
            value={draft.firstStep}
            onValueChange={(value) => change('firstStep', value)}
            maxLength={200}
            placeholder="С чего можно начать?"
          />
        </VoiceField>
        <details className="planner-details">
          <summary>Дополнительно</summary>
          <div className="planner-details-body">
            <VoiceField>
              <span>Описание / заметки</span>
              <VoiceTextArea
                id="planner-goal-description"
                value={draft.description}
                onValueChange={(value) => change('description', value)}
                rows={3}
                maxLength={4000}
              />
            </VoiceField>
            <VoiceField>
              <span>Почему это важно</span>
              <VoiceTextArea
                id="planner-goal-why-important"
                value={draft.whyImportant}
                onValueChange={(value) => change('whyImportant', value)}
                rows={2}
                maxLength={2000}
              />
            </VoiceField>
            <VoiceField>
              <span>Почему сейчас</span>
              <VoiceTextArea
                id="planner-goal-why-now"
                value={draft.whyNow}
                onValueChange={(value) => change('whyNow', value)}
                rows={2}
                maxLength={2000}
              />
            </VoiceField>
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
          {busy ? 'Сохраняем…' : 'Создать цель'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </footer>
    </form>
  );
}
