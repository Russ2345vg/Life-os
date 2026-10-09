import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DayDate } from '../domain';
import {
  buildPlannerRoute,
  resolveDiaryRoute,
  type PlannerRoute,
} from '../presentation/planner-v2/PlannerNavigation';
import {
  parsePlannerLocation,
  type PlannerLocation,
} from '../presentation/planner-v2/PlannerLocation';
import { SyncStatusProvider, useSyncContentChanged } from '../presentation/sync/SyncStatusContext';
import type { PlannerServices } from '../application/planner/PlannerServices';
import { buildTodayWidgetSnapshot } from '../application/queries/TodayWidgetSnapshot';
import {
  isAndroidWidgetRuntime,
  TauriTodayWidgetGateway,
} from '../infrastructure/widget/TauriTodayWidgetGateway';
import { createPlannerLocationNavigation } from './lifecycle/PlannerLocationNavigation';
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
  const [location, setLocation] = useState<PlannerLocation>(() => {
    const initial = parsePlannerLocation(window.location.hash) ?? {
      page: { view: 'today' } as const,
      actionPanel: null,
    };
    return { ...initial, page: resolveShellRoute(initial.page, application.currentDate) };
  });
  const [leaveGuard] = useState(createRouteLeaveGuard);
  const panelGuard = useRef<{
    requestLeave(): Promise<boolean>;
    shouldBlockUnload(): boolean;
  } | null>(null);
  const [currentDate, setCurrentDate] = useState<DayDate>(application.currentDate);
  // The factory stores guard callbacks; it does not read the ref during render.
  // eslint-disable-next-line react-hooks/refs
  const [navigation] = useState(() =>
    createPlannerLocationNavigation(
      {
        read: () => ({ hash: window.location.hash, state: window.history.state }),
        push: (hash, state) => window.history.pushState(state, '', hash),
        replace: (hash, state) => window.history.replaceState(state, '', hash),
        go: (delta) => window.history.go(delta),
        listen: (listener) => {
          window.addEventListener('popstate', listener);
          window.addEventListener('hashchange', listener);
          return () => {
            window.removeEventListener('popstate', listener);
            window.removeEventListener('hashchange', listener);
          };
        },
      },
      async ({ from, to }) => {
        if (
          from.actionPanel &&
          (to.actionPanel?.actionId !== from.actionPanel.actionId ||
            buildPlannerRoute(from.page) !== buildPlannerRoute(to.page)) &&
          panelGuard.current &&
          !(await panelGuard.current.requestLeave())
        )
          return false;
        if (buildPlannerRoute(from.page) !== buildPlannerRoute(to.page))
          return leaveGuard.flushBeforeLeave();
        return true;
      },
      setLocation,
      (page) => resolveShellRoute(page, application.currentDateProvider.getCurrentDate()),
    ),
  );

  useEffect(() => {
    navigation.start();
    return () => navigation.stop();
  }, [navigation]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaveGuard.shouldBlockUnload() && !panelGuard.current?.shouldBlockUnload()) return;
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
    (nextRoute: PlannerRoute) => navigation.navigate(nextRoute),
    [navigation],
  );
  const openTodayFromWidget = useCallback(() => navigate({ view: 'today' }), [navigate]);
  const openAction = useCallback(
    (actionId: string) => navigation.openAction(actionId),
    [navigation],
  );
  const closeAction = useCallback(() => navigation.closeAction(), [navigation]);
  const registerPanelGuard = useCallback((guard: NonNullable<typeof panelGuard.current>) => {
    panelGuard.current = guard;
    return () => {
      if (panelGuard.current === guard) panelGuard.current = null;
    };
  }, []);

  return (
    <SyncStatusProvider sync={application.sync}>
      <TodayWidgetCoordinator
        services={application}
        currentDate={currentDate}
        onOpenToday={openTodayFromWidget}
      />
      <RouteLeaveGuardProvider guard={leaveGuard}>
        <Suspense fallback={<p role="status">Загружаем…</p>}>
          <PlannerWorkspace
            systemNotice={<ApplicationUpdateNotice service={updates} />}
            services={application}
            route={location.page}
            actionPanelId={location.actionPanel?.actionId ?? null}
            currentDate={currentDate}
            onNavigate={navigate}
            onOpenAction={openAction}
            onCloseAction={closeAction}
            registerPanelGuard={registerPanelGuard}
          />
        </Suspense>
      </RouteLeaveGuardProvider>
    </SyncStatusProvider>
  );
}

function TodayWidgetCoordinator({
  services,
  currentDate,
  onOpenToday,
}: {
  readonly services: Pick<PlannerServices, 'getPlannerToday' | 'planning'>;
  readonly currentDate: DayDate;
  readonly onOpenToday: () => Promise<boolean> | void;
}) {
  const [gateway] = useState(() => new TauriTodayWidgetGateway());
  const sequence = useRef(0);
  const refresh = useCallback(() => {
    if (!isAndroidWidgetRuntime()) return;
    const request = ++sequence.current;
    void (async () => {
      const overview = await services.getPlannerToday.execute(currentDate);
      if (request !== sequence.current) return;
      await gateway.update(buildTodayWidgetSnapshot(currentDate.toString(), overview, Date.now()));
    })().catch(() => {
      // The last native snapshot remains visibly stale until a successful read.
    });
  }, [services, currentDate, gateway]);
  useSyncContentChanged('lifeActions', refresh);
  useEffect(() => {
    if (!isAndroidWidgetRuntime()) return;
    if (!services.planning) {
      refresh();
      return;
    }
    void services.planning.recurrence
      .materialize(currentDate.toString())
      .then(refresh)
      .catch(refresh);
  }, [services, currentDate, refresh]);
  useEffect(() => {
    if (!isAndroidWidgetRuntime()) return;
    const open = () => {
      void gateway
        .consumeOpenToday()
        .then((requested) => {
          if (requested) void onOpenToday();
        })
        .catch(() => {});
      refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') open();
    };
    open();
    window.addEventListener('focus', open);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', open);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [gateway, onOpenToday, refresh]);
  return null;
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
