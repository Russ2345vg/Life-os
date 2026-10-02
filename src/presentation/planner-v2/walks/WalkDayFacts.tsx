import { useEffect, useState } from 'react';
import { DayDate } from '../../../domain/day/DayDate';
import type { WalkServices } from '../../../application/walk/WalkServices';
import { walkError } from './useWalkState';
export function WalkDayFacts({ services, date }: { services: WalkServices; date: string }) {
  const [facts, setFacts] = useState<{ completedCount: number; durationMs: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const read = () => {
      void services.analytics
        .getDayFacts(DayDate.create(date))
        .then((next) => {
          if (alive) {
            setFacts(next);
            setError('');
          }
        })
        .catch((failure: unknown) => {
          if (alive) setError(walkError(failure));
        });
    };
    read();
    const off = services.changes.subscribe(read);
    return () => {
      alive = false;
      off();
    };
  }, [services, date]);
  return (
    <aside aria-label="Прогулки за день">
      <h2>Прогулки за день</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : facts ? (
        <p>
          Завершено прогулок: {facts.completedCount} · {Math.round(facts.durationMs / 60000)} минут
        </p>
      ) : (
        <p role="status">Загружаем факты прогулок…</p>
      )}
    </aside>
  );
}
