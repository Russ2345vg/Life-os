import { useRef, useState, type FormEvent } from 'react';
import type { LifeAction } from '../../domain';
import { PlannerSheet } from './PlannerSheet';
import { plannerDateLabel } from './plannerViewsModel';
import './planner-time-calendar.css';
import { useQuickAccessGuard } from './QuickAccessContext';
import { clockTime } from './timePresentation';

export type SetActionTime = (
  id: string,
  estimateMinutes: number | null,
  scheduledStartMinute: number | null,
  scheduledDurationMinutes: number | null,
  expectedVersion: number,
) => Promise<void>;

export function PlannerActionTimeSheet({
  action: sourceAction,
  onSave,
  onClose,
}: {
  readonly action: LifeAction;
  readonly onSave: SetActionTime;
  readonly onClose: () => void;
}) {
  const [action] = useState(sourceAction);
  const [expectedVersion] = useState(sourceAction.version);
  const [estimate, setEstimate] = useState(
    action.estimateMinutes === null ? '' : String(action.estimateMinutes),
  );
  const [start, setStart] = useState(
    action.scheduledStartMinute === null ? '09:00' : clockTime(action.scheduledStartMinute),
  );
  const [duration, setDuration] = useState(
    String(action.scheduledDurationMinutes ?? action.estimateMinutes ?? 60),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const working = useRef(false);
  useQuickAccessGuard(() => ({
    dirty:
      estimate !== (action.estimateMinutes === null ? '' : String(action.estimateMinutes)) ||
      start !==
        (action.scheduledStartMinute === null ? '09:00' : clockTime(action.scheduledStartMinute)) ||
      duration !== String(action.scheduledDurationMinutes ?? action.estimateMinutes ?? 60),
    busy: working.current,
  }));
  const save = async (onlyEstimate: boolean) => {
    if (working.current) return;
    const nextEstimate = estimate.trim() === '' ? null : Number(estimate);
    const nextDuration = onlyEstimate ? null : Number(duration);
    const parts = start.split(':').map(Number);
    const nextStart = onlyEstimate ? null : parts.length === 2 ? parts[0]! * 60 + parts[1]! : NaN;
    if (
      (nextEstimate !== null &&
        (!Number.isInteger(nextEstimate) || nextEstimate < 1 || nextEstimate > 1440)) ||
      (nextStart !== null &&
        nextDuration !== null &&
        (!Number.isInteger(nextStart) ||
          !Number.isInteger(nextDuration) ||
          nextDuration < 1 ||
          nextStart < 0 ||
          nextStart + nextDuration > 1440))
    ) {
      setError('Проверьте оценку и время: длительность от 1 до 1440 минут, блок в пределах дня.');
      return;
    }
    working.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(action.id.toString(), nextEstimate, nextStart, nextDuration, expectedVersion);
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить время.');
    } finally {
      working.current = false;
      setSaving(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(action.plannedDate === null);
  };
  return (
    <PlannerSheet
      title="Запланировать действие"
      onClose={() => {
        if (!working.current) onClose();
      }}
    >
      <form className="planner-time-form" onSubmit={submit}>
        <h2>{action.title.toString()}</h2>
        <p className="planner-muted">
          {action.plannedDate
            ? plannerDateLabel(action.plannedDate.toString())
            : 'Без даты: сохраните оценку, а время выберите после назначения даты.'}
        </p>
        <label>
          Оценка работы, минуты{' '}
          <input
            type="number"
            min="1"
            max="1440"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            placeholder="Необязательно"
            disabled={saving}
          />
        </label>
        {action.plannedDate && (
          <>
            <label>
              Начало{' '}
              <input
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
                disabled={saving}
              />
            </label>
            <label>
              Длительность блока, минуты{' '}
              <input
                type="number"
                min="1"
                max="1440"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                required
                disabled={saving}
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="planner-error">
            {error}
          </p>
        )}
        <div className="planner-time-form-actions">
          {action.plannedDate && (
            <button type="button" onClick={() => void save(true)} disabled={saving}>
              {action.scheduledStartMinute !== null ? 'Убрать время' : 'Сохранить только оценку'}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="planner-primary" disabled={saving}>
            Сохранить
          </button>
        </div>
      </form>
    </PlannerSheet>
  );
}
