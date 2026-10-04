import type { AiScope, AiSource } from '../../application/ai/AiContext';
import type { PlannerRoute } from './PlannerNavigation';

export function routeForSource(item: AiSource, scope: AiScope): PlannerRoute | null {
  switch (item.kind) {
    case 'actions':
      return { view: 'action', id: item.id };
    case 'goals':
      return { view: 'goal', id: item.id };
    case 'spheres':
      return { view: 'sphere', id: item.id };
    case 'directions':
      return { view: 'direction', id: item.id };
    case 'walks':
      return { view: 'walks', id: item.id };
    case 'memory':
      return { view: 'memory', id: item.id };
    case 'diary':
      return item.date
        ? {
            view: 'diary',
            period:
              scope.section === 'analytics'
                ? 'day'
                : scope.period === 'week' || scope.period === 'month'
                  ? scope.period
                  : 'day',
            date: item.date,
          }
        : { view: 'diary', period: 'day' };
    case 'sleep':
      return { view: 'sleep' };
    case 'inbox':
      return { view: 'inbox' };
    default:
      return null;
  }
}
