import { useEffect, useRef, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import {
  WALK_PREFERENCES_CHANGED,
  type WalkRegularityPreferences,
} from '../../../application/walk/WalkPreferences';
import { automaticPeriod } from '../../../domain/planner/PlanningPeriod';
import { walkError } from './useWalkState';

export function WalkPreferencesView({
  services,
  today,
}: {
  services: WalkServices;
  today: string;
}) {
  const [value, setValue] = useState<WalkRegularityPreferences | null>(null);
  const [count, setCount] = useState('');
  const [minutes, setMinutes] = useState('');
  const [actual, setActual] = useState({ count: 0, minutes: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = useRef(false);
  const period = automaticPeriod('week', today);
  useEffect(() => {
    let current = true;
    const refreshPreferences = (fromChange = false) =>
      void services.preferences
        .get()
        .then((next) => {
          if (current) {
            setValue(next);
            if (dirty.current) {
              if (fromChange) setMessage('Цель изменилась. Проверьте свои поля перед сохранением.');
            } else {
              setCount(next.weeklyCount?.toString() ?? '');
              setMinutes(next.weeklyMinutes?.toString() ?? '');
            }
          }
        })
        .catch((failure: unknown) => {
          if (current) setMessage(walkError(failure));
        });
    refreshPreferences();
    const onPreferencesChanged = () => refreshPreferences(true);
    window.addEventListener(WALK_PREFERENCES_CHANGED, onPreferencesChanged);
    const refresh = () =>
      void services.analytics.get(period.startDate, period.endDate).then((next) => {
        if (current)
          setActual({ count: next.completedCount, minutes: Math.round(next.durationMs / 60000) });
      });
    refresh();
    const off = services.changes.subscribe(refresh);
    return () => {
      current = false;
      window.removeEventListener(WALK_PREFERENCES_CHANGED, onPreferencesChanged);
      off();
    };
  }, [services, period.startDate, period.endDate]);
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const next = await services.preferences.save({
        weeklyCount: count === '' ? null : Number(count),
        weeklyMinutes: minutes === '' ? null : Number(minutes),
      });
      setValue(next);
      dirty.current = false;
      setMessage('Личная цель сохранена.');
    } catch (failure: unknown) {
      setMessage(walkError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="walk-panel walk-preferences">
      <h2>Личная цель на неделю</h2>
      <p>Цель необязательна. Пропущенная неделя не создаёт долг и не меняет историю.</p>
      {value && (
        <p>
          Эта неделя: {actual.count}
          {value.weeklyCount === null ? '' : ` из ${value.weeklyCount}`} прогулок, {actual.minutes}
          {value.weeklyMinutes === null ? '' : ` из ${value.weeklyMinutes}`} минут.
        </p>
      )}
      <form
        className="walk-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          Прогулок в неделю — необязательно
          <input
            type="number"
            min={1}
            max={7}
            step={1}
            value={count}
            onChange={(event) => {
              dirty.current = true;
              setCount(event.target.value);
            }}
          />
        </label>
        <label>
          Минут в неделю — необязательно
          <input
            type="number"
            min={1}
            max={10080}
            step={1}
            value={minutes}
            onChange={(event) => {
              dirty.current = true;
              setMinutes(event.target.value);
            }}
          />
        </label>
        <button disabled={busy}>Сохранить цель</button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
