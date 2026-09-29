import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DayDate } from '../domain';
import {
  parseApplicationRoute,
  resolveInitialApplicationRoute,
} from '../presentation/navigation/ApplicationRoute';
import {
  buildPlannerRoute,
  resolveDiaryRoute,
  type PlannerRoute,
} from '../presentation/planner-v2/PlannerNavigation';
import { SyncStatusProvider } from '../presentation/sync/SyncStatusContext';
import { startBrowserApplicationRouteSync } from './lifecycle/BrowserApplicationRouteSync';
import { startBrowserCurrentDateRefresh } from './lifecycle/BrowserCurrentDateRefresh';
import { useLifeOsApplication } from './providers';
import { createApplicationUpdateService } from './composition/createApplicationUpdateService';
import { ApplicationUpdateNotice } from '../presentation/updates/ApplicationUpdateNotice';
import {
  createRouteLeaveGuard,
  RouteLeaveGuardProvider,
  type RouteLeaveGuard,
} from '../presentation/navigation/RouteLeaveGuard';

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
  const [route, setRoute] = useState<PlannerRoute>(() => {
    const initial = resolveInitialApplicationRoute(parseApplicationRoute(window.location.hash));
    return initial.view === 'diary' ? resolveDiaryRoute(initial, application.currentDate) : initial;
  });
  const [leaveGuard] = useState(createRouteLeaveGuard);
  const acceptedHash = useRef(buildPlannerRoute(route));
  const [currentDate, setCurrentDate] = useState<DayDate>(application.currentDate);

  useEffect(() => {
    if (window.location.hash !== acceptedHash.current)
      window.history.replaceState(null, '', acceptedHash.current);
    return startBrowserApplicationRouteSync({
      windowTarget: window,
      readHash: () => window.location.hash,
      readAcceptedHash: () => acceptedHash.current,
      replaceHash: (hash) => window.history.replaceState(null, '', hash),
      beforeRestore: () => leaveGuard.flushBeforeLeave(),
      restore: (nextRoute) => {
        const resolved = resolveShellRoute(
          nextRoute,
          application.currentDateProvider.getCurrentDate(),
        );
        acceptedHash.current = buildPlannerRoute(resolved);
        setRoute(resolved);
      },
    });
  }, [application.currentDateProvider, leaveGuard]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaveGuard.shouldBlockUnload()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [leaveGuard]);

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

  const navigate = useCallback(
    async (nextRoute: PlannerRoute): Promise<boolean> => {
      if (!(await leaveGuard.flushBeforeLeave())) return false;
      const resolved = resolveShellRoute(
        nextRoute,
        application.currentDateProvider.getCurrentDate(),
      );
      const hash = buildPlannerRoute(resolved);
      window.history.pushState(null, '', hash);
      acceptedHash.current = hash;
      setRoute(resolved);
      return true;
    },
    [application.currentDateProvider, leaveGuard],
  );

  return (
    <SyncStatusProvider sync={application.sync}>
      <RouteLeaveGuardProvider guard={leaveGuard}>
        <Suspense fallback={<p role="status">Загружаем…</p>}>
          <PlannerWorkspace
            systemNotice={<ApplicationUpdateNotice service={updates} />}
            services={application}
            route={route}
            currentDate={currentDate}
            onNavigate={(nextRoute) => void navigate(nextRoute)}
          />
        </Suspense>
      </RouteLeaveGuardProvider>
    </SyncStatusProvider>
  );
}

export function createGuardedNavigator(
  guard: RouteLeaveGuard,
  pushHash: (hash: string) => void,
  commit: (route: PlannerRoute) => void,
  normalize: (route: PlannerRoute) => PlannerRoute = (route) => route,
) {
  return async (nextRoute: PlannerRoute): Promise<boolean> => {
    if (!(await guard.flushBeforeLeave())) return false;
    const resolved = normalize(nextRoute);
    pushHash(buildPlannerRoute(resolved));
    commit(resolved);
    return true;
  };
}

function resolveShellRoute(route: PlannerRoute, currentDate: DayDate): PlannerRoute {
  return route.view === 'diary' ? resolveDiaryRoute(route, currentDate) : route;
}
