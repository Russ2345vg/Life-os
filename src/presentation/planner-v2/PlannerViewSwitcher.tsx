import { buildPlannerV2Route, type PlannerV2Route } from './PlannerV2Navigation';

export function PlannerViewSwitcher({
  route,
  onNavigate,
}: {
  readonly route: PlannerV2Route;
  readonly onNavigate: (route: PlannerV2Route) => void;
}) {
  const section =
    'section' in route ? route.section : route.view === 'actions' ? 'actions' : 'goals';
  const routes: readonly { label: string; route: PlannerV2Route }[] = [
    { label: 'Список', route: { view: section } },
    ...(section === 'goals' ? [{ label: 'Фокус', route: { view: 'focus' } as const }] : []),
    { label: 'Канбан', route: { view: 'kanban', section } },
    { label: 'Календарь', route: { view: 'calendar', section } },
    { label: 'Древо', route: { view: 'tree', section } },
  ];
  return (
    <label className="planner-view-switcher">
      <span>Представление</span>
      <select
        value={buildPlannerV2Route(route)}
        onChange={(event) => {
          const selected = routes.find((r) => buildPlannerV2Route(r.route) === event.target.value);
          if (selected) onNavigate(selected.route);
        }}
      >
        {routes.map((r) => (
          <option key={r.label} value={buildPlannerV2Route(r.route)}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
