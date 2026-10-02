import { useEffect, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { WalkSource } from '../../../application/walk/WalkContextResolver';
import type { Walk } from '../../../domain/walk/Walk';
import type { PlannerRoute } from '../PlannerNavigation';

export function WalkSourceLink({
  walk,
  services,
  onNavigate,
}: {
  walk: Walk;
  services: WalkServices;
  onNavigate: (route: PlannerRoute) => void;
}) {
  const [source, setSource] = useState<WalkSource | null>(null);
  useEffect(() => {
    let current = true;
    void services.context
      .resolve(walk)
      .then((next) => {
        if (current) setSource(next);
      })
      .catch(() => {
        if (current) setSource(null);
      });
    return () => {
      current = false;
    };
  }, [walk, services]);
  if (!source || source.kind === 'walks') return null;
  const route: PlannerRoute =
    source.kind === 'action' && source.id
      ? { view: 'action', id: source.id }
      : source.kind === 'goal' && source.id
        ? { view: 'goal', id: source.id }
        : { view: 'today' };
  return (
    <div className="walk-return">
      <span>Источник: {source.label}</span>
      {source.available ? (
        <button onClick={() => onNavigate(route)}>
          Вернуться к{' '}
          {source.kind === 'today' ? 'сегодня' : source.kind === 'goal' ? 'цели' : 'действию'}
        </button>
      ) : (
        <span>Источник недоступен</span>
      )}
    </div>
  );
}
