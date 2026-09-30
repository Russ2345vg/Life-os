import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLifeOsApplication } from '../../src/app/composition/createLifeOsApplication';
import type { LifeOsApplication } from '../../src/app/composition/LifeOsApplication';
import { DayDate, EntityId, LifeActionTitle } from '../../src/domain';
import { LifeOsIndexedDb } from '../../src/infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { PlannerLibraryWorkspace } from '../../src/presentation/planner-v2/PlannerLibraryWorkspace';
import { PlanningProvider } from '../../src/presentation/planner-v2/PlanningContext';
import type { PlannerRoute } from '../../src/presentation/planner-v2/PlannerNavigation';
import { VoiceInputProvider } from '../../src/app/providers/VoiceInputProvider';
import '../../src/presentation/styles/global.css';
import '../../src/presentation/planner-v2/planner-v2.css';
import '../../src/presentation/planner-v2/planner-master.css';
import '../../src/presentation/planner-v2/planner-premium.css';

type Reader = 'goals' | 'directions' | 'spheres' | 'actions' | 'ideas' | 'focus' | 'capacity';
const counts: Record<Reader, number> = {
  goals: 0,
  directions: 0,
  spheres: 0,
  actions: 0,
  ideas: 0,
  focus: 0,
  capacity: 0,
};
let activeSubscriptions = 0;
let failIdeas = new URLSearchParams(location.search).get('fail') === '1';
let holdNextFocus = false;
let releaseFocus: (() => void) | null = null;
let started = 0;
let elapsed = 0;
let pendingReads = 0;
const databaseReads: Record<string, number> = {};
const originalGetAll = IDBObjectStore.prototype.getAll;
IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
  databaseReads[this.name] = (databaseReads[this.name] ?? 0) + 1;
  return originalGetAll.apply(this, args);
};
const announce = () => window.dispatchEvent(new Event('library-metrics'));
async function measured<T>(name: Reader, read: () => Promise<T>): Promise<T> {
  counts[name]++;
  pendingReads++;
  announce();
  try {
    return await read();
  } finally {
    pendingReads--;
    elapsed = performance.now() - started;
    announce();
  }
}
function resetMetrics() {
  for (const key of Object.keys(counts) as Reader[]) counts[key] = 0;
  for (const key of Object.keys(databaseReads)) delete databaseReads[key];
  started = performance.now();
  elapsed = 0;
  announce();
}

async function bootstrap() {
  const database = new LifeOsIndexedDb();
  const subscribe = database.subscribeCommits.bind(database);
  database.subscribeCommits = (listener) => {
    activeSubscriptions++;
    const stop = subscribe(listener);
    announce();
    return () => {
      stop();
      activeSubscriptions--;
      announce();
    };
  };
  const app = await createLifeOsApplication({ database });
  const size = Number(new URLSearchParams(location.search).get('size') ?? 3);
  const goal = await app.createGoal.execute({ title: 'Тестовая цель', status: 'active' });
  if (!goal.ok) throw goal.error;
  for (let index = 0; index < size; index++) {
    const created = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create(`Действие ${String(index + 1).padStart(4, '0')}`),
      plannedDate: DayDate.create('2026-09-30'),
      ...(index === 0 ? { goalId: goal.value.id } : {}),
    });
    if (!created.ok) throw created.error;
  }
  await app.plannerInbox.capture({ title: 'Сохранённая мысль' });
  await app.plannerFocus.setRole('2026-09-30', goal.value.id.toString(), 'primary');
  const goals = app.getGoals.execute.bind(app.getGoals);
  const directions = app.getDirections.execute.bind(app.getDirections);
  const spheres = app.getSpheres.execute.bind(app.getSpheres);
  const actions = app.plannerCatalog.actions.bind(app.plannerCatalog);
  const ideas = app.plannerInbox.list.bind(app.plannerInbox);
  const focus = app.plannerFocus.get.bind(app.plannerFocus);
  const capacity = app.timeCapacity.get.bind(app.timeCapacity);
  app.getGoals.execute = () => measured('goals', goals);
  app.getDirections.execute = () => measured('directions', directions);
  app.getSpheres.execute = () => measured('spheres', spheres);
  app.plannerCatalog.actions = () => measured('actions', actions);
  app.plannerInbox.list = () =>
    measured('ideas', () =>
      failIdeas ? Promise.reject(new Error('Проверка ошибки чтения')) : ideas(),
    );
  app.plannerFocus.get = (date) => {
    const held = holdNextFocus;
    holdNextFocus = false;
    return measured('focus', async () => {
      const value = await focus(date);
      if (held)
        await new Promise<void>((resolve) => {
          releaseFocus = resolve;
          announce();
        });
      return value;
    });
  };
  app.timeCapacity.get = () => measured('capacity', capacity);
  window.addEventListener('pagehide', () => app.close(), { once: true });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <VoiceInputProvider>
        <Fixture app={app} />
      </VoiceInputProvider>
    </StrictMode>,
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Standalone browser test entry point.
function Fixture({ app }: { readonly app: LifeOsApplication }) {
  const [route, setRoute] = useState<PlannerRoute>({ view: 'actions' });
  const [today, setToday] = useState('2026-09-30');
  const [mounted, setMounted] = useState(true);
  const [metrics, setMetrics] = useState('');
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const update = () =>
      setMetrics(
        JSON.stringify({
          counts,
          databaseReads,
          pendingReads,
          activeSubscriptions,
          elapsed,
          heldFocus: releaseFocus !== null,
        }),
      );
    const message = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data === 'library-reset') resetMetrics();
      if (event.data === 'library-fail') failIdeas = true;
      if (event.data === 'library-recover') failIdeas = false;
      if (event.data === 'library-goals') setRoute({ view: 'goals' });
      if (event.data === 'library-actions') setRoute({ view: 'actions' });
      if (event.data === 'library-hold-focus') {
        holdNextFocus = true;
        void app.createGoal
          .execute({ title: 'Фоновая цель', status: 'active' })
          .catch((reason: unknown) => setFailure(String(reason)));
      }
      if (event.data === 'library-release-focus') {
        releaseFocus?.();
        releaseFocus = null;
        announce();
      }
      if (event.data === 'library-capture')
        void app.plannerInbox
          .capture({ title: 'Фоновая мысль' })
          .catch((reason: unknown) => setFailure(String(reason)));
      if (event.data === 'library-unmount') setMounted(false);
      if (event.data === 'library-mount') setMounted(true);
    };
    window.addEventListener('library-metrics', update);
    window.addEventListener('message', message);
    update();
    return () => {
      window.removeEventListener('library-metrics', update);
      window.removeEventListener('message', message);
    };
  }, [app]);
  return (
    <>
      <nav aria-label="Fixture controls">
        <button onClick={() => setRoute({ view: 'actions' })}>Список fixture</button>
        <button onClick={() => setRoute({ view: 'inbox' })}>Входящие fixture</button>
        <button onClick={() => setRoute({ view: 'calendar', section: 'actions' })}>
          Календарь fixture
        </button>
        <button onClick={() => setRoute({ view: 'focus' })}>Фокус fixture</button>
        <button onClick={() => setToday(today === '2026-09-30' ? '2026-10-07' : '2026-09-30')}>
          Сменить дату fixture
        </button>
      </nav>
      <output aria-label="Read metrics" style={{ display: 'none' }}>
        {metrics}
      </output>
      {failure && <p role="alert">{failure}</p>}
      <div className="planner-v2">
        <aside className="planner-sidebar" aria-hidden="true" />
        <main className={`planner-content${'section' in route ? ' planner-content--views' : ''}`}>
          {mounted && (
            <PlanningProvider services={app.planning} today={today}>
              <PlannerLibraryWorkspace
                services={app}
                route={route}
                today={today}
                onNavigate={setRoute}
                onChangeDate={async (id, date) => {
                  const result = await app.setLifeActionPlan.changeDate({
                    lifeActionId: EntityId.create(id),
                    plannedDate: date ? DayDate.create(date) : null,
                  });
                  if (!result.ok) throw result.error;
                  return result.value.action;
                }}
              />
            </PlanningProvider>
          )}
        </main>
      </div>
    </>
  );
}

void bootstrap().catch((reason: unknown) => {
  document.getElementById('root')!.textContent = String(reason);
});
