import type { RecurrenceInput } from '../../application/planner/RecurringActions';
// eslint-disable-next-line react-refresh/only-export-components
export function defaultRecurrence(
  title: string,
  startDate: string,
  goalId: string | null,
): RecurrenceInput {
  return {
    title,
    startDate,
    goalId,
    priority: null,
    endDate: null,
    maxCompletions: null,
    paused: false,
    pauseUntil: null,
    schedule: { kind: 'daily' },
  };
}
export function RecurrenceFields({
  value,
  onChange,
}: {
  readonly value: RecurrenceInput;
  readonly onChange: (value: RecurrenceInput) => void;
}) {
  const change = (patch: Partial<RecurrenceInput>) => onChange({ ...value, ...patch });
  const schedule = value.schedule;
  return (
    <div className="planning-measurement">
      <label>
        Расписание
        <select
          aria-label="Расписание"
          value={schedule.kind}
          onChange={(e) => {
            const kind = e.target.value;
            change({
              schedule:
                kind === 'weekdays'
                  ? { kind, weekdays: [1] }
                  : kind === 'interval'
                    ? { kind, days: 7 }
                    : kind === 'monthly'
                      ? { kind, day: 1 }
                      : { kind: 'daily' },
            });
          }}
        >
          <option value="daily">Каждый день</option>
          <option value="weekdays">Дни недели / еженедельно</option>
          <option value="interval">Интервал после выполнения</option>
          <option value="monthly">Ежемесячно</option>
        </select>
      </label>
      {schedule.kind === 'weekdays' && (
        <div className="planning-weekdays">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((name, i) => {
            const day = (i + 1) % 7;
            return (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={schedule.weekdays.includes(day)}
                  onChange={(e) =>
                    change({
                      schedule: {
                        kind: 'weekdays',
                        weekdays: e.target.checked
                          ? [...schedule.weekdays, day]
                          : schedule.weekdays.filter((d) => d !== day),
                      },
                    })
                  }
                />
                {name}
              </label>
            );
          })}
        </div>
      )}
      {schedule.kind === 'interval' && (
        <label>
          Дней после фактического выполнения
          <input
            type="number"
            min={1}
            max={3650}
            value={schedule.days}
            onChange={(e) =>
              change({ schedule: { kind: 'interval', days: Number(e.target.value) } })
            }
          />
        </label>
      )}
      {schedule.kind === 'monthly' && (
        <label>
          Число месяца
          <input
            type="number"
            min={1}
            max={31}
            value={schedule.day}
            onChange={(e) => change({ schedule: { kind: 'monthly', day: Number(e.target.value) } })}
          />
          <small>Если такого числа нет, месяц пропускается.</small>
        </label>
      )}
      <label>
        Начало
        <input
          type="date"
          value={value.startDate}
          onChange={(e) => change({ startDate: e.target.value })}
        />
      </label>
      <label>
        Окончание · необязательно
        <input
          type="date"
          value={value.endDate ?? ''}
          onChange={(e) => change({ endDate: e.target.value || null })}
        />
      </label>
      <label>
        Количество выполнений · необязательно
        <input
          type="number"
          min={1}
          value={value.maxCompletions ?? ''}
          onChange={(e) =>
            change({ maxCompletions: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        Приоритет повторения
        <select
          value={value.priority ?? ''}
          onChange={(e) =>
            change({ priority: (e.target.value || null) as RecurrenceInput['priority'] })
          }
        >
          <option value="">Не задан</option>
          <option value="high">Высокий</option>
          <option value="normal">Обычный</option>
          <option value="low">Низкий</option>
        </select>
      </label>
    </div>
  );
}
