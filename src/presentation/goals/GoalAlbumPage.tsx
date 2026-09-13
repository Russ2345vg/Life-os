import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { GOAL_STATUS, type Goal } from '../../domain';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import '../styles/goal-album.css';
import { GoalCard, type GoalCardVariant } from './GoalCard';
import { buildGoalAlbumRoute, type GoalAlbumRoute } from './GoalAlbumNavigation';
import { createGoalAlbumLoader, type GoalAlbumQueries } from './GoalAlbumLoader';
import {
  groupGoalAlbumCards,
  selectGoalAlbumCards,
  type GoalAlbumFilter,
  type GoalAlbumModel,
  type GoalAlbumViewMode,
  type GoalCardViewModel,
} from './goalAlbumPresentation';
import { createGoalAlbumLoadController, type GoalAlbumLoadState } from './GoalAlbumPageController';
import { GoalDetailPage } from './GoalDetailPage';
import { GoalCreatePage } from './GoalCreatePage';
import { GoalEditPage } from './GoalEditPage';
import type {
  ArchiveGoal,
  CreateGoal,
  DeletePilotGoal,
  GetGoalById,
  UpdateGoal,
} from '../../application';

export type { GoalAlbumLoadState } from './GoalAlbumPageController';
// eslint-disable-next-line react-refresh/only-export-components -- preserve the public async load contract beside the page.
export { settleGoalAlbumLoad } from './GoalAlbumPageController';

export interface GoalAlbumPageProps extends GoalAlbumQueries {
  readonly renderManagement?: ((goal: Goal, onChanged: () => void) => ReactNode) | undefined;
  readonly route: GoalAlbumRoute;
  readonly getGoalById: Pick<GetGoalById, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly updateGoal: Pick<UpdateGoal, 'execute'>;
  readonly archiveGoal: Pick<ArchiveGoal, 'execute'>;
  readonly deleteGoal: Pick<DeletePilotGoal, 'execute'>;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}

export interface GoalAlbumScreenProps {
  readonly state: GoalAlbumLoadState;
  readonly filter: GoalAlbumFilter;
  readonly viewMode: GoalAlbumViewMode;
  readonly onFilterChange: (filter: GoalAlbumFilter) => void;
  readonly onViewModeChange: (mode: GoalAlbumViewMode) => void;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
  readonly onRetry: () => void;
}

const FILTER_OPTIONS: readonly { readonly value: GoalAlbumFilter; readonly label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: GOAL_STATUS.active, label: 'Активные' },
  { value: GOAL_STATUS.paused, label: 'На паузе' },
  { value: GOAL_STATUS.future, label: 'Будущие' },
  { value: GOAL_STATUS.achieved, label: 'Достигнутые' },
  { value: GOAL_STATUS.archived, label: 'Архив' },
];

const VIEW_MODE_OPTIONS: readonly { readonly value: GoalAlbumViewMode; readonly label: string }[] =
  [
    { value: 'grid', label: 'Сетка' },
    { value: 'by-direction', label: 'По направлениям' },
  ];

export function GoalAlbumPage(props: GoalAlbumPageProps): ReactElement {
  const [mutationRevision, setMutationRevision] = useState(0);
  const notifyMutation = useCallback(() => {
    setMutationRevision((current) => current + 1);
  }, []);
  useSyncContentChanged('goals', notifyMutation);
  useSyncContentChanged('directions', notifyMutation);
  const loader = useMemo(() => {
    void mutationRevision;
    return createGoalAlbumLoader({
      getGoals: props.getGoals,
      getDirections: props.getDirections,
      getSpheres: props.getSpheres,
    });
  }, [props.getDirections, props.getGoals, props.getSpheres, mutationRevision]);
  const [state, setState] = useState<GoalAlbumLoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<GoalAlbumFilter>('all');
  const [viewMode, setViewMode] = useState<GoalAlbumViewMode>('grid');
  const loadController = useMemo(
    () => createGoalAlbumLoadController({ loader, publish: setState }),
    [loader],
  );

  useEffect(() => {
    loadController.activate(props.route);
    return loadController.cancel;
  }, [loadController, props.route]);

  if (props.route.view === 'detail') {
    return (
      <GoalDetailPage
        key={props.route.goalId}
        renderManagement={props.renderManagement}
        goalId={props.route.goalId}
        getGoalById={props.getGoalById}
        getDirections={props.getDirections}
        getSpheres={props.getSpheres}
        onBack={() => props.onRouteChange({ view: 'album' })}
        onEdit={(goalId) => props.onRouteChange({ view: 'edit', goalId })}
        archiveGoal={props.archiveGoal}
        deleteGoal={props.deleteGoal}
        onMutated={notifyMutation}
      />
    );
  }

  if (props.route.view === 'create') {
    return (
      <GoalCreatePage
        getDirections={props.getDirections}
        getSpheres={props.getSpheres}
        createGoal={props.createGoal}
        onMutated={notifyMutation}
        onRouteChange={props.onRouteChange}
      />
    );
  }

  if (props.route.view === 'edit') {
    return (
      <GoalEditPage
        goalId={props.route.goalId}
        getGoalById={props.getGoalById}
        getDirections={props.getDirections}
        getSpheres={props.getSpheres}
        updateGoal={props.updateGoal}
        onMutated={notifyMutation}
        onRouteChange={props.onRouteChange}
      />
    );
  }

  return (
    <GoalAlbumScreen
      state={state}
      filter={filter}
      viewMode={viewMode}
      onFilterChange={setFilter}
      onViewModeChange={setViewMode}
      onRouteChange={props.onRouteChange}
      onRetry={() => loadController.retry(props.route)}
    />
  );
}

export function GoalAlbumScreen({
  state,
  filter,
  viewMode,
  onFilterChange,
  onViewModeChange,
  onRouteChange,
  onRetry,
}: GoalAlbumScreenProps): ReactElement {
  if (state.status === 'loading') {
    return (
      <GoalAlbumFrame onRouteChange={onRouteChange}>
        <p className="goal-album-load-state" role="status">
          Загружаем цели…
        </p>
      </GoalAlbumFrame>
    );
  }

  if (state.status === 'error') {
    return (
      <GoalAlbumFrame onRouteChange={onRouteChange}>
        <section className="goal-album-load-state" role="alert">
          <p>Не удалось загрузить Альбом целей. Попробуйте ещё раз.</p>
          <button type="button" onClick={onRetry}>
            Повторить
          </button>
        </section>
      </GoalAlbumFrame>
    );
  }

  if (state.model.cards.length === 0) {
    return (
      <GoalAlbumFrame onRouteChange={onRouteChange}>
        <section className="goal-album-empty-state">
          <h2>В Альбоме пока нет целей</h2>
          <p>Добавьте первую цель, чтобы собрать картину будущего.</p>
          <GoalAlbumRouteLink
            className="goal-album-create-link"
            route={{ view: 'create' }}
            onRouteChange={onRouteChange}
          >
            Добавить цель
          </GoalAlbumRouteLink>
        </section>
      </GoalAlbumFrame>
    );
  }

  const visibleCards = selectGoalAlbumCards(state.model.cards, filter);

  return (
    <GoalAlbumFrame onRouteChange={onRouteChange}>
      <GoalAlbumOverview model={state.model} />
      <section className="goal-album-controls" aria-label="Настройки отображения альбома">
        <div className="goal-album-filters" role="group" aria-label="Фильтр целей по статусу">
          {FILTER_OPTIONS.map((option) => (
            <button
              className="goal-album-filter"
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="goal-album-view-modes" role="group" aria-label="Режим отображения целей">
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              className="goal-album-view-mode"
              type="button"
              aria-pressed={viewMode === option.value}
              onClick={() => onViewModeChange(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {visibleCards.length === 0 ? (
        <section className="goal-album-filter-empty-state">
          <h2>По выбранному фильтру целей нет</h2>
          <button type="button" onClick={() => onFilterChange('all')}>
            Показать все
          </button>
        </section>
      ) : viewMode === 'grid' ? (
        <GoalCardGrid goals={visibleCards} onRouteChange={onRouteChange} />
      ) : (
        <GoalAlbumGroupedCards goals={visibleCards} onRouteChange={onRouteChange} />
      )}
    </GoalAlbumFrame>
  );
}

function GoalAlbumFrame({
  children,
  onRouteChange,
}: {
  readonly children: ReactElement | readonly ReactElement[];
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}): ReactElement {
  return (
    <main className="goal-album-page">
      <header className="goal-album-header">
        <h1>Альбом целей</h1>
        <GoalAlbumRouteLink
          className="goal-album-create-link"
          route={{ view: 'create' }}
          onRouteChange={onRouteChange}
        >
          Добавить цель
        </GoalAlbumRouteLink>
      </header>
      {children}
    </main>
  );
}

function GoalAlbumOverview({ model }: { readonly model: GoalAlbumModel }): ReactElement {
  return (
    <section className="goal-album-overview" aria-labelledby="goal-album-overview-title">
      <h2 id="goal-album-overview-title">Картина будущего</h2>
      <dl className="goal-album-kpis">
        <div>
          <dt>Активные</dt>
          <dd>{model.counts.active}</dd>
        </div>
        <div>
          <dt>Будущие</dt>
          <dd>{model.counts.future}</dd>
        </div>
        <div>
          <dt>Достигнутые</dt>
          <dd>{model.counts.achieved}</dd>
        </div>
        <div>
          <dt>Всего целей</dt>
          <dd>{model.counts.total}</dd>
        </div>
      </dl>
    </section>
  );
}

function GoalCardGrid({
  goals,
  onRouteChange,
  variant = 'default',
}: {
  readonly goals: readonly GoalCardViewModel[];
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
  readonly variant?: GoalCardVariant;
}): ReactElement {
  return (
    <div
      className={
        variant === 'compact'
          ? 'goal-album-card-grid goal-album-card-grid--compact'
          : 'goal-album-card-grid'
      }
    >
      {goals.map((goal) => (
        <GoalCard
          goal={goal}
          onOpen={(goalId) => onRouteChange({ view: 'detail', goalId })}
          variant={variant}
          key={goal.id}
        />
      ))}
    </div>
  );
}

function GoalAlbumGroupedCards({
  goals,
  onRouteChange,
}: {
  readonly goals: readonly GoalCardViewModel[];
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}): ReactElement {
  const groups = groupGoalAlbumCards(goals);
  return (
    <div className="goal-album-groups">
      {groups.spheres.map((sphere) => (
        <section className="goal-album-sphere-group" key={sphere.id}>
          <GoalAlbumSphereHeader
            name={sphere.name}
            goalCount={sphere.directions.reduce(
              (count, direction) => count + direction.goals.length,
              0,
            )}
          />
          {sphere.directions.map((direction) => (
            <GoalAlbumDirectionSection
              direction={direction}
              onRouteChange={onRouteChange}
              key={direction.id}
            />
          ))}
        </section>
      ))}

      {groups.withoutSphere.length > 0 ? (
        <section className="goal-album-sphere-group">
          <GoalAlbumSphereHeader
            name="Без сферы"
            goalCount={groups.withoutSphere.reduce(
              (count, direction) => count + direction.goals.length,
              0,
            )}
          />
          {groups.withoutSphere.map((direction) => (
            <GoalAlbumDirectionSection
              direction={direction}
              onRouteChange={onRouteChange}
              key={direction.id}
            />
          ))}
        </section>
      ) : null}

      {groups.withoutDirection.length > 0 ? (
        <section className="goal-album-sphere-group">
          <GoalAlbumSphereHeader
            name="Без направления"
            goalCount={groups.withoutDirection.length}
          />
          <GoalCardGrid
            goals={groups.withoutDirection}
            onRouteChange={onRouteChange}
            variant="compact"
          />
        </section>
      ) : null}

      {groups.missingDirection.length > 0 ? (
        <section className="goal-album-sphere-group">
          <GoalAlbumSphereHeader
            name="Направление недоступно"
            goalCount={groups.missingDirection.length}
          />
          <GoalCardGrid
            goals={groups.missingDirection}
            onRouteChange={onRouteChange}
            variant="compact"
          />
        </section>
      ) : null}
    </div>
  );
}

function GoalAlbumDirectionSection({
  direction,
  onRouteChange,
}: {
  readonly direction: ReturnType<typeof groupGoalAlbumCards>['withoutSphere'][number];
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}): ReactElement {
  return (
    <section className="goal-album-direction-group">
      <header className="goal-album-direction-header">
        <h3>{direction.name}</h3>
        <span>{formatGoalCount(direction.goals.length)}</span>
      </header>
      <GoalCardGrid goals={direction.goals} onRouteChange={onRouteChange} variant="compact" />
    </section>
  );
}

function GoalAlbumSphereHeader({
  name,
  goalCount,
}: {
  readonly name: string;
  readonly goalCount: number;
}): ReactElement {
  return (
    <header className="goal-album-sphere-header">
      <h2>{name}</h2>
      <span>{formatGoalCount(goalCount)}</span>
    </header>
  );
}

function formatGoalCount(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return `${count} целей`;
  if (remainder10 === 1) return `${count} цель`;
  if (remainder10 >= 2 && remainder10 <= 4) return `${count} цели`;
  return `${count} целей`;
}

function GoalAlbumRouteLink({
  children,
  className,
  route,
  onRouteChange,
}: {
  readonly children: string;
  readonly className?: string;
  readonly route: GoalAlbumRoute;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}): ReactElement {
  const openRoute = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    event.preventDefault();
    onRouteChange(route);
  };
  return (
    <a className={className} href={buildGoalAlbumRoute(route)} onClick={openRoute}>
      {children}
    </a>
  );
}

function isUnmodifiedPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
