import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { SleepScheduleService } from '../../../application/sleep/SleepScheduleService';
import type { WalkScheduleDay } from '../../../application/walk/WalkScheduleProjection';
import { SUNSET_WALK_SETTINGS_CHANGED } from '../../../application/walk/SunsetWalkSettings';

const SunsetWalkContext = createContext<{ services: WalkServices | undefined; timeZone: string }>({
  services: undefined,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
export function SunsetWalkProvider({
  services,
  schedule,
  children,
}: {
  services: WalkServices | undefined;
  schedule: Pick<SleepScheduleService, 'getState'> &
    Partial<Pick<SleepScheduleService, 'subscribeSettings'>>;
  children: ReactNode;
}) {
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  useEffect(() => {
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void schedule
        .getState()
        .then((value) => {
          if (generation === current)
            setTimeZone(
              value.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            );
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = schedule.subscribeSettings?.(() => refresh());
    window.addEventListener('focus', refresh);
    return () => {
      generation++;
      unsubscribe?.();
      window.removeEventListener('focus', refresh);
    };
  }, [schedule]);
  return (
    <SunsetWalkContext.Provider value={{ services, timeZone }}>
      {children}
    </SunsetWalkContext.Provider>
  );
}
export function useSunsetWalkContext() {
  return useContext(SunsetWalkContext);
}
export function useSunsetWalkRange(from: string, to: string) {
  const { services, timeZone } = useSunsetWalkContext();
  const [state, setState] = useState<{ key: string; days: ReadonlyMap<string, WalkScheduleDay> }>({
    key: '',
    days: new Map(),
  });
  const key = `${from}:${to}:${timeZone}`;
  useEffect(() => {
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      if (!services) return;
      const dates: string[] = [];
      for (
        const day = new Date(`${from}T12:00:00Z`);
        day.toISOString().slice(0, 10) <= to && dates.length < 31;
        day.setUTCDate(day.getUTCDate() + 1)
      )
        dates.push(day.toISOString().slice(0, 10));
      void Promise.all(dates.map((date) => services.sunset.schedule.forPlannerDate(date, timeZone)))
        .then((days) => {
          if (generation === current)
            setState({ key, days: new Map(days.map((day) => [day.date, day])) });
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(SUNSET_WALK_SETTINGS_CHANGED, refresh);
    return () => {
      generation++;
      window.removeEventListener(SUNSET_WALK_SETTINGS_CHANGED, refresh);
    };
  }, [from, to, key, services, timeZone]);
  return state.key === key ? state.days : new Map<string, WalkScheduleDay>();
}
export function useSunsetWalkDay(date: string | null) {
  const { services, timeZone } = useSunsetWalkContext();
  const [state, setState] = useState<{
    day: WalkScheduleDay | null;
    date: string | null;
    error: string;
  }>({ day: null, date: null, error: '' });
  useEffect(() => {
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      if (!services || !date) return;
      void services.sunset.schedule
        .forPlannerDate(date, timeZone)
        .then((day) => {
          if (generation === current) setState({ day, date, error: '' });
        })
        .catch((error: unknown) => {
          if (generation === current)
            setState({
              day: null,
              date,
              error:
                error instanceof Error ? error.message : 'Не удалось прочитать время прогулки.',
            });
        });
    };
    refresh();
    window.addEventListener(SUNSET_WALK_SETTINGS_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      generation++;
      window.removeEventListener(SUNSET_WALK_SETTINGS_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [date, services, timeZone]);
  return {
    day: state.date === date ? state.day : null,
    error: state.date === date ? state.error : '',
    timeZone,
  };
}

export function sunsetWalkLabel(day: WalkScheduleDay, timeZone: string): string {
  if (day.kind === 'disabled') return 'Автоматическое время выключено';
  if (day.kind === 'no-sunset')
    return 'В этот день заката нет — автоматическая прогулка не назначена';
  const format = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `Прогулка ${format.format(new Date(day.walkStartAt!))} · Закат ${format.format(new Date(day.sunsetAt!))}`;
}
export function WalkTimeLabel({ date }: { date: string | null }) {
  const { day, timeZone, error } = useSunsetWalkDay(date);
  return error ? (
    <span role="alert">{error}</span>
  ) : day ? (
    <span>{sunsetWalkLabel(day, timeZone)}</span>
  ) : null;
}
