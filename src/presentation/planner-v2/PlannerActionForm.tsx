import { defaultRecurrence, RecurrenceFields } from './RecurrenceFields';
import { useQuickAccessDraft } from './QuickAccessContext';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { usePlanning } from './PlanningContext';
import { useEffect, useRef, useState } from 'react';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { emptyActionDraft, type PlannerActionDraft } from './plannerFormSubmission';
import { NeedPicker } from './NeedPicker';
import type { ScenarioService } from '../../application/planner/PlannerServices';
import type { TaskScenario } from '../../domain/planner/TaskScenario';

export interface PlannerOption {
  readonly id: string;
  readonly title: string;
  readonly directionId?: string | null;
  readonly sphereId?: string | null;
}
export function PlannerActionForm({
  goals,
  onSubmit,
  onCancel,
  currentDate,
  initialGoalId = null,
  initialTitle = null,
  initialDate = null,
  initialParentActionId = null,
  lockGoal = false,
  initialDirectionId = null,
  contextLabel = null,
  scenarios,
}: {
  readonly goals: readonly PlannerOption[];
  readonly onSubmit: (draft: PlannerActionDraft) => Promise<void>;
  readonly onCancel: () => void;
  readonly currentDate: string;
  readonly initialGoalId?: string | null;
  readonly initialTitle?: string | null;
  readonly initialDate?: string | null;
  readonly initialParentActionId?: string | null;
  readonly lockGoal?: boolean;
  readonly initialDirectionId?: string | null;
  readonly contextLabel?: string | null;
  readonly scenarios?: Pick<ScenarioService, 'list'> | undefined;
}) {
  const planning = usePlanning();
  const [draft, setDraft] = useState(() => ({
    ...emptyActionDraft(initialGoalId, initialTitle),
    date: initialDate ?? '',
    directionId: initialDirectionId ?? '',
    parentActionId: initialParentActionId ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [specificDate, setSpecificDate] = useState(
    Boolean(initialDate && initialDate !== currentDate && initialDate !== addDays(currentDate, 1)),
  );
  const saving = useRef(false);
  useQuickAccessDraft(draft, busy);
  const [error, setError] = useState<string | null>(null);
  const scenarioDate = draft.date || currentDate;
  const [scenarioResult, setScenarioResult] = useState<{
    readonly date: string;
    readonly items: readonly TaskScenario[];
    readonly error: string | null;
  } | null>(null);
  const currentScenarios = scenarioResult?.date === scenarioDate ? scenarioResult : null;
  const scenariosLoading = Boolean(scenarios) && currentScenarios === null;
  const scenariosError = currentScenarios?.error ?? null;
  const availableScenarios = currentScenarios?.items ?? [];
  useEffect(() => {
    if (!scenarios) return;
    let active = true;
    void scenarios.list(scenarioDate).then(
      (found) => {
        if (!active) return;
        setScenarioResult({
          date: scenarioDate,
          items: found.filter((item) => item.actionIds.length < 3),
          error: null,
        });
      },
      () => {
        if (!active) return;
        setScenarioResult({
          date: scenarioDate,
          items: [],
          error: 'Не удалось загрузить сценарии. Выберите сценарий позже.',
        });
      },
    );
    return () => {
      active = false;
    };
  }, [scenarios, scenarioDate]);
  const goalUnavailable = draft.goalId !== '' && !goals.some((goal) => goal.id === draft.goalId);
  const scenarioUnavailable =
    Boolean(draft.scenarioId) &&
    (scenariosLoading ||
      Boolean(scenariosError) ||
      !availableScenarios.some((item) => item.id === draft.scenarioId));
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
        if (scenarioUnavailable) {
          setError(
            'Выбранный сценарий недоступен для этой даты. Выберите другой или «Без сценария».',
          );
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
        <h1>{initialParentActionId ? 'Новое поддействие' : 'Новое действие'}</h1>
        <p className="planner-muted">Достаточно названия. Всё остальное — по желанию.</p>
      </header>
      <fieldset disabled={busy}>
        {contextLabel && <p className="planner-muted">{contextLabel}</p>}
        {initialParentActionId && (
          <input type="hidden" name="parentActionId" value={initialParentActionId} />
        )}
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
        {lockGoal && !goalUnavailable ? (
          <input type="hidden" name="goalId" value={draft.goalId} />
        ) : (
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
        )}
        {goalUnavailable ? (
          <p className="planner-error" role="alert">
            Выберите другую цель или «Без цели».
          </p>
        ) : null}
        {scenarios && (
          <label>
            <span>
              Сценарий задач <small>необязательно</small>
            </span>
            <select
              value={draft.scenarioId}
              disabled={scenariosLoading || Boolean(scenariosError)}
              onChange={(event) => change('scenarioId', event.target.value)}
            >
              <option value="">Без сценария</option>
              {availableScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.title} · {scenario.actionIds.length} из 3
                </option>
              ))}
            </select>
            {scenariosLoading && <small className="planner-muted">Загружаем сценарии…</small>}
            {!scenariosLoading && !scenariosError && availableScenarios.length === 0 && (
              <small className="planner-muted">
                Сначала создайте сценарий в разделе «Сегодня».
              </small>
            )}
            {scenariosError && <small className="planner-error">{scenariosError}</small>}
          </label>
        )}
        <label hidden={!specificDate}>
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
        <div
          className="planner-segments planner-date-options"
          role="group"
          aria-label="Когда выполнить"
        >
          <button
            type="button"
            aria-pressed={draft.date === currentDate && !specificDate}
            onClick={() => {
              change('date', currentDate);
              setSpecificDate(false);
            }}
          >
            Сегодня
          </button>
          <button
            type="button"
            aria-pressed={draft.date === addDays(currentDate, 1) && !specificDate}
            onClick={() => {
              change('date', addDays(currentDate, 1));
              setSpecificDate(false);
            }}
          >
            Завтра
          </button>
          <button
            type="button"
            aria-pressed={!draft.date}
            onClick={() => {
              setDraft((current) => ({ ...current, date: '', isNext: false }));
              setSpecificDate(false);
            }}
          >
            Без даты
          </button>
          <button type="button" aria-pressed={specificDate} onClick={() => setSpecificDate(true)}>
            Выбрать дату
          </button>
        </div>
        <details className="planner-details">
          <summary>Повторение</summary>
          <label>
            <input
              type="checkbox"
              checked={draft.recurrence !== null}
              onChange={(e) =>
                change(
                  'recurrence',
                  e.target.checked
                    ? defaultRecurrence(
                        draft.title,
                        draft.date || currentDate,
                        draft.goalId || null,
                      )
                    : null,
                )
              }
            />{' '}
            Повторять действие
          </label>
          {draft.recurrence && (
            <RecurrenceFields
              value={draft.recurrence}
              onChange={(value) => change('recurrence', value)}
            />
          )}
        </details>
        {planning && (
          <details className="planner-details">
            <summary>Вклад в цели</summary>
            <p className="planner-muted">
              Добавьте явные связи. Обычная связь с целью не меняет прогресс.
            </p>
            {draft.contributions.map((link, index) => (
              <div className="planner-form-columns" key={index}>
                <label>
                  Измеримая цель
                  <select
                    value={link.goalId}
                    onChange={(e) =>
                      change(
                        'contributions',
                        draft.contributions.map((v, i) =>
                          i === index ? { ...v, goalId: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    <option value="">Выберите цель</option>
                    {planning.state?.goals
                      .filter((g) => g.measurement && g.status !== 'archived')
                      .map((g) => (
                        <option key={g.id.toString()} value={g.id.toString()}>
                          {g.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Вклад
                  <select
                    value={link.mode}
                    onChange={(e) =>
                      change(
                        'contributions',
                        draft.contributions.map((v, i) =>
                          i === index ? { ...v, mode: e.target.value as 'fixed' | 'actual' } : v,
                        ),
                      )
                    }
                  >
                    <option value="fixed">Фиксированный</option>
                    <option value="actual">По факту</option>
                  </select>
                </label>
                {link.mode === 'fixed' && (
                  <label>
                    Величина
                    <input
                      type="number"
                      step="any"
                      value={link.amount}
                      onChange={(e) =>
                        change(
                          'contributions',
                          draft.contributions.map((v, i) =>
                            i === index ? { ...v, amount: Number(e.target.value) } : v,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() =>
                    change(
                      'contributions',
                      draft.contributions.filter((_, i) => i !== index),
                    )
                  }
                >
                  Убрать
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                change('contributions', [
                  ...draft.contributions,
                  { goalId: '', mode: 'fixed', amount: 1 },
                ])
              }
            >
              Добавить связь с целью
            </button>
          </details>
        )}
        <details className="planner-details">
          <summary>Дополнительно</summary>
          <div className="planner-details-body">
            <NeedPicker
              id="planner-action-need"
              value={draft.need}
              onValueChange={(value) => change('need', value)}
              help="Необязательно. Пустой выбор использует потребность родителя."
            />
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
