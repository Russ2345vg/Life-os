import { lazy, Suspense, useEffect, useState } from 'react';
import { DayDate } from '../domain';
import {
  parseApplicationRoute,
  resolveInitialApplicationRoute,
} from '../presentation/navigation/ApplicationRoute';
import { buildPlannerRoute, type PlannerRoute } from '../presentation/planner-v2/PlannerNavigation';
import { SyncStatusProvider } from '../presentation/sync/SyncStatusContext';
import { startBrowserApplicationRouteSync } from './lifecycle/BrowserApplicationRouteSync';
import { startBrowserCurrentDateRefresh } from './lifecycle/BrowserCurrentDateRefresh';
import { useLifeOsApplication } from './providers';
import { createApplicationUpdateService } from './composition/createApplicationUpdateService';
import { ApplicationUpdateNotice } from '../presentation/updates/ApplicationUpdateNotice';

const PlannerWorkspace = lazy(() =>
  import('../presentation/planner-v2/PlannerWorkspace').then((module) => ({
    default: module.PlannerWorkspace,
  })),
);

export function ApplicationShell() {
  const application = useLifeOsApplication();
  const [updates] = useState(createApplicationUpdateService);
  useEffect(() => {
    void updates.start();
  }, [updates]);
  const [route, setRoute] = useState<PlannerRoute>(() =>
    resolveInitialApplicationRoute(parseApplicationRoute(window.location.hash)),
  );
  const [currentDate, setCurrentDate] = useState<DayDate>(application.currentDate);

  useEffect(() => {
    if (parseApplicationRoute(window.location.hash) === null) {
      window.history.replaceState(null, '', buildPlannerRoute({ view: 'today' }));
    }
    return startBrowserApplicationRouteSync({
      windowTarget: window,
      readHash: () => window.location.hash,
      restore: setRoute,
    });
  }, []);

  useEffect(
    () =>
      startBrowserCurrentDateRefresh({
        clock: application.clock,
        documentTarget: document,
        windowTarget: window,
        refresh: async () => {
          const nextDate = application.currentDateProvider.getCurrentDate();
          setCurrentDate((current) =>
            current.equals(nextDate) ? current : DayDate.create(nextDate.toString()),
          );
        },
      }),
    [application],
  );

  const navigate = (nextRoute: PlannerRoute): void => {
    window.history.pushState(null, '', buildPlannerRoute(nextRoute));
    setRoute(nextRoute);
  };

  return (
    <SyncStatusProvider sync={application.sync}>
      <Suspense fallback={<p role="status">Загружаем…</p>}>
        <PlannerWorkspace
          systemNotice={<ApplicationUpdateNotice service={updates} />}
          services={application}
          route={route}
          currentDate={currentDate}
          onNavigate={navigate}
        />
      </Suspense>
    </SyncStatusProvider>
  );
}
