import { useRef, useState } from 'react';
import type { Goal } from '../../domain';
import { GoalMeasurementFields } from './GoalMeasurementFields';
import { usePlanning } from './PlanningContext';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
export function PlanningProgress({
  goal,
  date,
  editable = false,
  onAchieve,
}: {
  readonly goal: Goal;
  readonly date: string;
  readonly editable?: boolean;
  readonly onAchieve?: () => void;
}) {
  const context = usePlanning();
  const [measurement, setMeasurement] = useState(goal.measurement),
    [dueDate, setDueDate] = useState(goal.dueDate ?? ''),
    [amount, setAmount] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const working = useRef(false),
    commandId = useRef<string | null>(null);
  const progress = context?.progress(goal.id.toString(), date) ?? null;
  const run = async (work: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      await context?.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      {goal.measurement && (
        <div className="planning-progress">
          {progress && !progress.complete && (
            <p role="status">Данные прогресса синхронизируются…</p>
          )}
          {progress?.complete && (
            <>
              <span>
                {progress.current.toLocaleString('ru-RU')} /{' '}
                {progress.target.toLocaleString('ru-RU')} {progress.unit}
                {progress.percent !== null
                  ? ` · ${progress.percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`
                  : ''}
              </span>
              {progress.percent !== null && (
                <progress max={100} value={progress.percent} aria-label="Прогресс цели" />
              )}
              <span className="planner-muted">
                Осталось: {progress.remaining.toLocaleString('ru-RU')}
                {progress.pending ? ` · Ожидают значения: ${progress.pending}` : ''}
              </span>
              {progress.reached && (
                <p role="status">
                  Целевое значение достигнуто
                  {goal.measurement?.mode === 'recurring' ? ' в этом цикле' : ''}.
                  {goal.measurement?.mode !== 'recurring' &&
                    goal.status === 'active' &&
                    onAchieve && (
                      <button type="button" onClick={onAchieve}>
                        Завершить цель
                      </button>
                    )}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {editable && context && (
        <details>
          <summary>Измерение и корректировка</summary>
          <fieldset disabled={busy}>
            <GoalMeasurementFields value={measurement} onChange={setMeasurement} />
            <label>
              <span>Точный срок · необязательно</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <button
              type="button"
              onClick={() => {
                void run(() =>
                  context.services.progress.configure(
                    goal.id.toString(),
                    measurement,
                    null,
                    dueDate || null,
                  ),
                );
              }}
            >
              Сохранить настройки
            </button>
            {goal.measurement && (
              <>
                <label>
                  <span>Поправка прогресса (+/−)</span>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      commandId.current = null;
                    }}
                  />
                </label>
                <VoiceField>
                  <span>Причина</span>
                  <VoiceTextInput
                    id={`adjust-${goal.id.toString()}`}
                    value={reason}
                    onValueChange={setReason}
                  />
                </VoiceField>
                <button
                  type="button"
                  disabled={!amount}
                  onClick={() => {
                    const id = commandId.current ?? crypto.randomUUID();
                    commandId.current = id;
                    void run(() =>
                      context.services.progress.adjust(
                        goal.id.toString(),
                        Number(amount),
                        reason,
                        id,
                      ),
                    );
                  }}
                >
                  Добавить корректировку
                </button>
              </>
            )}
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </>
  );
}
