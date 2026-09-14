import type { GoalMeasurement } from '../../domain/planner/GoalMeasurement';
const defaults: GoalMeasurement = {
  mode: 'count',
  target: 1,
  unit: 'раз',
  start: 0,
  direction: 'at_least',
  cycle: null,
};
export function GoalMeasurementFields({
  value,
  onChange,
}: {
  readonly value: GoalMeasurement | null;
  readonly onChange: (v: GoalMeasurement | null) => void;
}) {
  const change = (patch: Partial<GoalMeasurement>) =>
    onChange({ ...(value ?? defaults), ...patch });
  return (
    <details className="planner-details">
      <summary>Измерение прогресса{value ? ' · включено' : ''}</summary>
      <div className="planner-details-body">
        <label>
          <span>Тип измерения</span>
          <select
            value={value?.mode ?? 'off'}
            onChange={(e) => {
              const mode = e.target.value;
              if (mode === 'off') onChange(null);
              else
                change({
                  mode: mode as GoalMeasurement['mode'],
                  cycle: mode === 'recurring' ? 'week' : null,
                });
            }}
          >
            <option value="off">Выключено · качественная цель</option>
            <option value="numeric">Числовая цель</option>
            <option value="count">Количество выполнений</option>
            <option value="recurring">Повторяющийся норматив</option>
          </select>
        </label>
        {value && (
          <>
            <div className="planner-form-grid">
              <label>
                <span>Целевое значение</span>
                <input
                  type="number"
                  step="any"
                  required
                  value={value.target}
                  onChange={(e) => change({ target: e.target.valueAsNumber })}
                />
              </label>
              <label>
                <span>Единица</span>
                <input
                  value={value.unit}
                  required
                  maxLength={40}
                  onChange={(e) => change({ unit: e.target.value })}
                />
              </label>
            </div>
            {value.mode === 'numeric' && (
              <>
                <label>
                  <span>Начальное значение · необязательно</span>
                  <input
                    type="number"
                    step="any"
                    value={value.start ?? ''}
                    onChange={(e) =>
                      change({ start: e.target.value === '' ? null : e.target.valueAsNumber })
                    }
                  />
                </label>
                <label>
                  <span>Цель</span>
                  <select
                    value={value.direction}
                    onChange={(e) =>
                      change({ direction: e.target.value as GoalMeasurement['direction'] })
                    }
                  >
                    <option value="at_least">Не меньше</option>
                    <option value="at_most">Не больше</option>
                    <option value="exact">Точно</option>
                  </select>
                </label>
              </>
            )}
            {value.mode === 'recurring' && (
              <label>
                <span>Цикл</span>
                <select
                  value={value.cycle ?? 'week'}
                  onChange={(e) => change({ cycle: e.target.value as 'week' | 'month' })}
                >
                  <option value="week">Неделя</option>
                  <option value="month">Календарный месяц</option>
                </select>
                <small>Каждый цикл считается отдельно. Долг не переносится.</small>
              </label>
            )}
          </>
        )}
      </div>
    </details>
  );
}
