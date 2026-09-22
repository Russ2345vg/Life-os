import { buildPlannerRoute, type PlannerRoute } from './PlannerNavigation';

export function PlannerViewSwitcher({
  route,
  onNavigate,
}: {
  readonly route: PlannerRoute;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  const section =
    'section' in route ? route.section : route.view === 'actions' ? 'actions' : 'goals';
  const baseRoutes: readonly { label: string; route: PlannerRoute }[] = [
    { label: 'Список', route: { view: section } },
    ...(section === 'goals' ? [{ label: 'Фокус', route: { view: 'focus' } as const }] : []),
    { label: 'Канбан', route: { view: 'kanban', section } },
    { label: 'Календарь', route: { view: 'calendar', section } },
    ...(section === 'goals' ? [{ label: 'Древо', route: { view: 'tree', section } as const }] : []),
  ];
  const routes = baseRoutes.map((item) => ({
    ...item,
    route:
      'sphereId' in route &&
      route.sphereId &&
      (item.route.view === 'goals' || item.route.view === 'planning')
        ? { ...item.route, sphereId: route.sphereId }
        : item.route,
  }));
  return (
    <label className="planner-view-switcher">
      <span>Представление</span>
      <select
        value={buildPlannerRoute(
          route.view === 'goals'
            ? {
                view: 'goals',
                ...('sphereId' in route && route.sphereId ? { sphereId: route.sphereId } : {}),
              }
            : route,
        )}
        onChange={(event) => {
          const selected = routes.find((r) => buildPlannerRoute(r.route) === event.target.value);
          if (selected) onNavigate(selected.route);
        }}
      >
        {routes.map((r) => (
          <option key={r.label} value={buildPlannerRoute(r.route)}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
