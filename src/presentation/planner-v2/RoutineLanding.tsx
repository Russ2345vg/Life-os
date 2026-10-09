import { buildPlannerRoute, type PlannerRoute } from './PlannerNavigation';

const moments = [
  {
    label: 'Утро',
    title: 'Утренние практики',
    description: 'Зарядка и утренний фокус',
    route: { view: 'morning' },
  },
  {
    label: 'День',
    title: 'Автопилот дня',
    description: 'Главное и следующие действия',
    route: { view: 'autopilot' },
  },
  {
    label: 'Пауза',
    title: 'Прогулка',
    description: 'Время для себя и свежих мыслей',
    route: { view: 'walks', page: 'overview' },
  },
  {
    label: 'Вечер',
    title: 'Вечерний ритуал',
    description: 'Подготовка ко сну',
    route: { view: 'sleep', from: 'routine' },
  },
] as const satisfies readonly {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly route: PlannerRoute;
}[];

export function RoutineLanding({
  onNavigate,
}: {
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  return (
    <section className="routine-page" aria-labelledby="routine-title">
      <header className="routine-page__heading">
        <p className="planner-eyebrow">Ежедневный ритм</p>
        <h1 id="routine-title">Распорядок</h1>
        <p>Выберите время дня — откроется его страница.</p>
      </header>
      <ol className="routine-timeline" aria-label="Моменты дня">
        {moments.map((moment) => (
          <li key={moment.label}>
            <a
              href={buildPlannerRoute(moment.route)}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onNavigate(moment.route);
              }}
            >
              <span className="routine-timeline__period">{moment.label}</span>
              <span className="routine-timeline__title">{moment.title}</span>
              <span className="routine-timeline__description">{moment.description}</span>
              <span className="routine-timeline__arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
