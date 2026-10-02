import { GoalMeasurementFields } from './GoalMeasurementFields';
import { useQuickAccessDraft } from './QuickAccessContext';
import { useRef, useState } from 'react';
import { GOAL_HORIZON, type Goal, type GoalHorizon } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { NeedPicker } from './NeedPicker';
import type { PlannerOption } from './PlannerActionForm';
import { emptyGoalDraft, type PlannerGoalDraft } from './plannerFormSubmission';
import type { PeriodKind } from '../../domain/planner/PlanningPeriod';

const horizons: Record<GoalHorizon, string> = {
  [GOAL_HORIZON.now]: 'Сейчас',
  [GOAL_HORIZON.withinYear]: 'В течение года',
  [GOAL_HORIZON.oneToThreeYears]: '1–3 года',
  [GOAL_HORIZON.threeToFiveYears]: '3–5 лет',
  [GOAL_HORIZON.someday]: 'Когда-нибудь',
};
export function PlannerGoalForm({
  directions,
  initialGoal,
  initialDirectionId = '',
  allowPeriod = false,
  onSubmit,
  onCancel,
}: {
  readonly initialGoal?: Goal;
  readonly initialDirectionId?: string;
  readonly allowPeriod?: boolean;
  readonly directions: readonly PlannerOption[];
  readonly onSubmit: (draft: PlannerGoalDraft) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PlannerGoalDraft>(() =>
    initialGoal
      ? {
          ...emptyGoalDraft(),
          expectedVersion: initialGoal.version,
          title: initialGoal.title,
          outcome: initialGoal.achievementCriteria ?? '',
          directionId: initialGoal.directionId?.toString() ?? '',
          horizon: initialGoal.horizon ?? '',
          firstStep: initialGoal.nextProgress ?? '',
          measurement: initialGoal.measurement,
          dueDate: initialGoal.dueDate ?? '',
          description: initialGoal.description ?? '',
          need: initialGoal.need ?? '',
          whyImportant: initialGoal.whyImportant ?? '',
          whyNow: initialGoal.whyNow ?? '',
        }
      : { ...emptyGoalDraft(), directionId: initialDirectionId },
  );
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useQuickAccessDraft(draft, busy);
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
        <h1>{initialGoal ? 'Редактировать цель' : 'Новая цель'}</h1>
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
        <NeedPicker
          id="planner-goal-need"
          value={draft.need}
          onValueChange={(value) => change('need', value)}
          help="Необязательно. Пустой выбор использует потребность направления."
        />
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
              {draft.directionId && !directions.some((d) => d.id === draft.directionId) && (
                <option value={draft.directionId}>Связанное направление недоступно</option>
              )}
              {directions.map((direction) => (
                <option key={direction.id} value={direction.id}>
                  {direction.title}
                </option>
              ))}
            </select>
          </label>
          {allowPeriod && !initialGoal && (
            <label>
              <span>Период</span>
              <select
                value={draft.period}
                onChange={(event) => change('period', event.target.value as PeriodKind | '')}
              >
                <option value="">Без периода</option>
                <option value="week">Эта неделя</option>
                <option value="thirty_days">30 дней</option>
                <option value="quarter">Квартал</option>
                <option value="year">Год</option>
              </select>
            </label>
          )}
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
        {!initialGoal && (
          <details className="planner-details">
            <summary>Измерение и точный срок</summary>
            <GoalMeasurementFields
              value={draft.measurement}
              onChange={(value) => change('measurement', value)}
            />
            <label>
              Точный срок · необязательно
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => change('dueDate', e.target.value)}
              />
            </label>
          </details>
        )}
        {initialGoal && (
          <p className="planner-muted">
            Периоды, измерение и точный срок доступны в карточке цели.
          </p>
        )}
        <details className="planner-details">
          <summary>Дополнительно</summary>
          <div className="planner-details-body">
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
          {busy ? 'Сохраняем…' : initialGoal ? 'Сохранить цель' : 'Создать цель'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </footer>
    </form>
  );
}
