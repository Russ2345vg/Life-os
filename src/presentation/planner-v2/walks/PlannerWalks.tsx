import type { MemoryServices } from '../../../application/memory/MemoryServices';
import type { DiaryService } from '../../../application/diary/DiaryService';
import type { PlannerOption } from '../PlannerActionForm';
import { WalkMemoryTransfer } from './WalkMemoryTransfer';
import { WalkDiaryTransfer } from './WalkDiaryTransfer';
import { WalkCaptures } from './WalkCaptures';
import { WalkAnalyticsView } from './WalkAnalytics';
import { WalkPlan } from './WalkPlan';
import { WalkSourceLink } from './WalkSourceLink';
import { WalkHistory } from './WalkHistory';
import { WalkDetailsExtras } from './WalkDetailsExtras';
import { useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { Walk } from '../../../domain/walk/Walk';
import type { PlannerRoute } from '../PlannerNavigation';
import { AppIcon } from '../../components/AppIcon';
import { WalkStartForm, DEFAULT_WALK } from './WalkStartForm';
import { WalkActive } from './WalkActive';
import { WalkCompletion } from './WalkCompletion';
import { useWalkState, useWalkMutation, walkIntentLabel } from './useWalkState';
import type { StartWalkInput } from '../../../application/walk/WalkCommands';

export function PlannerWalks({
  services,
  route,
  onNavigate,
  today,
  memory,
  diary,
  spheres,
}: {
  services: WalkServices;
  route: Extract<PlannerRoute, { view: 'walks' }>;
  onNavigate: (route: PlannerRoute) => void;
  today: string;
  memory?: MemoryServices | undefined;
  diary: DiaryService;
  spheres: readonly PlannerOption[];
}) {
  const { data, error, refresh } = useWalkState(services, route.id);
  const [setup, setSetup] = useState(false);
  const mutation = useWalkMutation();
  const go = (page: NonNullable<typeof route.page>) => onNavigate({ view: 'walks', page });
  const open = (walk: Walk) => onNavigate({ view: 'walks', id: walk.id.toString() });
  const start = (input: Omit<StartWalkInput, 'requestId'>) => {
    const prepared = {
      ...input,
      origin: route.origin ?? ('walks' as const),
      ...(route.sourceGoalId
        ? { linkedEntity: { type: 'goal' as const, id: route.sourceGoalId } }
        : {}),
    };
    void mutation.perform(
      `start:${JSON.stringify(prepared)}`,
      (requestId) => services.commands.start({ ...prepared, requestId }),
      (walk) => {
        setSetup(false);
        open(walk);
      },
    );
  };
  const selected = route.id
    ? data?.selected
    : route.page === 'active' && data?.active.length === 1
      ? data.active[0]
      : null;
  const active = selected?.status === 'running' || selected?.status === 'paused';
  return (
    <div className="planner-walks">
      <header className="planner-page-heading">
        <div>
          <h1>Прогулки</h1>
          <p className="planner-eyebrow">Время для себя и свежих мыслей</p>
        </div>
        <span className="walk-date">{today}</span>
      </header>
      {!selected && (
        <nav className="walk-tabs" aria-label="Раздел прогулок">
          {(
            [
              ['overview', 'Обзор'],
              ['plan', 'План'],
              ['history', 'История'],
              ['captures', 'Мысли'],
              ['analytics', 'Аналитика'],
            ] as const
          ).map(([page, label]) => (
            <button
              key={page}
              aria-current={(route.page ?? 'overview') === page ? 'page' : undefined}
              onClick={() => go(page)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {(error || mutation.error) && (
        <div role="alert">
          <p>{error || mutation.error}</p>
          <button onClick={() => void refresh()}>Обновить данные</button>
        </div>
      )}
      {!data ? (
        <p role="status">Загружаем прогулки…</p>
      ) : route.id && !selected ? (
        <section className="walk-panel">
          <h2>Прогулка не найдена</h2>
          <button onClick={() => go('history')}>К истории</button>
        </section>
      ) : selected ? (
        <>
          <button className="walk-back" onClick={() => go('overview')}>
            ← К обзору
          </button>
          {active ? (
            <WalkActive
              walk={selected}
              services={services}
              captures={data.captures.filter((capture) => capture.walkId.equals(selected.id))}
              onFinished={open}
            />
          ) : selected.status === 'planned' ? (
            <section className="walk-panel">
              <h2>Запланированная прогулка</h2>
              <p>{selected.date.toString()}</p>
              <button
                disabled={mutation.busy}
                onClick={() =>
                  void mutation.perform(
                    `startExisting:${selected.id}:${selected.version}`,
                    (requestId) =>
                      services.commands.startExisting({
                        walkId: selected.id.toString(),
                        expectedVersion: selected.version,
                        requestId,
                        mode: 'stopwatch',
                        targetMinutes: null,
                        question: null,
                      }),
                    open,
                  )
                }
              >
                Начать эту прогулку
              </button>
            </section>
          ) : (
            <>
              <WalkCompletion
                key={selected.id.toString()}
                walk={selected}
                services={services}
                onDone={() => go('overview')}
              />
              {selected.status === 'completed' && (
                <WalkDiaryTransfer walk={selected} diary={diary} onNavigate={onNavigate} />
              )}
              {memory && selected.status === 'completed' && !selected.deletedAt && (
                <WalkMemoryTransfer
                  walk={selected}
                  services={services}
                  memory={memory}
                  today={today}
                  onNavigate={onNavigate}
                />
              )}
              <WalkDetailsExtras
                services={services}
                walk={selected}
                captures={data.captures.filter((capture) => capture.walkId.equals(selected.id))}
                onChanged={() => void refresh()}
              />
            </>
          )}
          <WalkSourceLink walk={selected} services={services} onNavigate={onNavigate} />
        </>
      ) : route.page === 'analytics' ? (
        <WalkAnalyticsView
          services={services}
          today={today}
          onOpen={(id) => onNavigate({ view: 'walks', id })}
        />
      ) : route.page === 'plan' ? (
        <WalkPlan services={services} today={today} onNavigate={onNavigate} />
      ) : route.page === 'history' ? (
        <WalkHistory
          services={services}
          route={route}
          onNavigate={onNavigate}
          onOpen={open}
          spheres={spheres}
        />
      ) : route.page === 'captures' ? (
        <WalkCaptures captures={data.captures} services={services} onNavigate={onNavigate} />
      ) : (
        <>
          {data.active.length > 1 ? (
            <section className="walk-panel walk-conflict">
              <span className="walk-label">Нужно выбрать</span>
              <h2>Открыты несколько прогулок</h2>
              <p>
                Все записи сохранены. Откройте нужную; остальные можно явно завершить или прервать.
                Новый старт пока недоступен.
              </p>
              {data.active.map((walk) => (
                <div className="walk-conflict-row" key={walk.id.toString()}>
                  <span>
                    <strong>{walkIntentLabel(walk)}</strong>
                    <small>{walk.startedAt?.toLocaleString('ru-RU')}</small>
                  </span>
                  <button onClick={() => open(walk)}>Открыть</button>
                </div>
              ))}
            </section>
          ) : (
            <div className="walk-grid">
              <section className="walk-panel walk-hero">
                <span className="walk-label">
                  <AppIcon name="walks" />
                  Пауза для себя
                </span>
                <h2>{data.active.length ? 'Прогулка продолжается' : 'Выйти на прогулку'}</h2>
                <p className="walk-hero-copy">
                  Смените обстановку, побудьте на улице.
                  <br /> Мысли и итоги можно сохранить, если захочется.
                </p>
                <div className="walk-start-context">
                  <span>Без обязательного вопроса</span>
                  <span>В своём темпе</span>
                </div>
                <div className="walk-start-actions">
                  {data.active[0] ? (
                    <button className="planner-primary" onClick={() => open(data.active[0]!)}>
                      Вернуться к прогулке
                    </button>
                  ) : (
                    <>
                      <button
                        className="planner-primary"
                        disabled={mutation.busy}
                        onClick={() => start(DEFAULT_WALK)}
                      >
                        Начать прогулку
                      </button>
                      <button onClick={() => setSetup(true)}>Настроить</button>
                    </>
                  )}
                </div>
                <p className="walk-start-hint">Время сохранится, даже если закрыть приложение.</p>
              </section>
              <aside className="walk-side">
                <WalkAnalyticsView
                  services={services}
                  today={today}
                  compact
                  onOpen={(id) => onNavigate({ view: 'walks', id })}
                />
                <button onClick={() => go('history')}>Открыть историю</button>
              </aside>
            </div>
          )}
          <section className="walk-recent">
            <div className="walk-section-heading">
              <h2>Последние прогулки</h2>
              <button className="walk-text-action" onClick={() => go('history')}>
                Вся история
              </button>
            </div>
            <WalkRows walks={data.history.items.slice(0, 3)} onOpen={open} />
          </section>
        </>
      )}
      {setup && (
        <WalkStartForm
          spheres={spheres}
          onStart={start}
          onClose={() => setSetup(false)}
          busy={mutation.busy}
          error={mutation.error}
        />
      )}
    </div>
  );
}
export function WalkRows({
  walks,
  onOpen,
}: {
  walks: readonly Walk[];
  onOpen: (walk: Walk) => void;
}) {
  if (!walks.length)
    return (
      <div className="walk-first-empty">
        <p>Здесь будет ваша история прогулок. Начните, когда будет удобно.</p>
      </div>
    );
  return (
    <div className="walk-history">
      {walks.map((walk) => (
        <article className="walk-row" key={walk.id.toString()}>
          <span className="walk-row-icon">
            <AppIcon name="walks" />
          </span>
          <div>
            <strong>{walkIntentLabel(walk)}</strong>
            <p>
              {walk.result ??
                (walk.status === 'abandoned'
                  ? 'Прервана'
                  : walk.status === 'completed'
                    ? 'Без итога'
                    : walk.status === 'planned'
                      ? 'Запланирована'
                      : 'Активная прогулка')}
            </p>
            <small>{walk.date.toString()}</small>
          </div>
          <div className="walk-row-end">
            {walk.actualDurationMilliseconds !== null && (
              <span>{Math.round(walk.actualDurationMilliseconds / 60000)} мин</span>
            )}
          </div>
          <button
            className="walk-detail-button"
            aria-label={`Открыть прогулку ${walk.date}`}
            onClick={() => onOpen(walk)}
          >
            <AppIcon name="arrow-right" />
          </button>
        </article>
      ))}
    </div>
  );
}
