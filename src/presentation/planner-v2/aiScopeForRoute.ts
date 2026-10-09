import type { AiScope } from '../../application/ai/AiContext';
import type { PlannerRoute } from './PlannerNavigation';

export function aiScopeForRoute(route: PlannerRoute, today: string): AiScope {
  switch (route.view) {
    case 'today':
      return { section: 'today', date: today, tomorrow: route.day === 'tomorrow' };
    case 'routine':
    case 'morning':
    case 'autopilot':
      return { section: 'today', date: today };
    case 'sphere':
      return { section: 'spheres', date: today, selectedId: route.id };
    case 'spheres':
      return { section: 'spheres', date: today };
    case 'direction':
      return { section: 'directions', date: today, selectedId: route.id };
    case 'directions':
      return { section: 'directions', date: today };
    case 'needs':
      return { section: 'needs', date: today, ...(route.need ? { selectedId: route.need } : {}) };
    case 'goal':
      return { section: 'goals', date: today, selectedId: route.id };
    case 'goals':
    case 'planning':
    case 'new-goal':
      return { section: 'goals', date: today };
    case 'action':
      return { section: 'actions', date: today, selectedId: route.id };
    case 'actions':
    case 'new-action':
      return { section: 'actions', date: today };
    case 'time':
      return {
        section: 'actions',
        date: today,
        ...(route.actionId ? { selectedId: route.actionId } : {}),
      };
    case 'inbox':
      return { section: 'inbox', date: today };
    case 'walks':
      return { section: 'walks', date: today, ...(route.id ? { selectedId: route.id } : {}) };
    case 'diary':
      return { section: 'diary', date: route.date ?? today, period: route.period ?? 'day' };
    case 'memory':
      return { section: 'memory', date: today, ...(route.id ? { selectedId: route.id } : {}) };
    case 'sleep':
      return { section: 'sleep', date: today };
    case 'analytics':
      return {
        section: 'analytics',
        date: route.date ?? today,
        period: route.period ?? 'week',
        topic: route.topic ?? 'overview',
      };
    case 'account':
      return { section: 'account', date: today };
    case 'focus':
      return { section: 'today', date: today };
    case 'review':
      return { section: 'analytics', date: route.week ?? today, period: 'week' };
    case 'kanban':
    case 'calendar':
    case 'tree':
      return { section: route.section, date: today };
  }
}
