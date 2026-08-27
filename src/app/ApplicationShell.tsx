import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Day, DayDate } from '../domain';
import { ApplicationShellView } from '../presentation/layouts/ApplicationShellView';
import { WalkReentryReminder } from '../presentation/walk/WalkReentryReminder';
import type {
  DecisionWalkLaunchRequest,
  DecisionWalkIntegration,
} from '../presentation/decision/DecisionWalkNavigation';
import {
  APP_SECTION,
  resolveMenuEntrySection,
  type AppSection,
} from '../presentation/navigation/AppSection';
import { useLifeOsApplication } from './providers';
import { BrowserActionListFiltersStore } from './settings/BrowserActionListFiltersStore';
import { BrowserLocalSettingsStore } from './settings/BrowserLocalSettingsStore';
import { BrowserSidebarPreferenceStore } from './settings/BrowserSidebarPreferenceStore';
import { BrowserTodayActionSelectionStore } from './settings/BrowserTodayActionSelectionStore';
import {
  copyLocalSettings,
  DEFAULT_LOCAL_SETTINGS,
  type LocalSettings,
} from '../presentation/settings/localSettings';
import { startBrowserCurrentDateRefresh } from './lifecycle/BrowserCurrentDateRefresh';
import {
  buildRoutineRoute,
  parseRoutineRoute,
  ROUTINE_SECTION,
  type RoutineSection,
} from '../presentation/routine/RoutineNavigation';
import { loadApplicationStartup } from './ApplicationStartup';
import type {
  RoutineWalkLaunchRequest,
  RoutineWalkDestinationRequest,
} from '../presentation/routine/RoutineWalkNavigation';
import {
  loadPendingWalkReentry,
  shouldShowWalkReentryReminder,
  type PendingWalkReentryState,
} from './WalkReentryStartup';

const ActionsPage = lazy(() =>
  import('../presentation/pages/ActionsPage').then((module) => ({ default: module.ActionsPage })),
);
const DecisionsPage = lazy(() =>
  import('../presentation/pages/DecisionsPage').then((module) => ({
    default: module.DecisionsPage,
  })),
);
const HistoryPage = lazy(() =>
  import('../presentation/pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
);
const EveningAnalyticsPage = lazy(() =>
  import('../presentation/pages/EveningAnalyticsPage').then((module) => ({
    default: module.EveningAnalyticsPage,
  })),
);
const ManagementPage = lazy(() =>
  import('../presentation/management/ManagementPage').then((module) => ({
    default: module.ManagementPage,
  })),
);
const MorePage = lazy(() =>
  import('../presentation/pages/MorePage').then((module) => ({ default: module.MorePage })),
);
const RoutinePage = lazy(() =>
  import('../presentation/pages/RoutinePage').then((module) => ({ default: module.RoutinePage })),
);
const SpheresPage = lazy(() =>
  import('../presentation/pages/SpheresPage').then((module) => ({ default: module.SpheresPage })),
);
const TodayPage = lazy(() =>
  import('../presentation/pages/TodayPage').then((module) => ({ default: module.TodayPage })),
);
const WalksPage = lazy(() =>
  import('../presentation/pages/WalksPage').then((module) => ({ default: module.WalksPage })),
);

export function ApplicationShell() {
  const application = useLifeOsApplication();
  const [initialRoutineRoute] = useState(() =>
    typeof window === 'undefined' ? null : parseRoutineRoute(window.location.hash),
  );
  const [todayActionSelectionStore] = useState(() => new BrowserTodayActionSelectionStore());
  const [actionListFiltersStore] = useState(() => new BrowserActionListFiltersStore());
  const [sidebarPreferenceStore] = useState(() => new BrowserSidebarPreferenceStore());
  const [settingsRuntime] = useState(() => {
    const store = new BrowserLocalSettingsStore();
    return { store, initial: store.load() };
  });
  const [settings, setSettings] = useState<LocalSettings>(() =>
    copyLocalSettings(settingsRuntime.initial.settings),
  );
  const [activeSection, setActiveSection] = useState<AppSection>(() =>
    initialRoutineRoute === null
      ? resolveMenuEntrySection(settings.defaultSection)
      : APP_SECTION.routine,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => sidebarPreferenceStore.load());
  const [currentDay, setCurrentDay] = useState<Day>(application.currentDay);
  const [currentDate, setCurrentDate] = useState<DayDate>(application.currentDate);
  const [selectedDate, setSelectedDate] = useState<DayDate>(
    initialRoutineRoute?.date ?? application.currentDate,
  );
  const [routineSection, setRoutineSection] = useState<RoutineSection>(
    initialRoutineRoute?.section ?? ROUTINE_SECTION.day,
  );
  const [openCreateRequested, setOpenCreateRequested] = useState(false);
  const [decisionLaunchRequest, setDecisionLaunchRequest] =
    useState<DecisionWalkLaunchRequest | null>(null);
  const [decisionReturnId, setDecisionReturnId] = useState<string | null>(null);
  const consumeDecisionLaunch = useCallback(() => setDecisionLaunchRequest(null), []);
  const [routineLaunchRequest, setRoutineLaunchRequest] = useState<RoutineWalkLaunchRequest | null>(
    null,
  );
  const [routineReturnTarget, setRoutineReturnTarget] =
    useState<RoutineWalkDestinationRequest | null>(null);
  const consumeRoutineLaunch = useCallback(() => setRoutineLaunchRequest(null), []);
  const consumeRoutineReturn = useCallback(() => setRoutineReturnTarget(null), []);
  const [startupEveningDate, setStartupEveningDate] = useState<DayDate | null>(null);
  const [startupStorageError, setStartupStorageError] = useState(false);
  const [startupRetryToken, setStartupRetryToken] = useState(0);
  const [activeWalkRestored, setActiveWalkRestored] = useState(true);
  const [pendingWalkReentryState, setPendingWalkReentryState] = useState<PendingWalkReentryState>({
    status: 'loading',
  });
  const [managementProjectRequest, setManagementProjectRequest] = useState<{
    readonly projectId: string | null;
    readonly sequence: number;
  }>({ projectId: null, sequence: 0 });
  const openProject = useCallback((projectId: string): void => {
    setManagementProjectRequest((current) => ({
      projectId,
      sequence: current.sequence + 1,
    }));
    setActiveSection(APP_SECTION.management);
  }, []);

  useEffect(() => {
    let active = true;

    const refreshCurrentDate = async (): Promise<void> => {
      const nextDate = application.currentDateProvider.getCurrentDate();
      if (!nextDate.equals(currentDate)) {
        const nextDay = await application.ensureCurrentDay.execute();
        if (!active) return;
        setCurrentDate(nextDate);
        setCurrentDay(nextDay);
        setSelectedDate((selected) => (selected.equals(currentDate) ? nextDate : selected));
      }
    };
    const stop = startBrowserCurrentDateRefresh({
      clock: application.clock,
      documentTarget: document,
      windowTarget: window,
      refresh: refreshCurrentDate,
    });

    return () => {
      active = false;
      stop();
    };
  }, [application, currentDate]);

  useEffect(() => {
    const restoreRoutineRoute = (): void => {
      const route = parseRoutineRoute(window.location.hash);
      if (route === null) return;
      setActiveSection(APP_SECTION.routine);
      setRoutineSection(route.section);
      if (route.date !== null) setSelectedDate(route.date);
    };

    window.addEventListener('popstate', restoreRoutineRoute);
    window.addEventListener('hashchange', restoreRoutineRoute);
    return () => {
      window.removeEventListener('popstate', restoreRoutineRoute);
      window.removeEventListener('hashchange', restoreRoutineRoute);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadStartup = async (): Promise<void> => {
      const result = await loadApplicationStartup({
        getActiveWalk: application.getActiveWalk,
        getApplicationMode: application.getApplicationMode,
        hasInitialRoutineRoute: initialRoutineRoute !== null,
      });
      if (!active) return;
      setActiveWalkRestored(result.status === 'active-walk');
      if (result.status === 'storage-error') {
        setStartupStorageError(true);
        return;
      }
      setStartupStorageError(false);
      if (result.status === 'active-walk') {
        setActiveSection(APP_SECTION.walks);
        setSelectedDate(result.date);
        return;
      }
      if (result.status !== 'evening') return;
      setActiveSection(APP_SECTION.today);
      setSelectedDate(result.date);
      setStartupEveningDate(result.date);
    };

    void loadStartup().catch(() => {
      if (active) setStartupStorageError(true);
    });

    return () => {
      active = false;
    };
  }, [application, initialRoutineRoute, startupRetryToken]);

  const refreshPendingWalkReentry = useCallback(async (): Promise<void> => {
    setPendingWalkReentryState(await loadPendingWalkReentry(application.getPendingWalkReentry));
    try {
      const activeWalk = await application.getActiveWalk.execute();
      setActiveWalkRestored(activeWalk !== null);
    } catch {
      setActiveWalkRestored(true);
      setStartupStorageError(true);
    }
  }, [application]);

  useEffect(() => {
    let active = true;
    void loadPendingWalkReentry(application.getPendingWalkReentry).then((state) => {
      if (active) setPendingWalkReentryState(state);
    });
    return () => {
      active = false;
    };
  }, [application]);
  const routineWorkflow = useMemo(
    () => ({
      getRoutineActionOptions: application.getRoutineActionOptions,
      getRoutineActionDetails: application.getRoutineActionDetails,
      getDecisionsForDate: application.getDecisionsForDate,
      getEveningReview: application.getEveningCycleReview,
      getSpheres: application.getSpheres,
      getProjects: application.getProjects,
      onOpenProject: openProject,
      completeCurrentDay: application.completeEveningCycle,
      eveningCycle: application.eveningCycle,
      resolveOpenLoop: application.resolveOpenLoop,
      reflection: application.reflection,
      tomorrowPlan: application.tomorrowPlan,
      preparation: application.preparation,
      getDecisionById: application.getDecisionById,
      getDecisionOverview: application.getDecisionOverview,
      getLifeActionsForDecision: application.getLifeActionsForDecision,
      createLifeActionForDecision: application.createLifeActionForDecision,
      confirmDecisionFromActions: application.confirmDecisionFromActions,
      updateDecisionDetails: application.updateDecisionDetails,
      cancelDecisionSafely: application.cancelDecisionSafely,
      rescheduleDecisionSafely: application.rescheduleDecisionSafely,
      getActionSessionsForLifeAction: application.getActionSessionsForLifeAction,
      getUnfinishedActionSession: application.getUnfinishedActionSession,
      startLifeActionSession: application.startLifeActionSession,
      pauseActionSession: application.pauseActionSession,
      resumeActionSession: application.resumeActionSession,
      completeActionSession: application.completeActionSession,
      completeLifeAction: application.verifyLifeActionResult,
      updateLifeActionDetails: application.updateLifeActionDetails,
      cancelLifeActionSafely: application.cancelLifeActionSafely,
      rescheduleLifeActionSafely: application.rescheduleLifeActionSafely,
      clock: application.clock,
    }),
    [application, openProject],
  );

  function openSection(section: AppSection): void {
    setDecisionReturnId(null);
    if (section === APP_SECTION.management) {
      setManagementProjectRequest((current) => ({
        projectId: null,
        sequence: current.sequence + 1,
      }));
    }
    if (section === APP_SECTION.routine) {
      setRoutineSection(ROUTINE_SECTION.day);
      writeRoutineRoute(ROUTINE_SECTION.day, selectedDate);
    } else if (parseRoutineRoute(window.location.hash) !== null) {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setActiveSection(section);
  }

  function openRoutineSection(section: RoutineSection): void {
    setRoutineSection(section);
    writeRoutineRoute(section, selectedDate);
  }

  function openCompletedEvening(date: DayDate): void {
    setSelectedDate(date);
    setRoutineSection(ROUTINE_SECTION.evening);
    setActiveSection(APP_SECTION.routine);
    writeRoutineRoute(ROUTINE_SECTION.evening, date);
  }

  function changeRoutineDate(date: DayDate): void {
    setSelectedDate(date);
    writeRoutineRoute(routineSection, date, true);
  }

  function writeRoutineRoute(section: RoutineSection, date: DayDate, replace = false): void {
    const route = buildRoutineRoute(section, date);
    if (replace) {
      window.history.replaceState(null, '', route);
      return;
    }
    window.history.pushState(null, '', route);
  }

  function openToday(): void {
    setActiveSection(APP_SECTION.today);
  }

  function toggleSidebar(): void {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      sidebarPreferenceStore.save(nextCollapsed);
      return nextCollapsed;
    });
  }

  function saveSettings(nextSettings: LocalSettings): boolean {
    if (!settingsRuntime.store.save(nextSettings)) {
      return false;
    }

    setSettings(copyLocalSettings(nextSettings));
    return true;
  }

  function resetSettings(): boolean {
    if (!settingsRuntime.store.reset()) {
      return false;
    }

    setSettings(copyLocalSettings(DEFAULT_LOCAL_SETTINGS));
    return true;
  }

  function openCreate(): void {
    if (selectedDate.isBefore(currentDate)) {
      setSelectedDate(currentDate);
    }
    setActiveSection(APP_SECTION.today);
    setOpenCreateRequested(true);
  }

  const decisionWalkIntegration: DecisionWalkIntegration = {
    getLatestOutcome: application.getLatestWalkOutcomeForDecision,
    onStart: (decision) => {
      setRoutineLaunchRequest(null);
      setDecisionLaunchRequest({ decisionId: decision.id, title: decision.title.toString() });
      openSection(APP_SECTION.walks);
    },
  };

  const renderDecisionsPage = (initialDecisionId: string | null) => (
    <DecisionsPage
      decisionWalk={decisionWalkIntegration}
      currentDate={currentDate}
      selectedDate={selectedDate}
      getDecisionsForDate={application.getDecisionsForDate}
      getDeletedDecisions={application.getDeletedDecisions}
      createDecisionForDate={application.createDecisionForDate}
      getDecisionById={application.getDecisionById}
      getDecisionOverview={application.getDecisionOverview}
      getLifeActionsForDecision={application.getLifeActionsForDecision}
      getSpheres={application.getSpheres}
      getProjects={application.getProjects}
      createLifeActionForDecision={application.createLifeActionForDecision}
      confirmDecisionFromActions={application.confirmDecisionFromActions}
      updateDecisionDetails={application.updateDecisionDetails}
      cancelDecisionSafely={application.cancelDecisionSafely}
      deleteDecisionSafely={application.deleteDecisionSafely}
      restoreDeletedDecision={application.restoreDeletedDecision}
      rescheduleDecisionSafely={application.rescheduleDecisionSafely}
      getActionSessionsForLifeAction={application.getActionSessionsForLifeAction}
      getUnfinishedActionSession={application.getUnfinishedActionSession}
      startLifeActionSession={application.startLifeActionSession}
      pauseActionSession={application.pauseActionSession}
      resumeActionSession={application.resumeActionSession}
      completeActionSession={application.completeActionSession}
      completeLifeAction={application.verifyLifeActionResult}
      updateLifeActionDetails={application.updateLifeActionDetails}
      cancelLifeActionSafely={application.cancelLifeActionSafely}
      rescheduleLifeActionSafely={application.rescheduleLifeActionSafely}
      clock={application.clock}
      onDateChange={setSelectedDate}
      onOpenToday={openToday}
      onOpenProject={openProject}
      initialDecisionId={initialDecisionId}
    />
  );

  const decisionsPage = renderDecisionsPage(decisionReturnId);

  const actionsPage = (
    <ActionsPage
      currentDate={currentDate}
      selectedDate={selectedDate}
      getActionListsForDate={application.getActionListsForDate}
      getSpheres={application.getSpheres}
      getProjects={application.getProjects}
      getDecisionById={application.getDecisionById}
      getActionSessionsForLifeAction={application.getActionSessionsForLifeAction}
      getUnfinishedActionSession={application.getUnfinishedActionSession}
      startLifeActionSession={application.startLifeActionSession}
      pauseActionSession={application.pauseActionSession}
      resumeActionSession={application.resumeActionSession}
      completeActionSession={application.completeActionSession}
      completeLifeAction={application.verifyLifeActionResult}
      updateLifeActionDetails={application.updateLifeActionDetails}
      cancelLifeActionSafely={application.cancelLifeActionSafely}
      rescheduleLifeActionSafely={application.rescheduleLifeActionSafely}
      clock={application.clock}
      actionListFiltersStore={actionListFiltersStore}
      onDateChange={setSelectedDate}
      onOpenToday={openToday}
      onOpenProject={openProject}
    />
  );

  const todayPage = (
    <TodayPage
      decisionWalk={decisionWalkIntegration}
      currentDate={currentDate}
      currentDay={currentDay}
      onCurrentDayChange={setCurrentDay}
      selectedDate={selectedDate}
      onSelectedDateChange={setSelectedDate}
      startupEveningDate={startupEveningDate}
      openCreateRequested={openCreateRequested}
      onOpenCreateRequestHandled={() => setOpenCreateRequested(false)}
      startCurrentDay={application.startCurrentDay}
      getEveningReview={application.getEveningCycleReview}
      getSpheres={application.getSpheres}
      getProjects={application.getProjects}
      completeCurrentDay={application.completeEveningCycle}
      eveningCycle={application.eveningCycle}
      resolveOpenLoop={application.resolveOpenLoop}
      reflection={application.reflection}
      tomorrowPlan={application.tomorrowPlan}
      preparation={application.preparation}
      updateDayResultSphere={application.updateDayResultSphere}
      getDecisionsForDate={application.getDecisionsForDate}
      getLifeActionsForDate={application.getLifeActionsForDate}
      createDecisionForDate={application.createDecisionForDate}
      deleteDecisionSafely={application.deleteDecisionSafely}
      getDecisionById={application.getDecisionById}
      getLifeActionsForDecision={application.getLifeActionsForDecision}
      createLifeActionForDecision={application.createLifeActionForDecision}
      startLifeActionSession={application.startLifeActionSession}
      pauseActionSession={application.pauseActionSession}
      resumeActionSession={application.resumeActionSession}
      completeActionSession={application.completeActionSession}
      completeLifeAction={application.verifyLifeActionResult}
      confirmDecisionFromActions={application.confirmDecisionFromActions}
      updateDecisionDetails={application.updateDecisionDetails}
      cancelDecisionSafely={application.cancelDecisionSafely}
      updateLifeActionDetails={application.updateLifeActionDetails}
      cancelLifeActionSafely={application.cancelLifeActionSafely}
      rescheduleDecisionSafely={application.rescheduleDecisionSafely}
      rescheduleLifeActionSafely={application.rescheduleLifeActionSafely}
      getActionSessionsForLifeAction={application.getActionSessionsForLifeAction}
      getUnfinishedActionSession={application.getUnfinishedActionSession}
      getOpenDayConflict={application.getOpenDayConflict}
      getRoutineBlocksForDate={application.getRoutineBlocksForDate}
      resolveOpenDayConflict={application.resolveOpenDayConflict}
      onOpenRoutine={() => openSection(APP_SECTION.routine)}
      onOpenActions={() => openSection(APP_SECTION.actions)}
      onOpenProject={openProject}
      clock={application.clock}
      todayActionSelectionStore={todayActionSelectionStore}
    />
  );

  const showPendingWalkReentry = shouldShowWalkReentryReminder({
    pendingState: pendingWalkReentryState,
    activeSection,
    activeWalkRestored,
  });
  const showPendingWalkReentryError =
    pendingWalkReentryState.status === 'error' &&
    activeSection !== APP_SECTION.walks &&
    !activeWalkRestored;

  return (
    <ApplicationShellView
      activeSection={activeSection}
      currentDate={currentDate}
      selectedDate={selectedDate}
      currentDayStatus={currentDay.status}
      onOpenSection={openSection}
      onCreate={openCreate}
      interfaceDensity={settings.interfaceDensity}
      reduceMotion={settings.reduceMotion}
      showMobileWeekday={settings.showMobileWeekday}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={toggleSidebar}
    >
      {showPendingWalkReentry || showPendingWalkReentryError ? (
        <WalkReentryReminder
          error={
            showPendingWalkReentryError ? 'Не удалось проверить сохранённое возвращение.' : null
          }
          onContinue={() => openSection(APP_SECTION.walks)}
          onRetry={() => {
            setPendingWalkReentryState({ status: 'loading' });
            void refreshPendingWalkReentry();
          }}
        />
      ) : null}
      {startupStorageError ? (
        <aside className="local-data-warning" role="status">
          <span>Не удалось загрузить часть локальных данных.</span>
          <button
            type="button"
            onClick={() => {
              setActiveWalkRestored(true);
              setStartupRetryToken((value) => value + 1);
            }}
          >
            Повторить
          </button>
        </aside>
      ) : null}
      <Suspense
        fallback={
          <p className="section-page-message" role="status">
            Загружаем раздел…
          </p>
        }
      >
        {activeSection === APP_SECTION.today ? todayPage : null}

        {activeSection === APP_SECTION.management ? (
          <ManagementPage
            key={managementProjectRequest.sequence}
            createDirection={application.createDirection}
            updateDirection={application.updateDirection}
            archiveDirection={application.archiveDirection}
            restoreDirection={application.restoreDirection}
            getDirections={application.getDirections}
            makeDirectionMain={application.makeDirectionMain}
            getDirectionsOverview={application.getDirectionsOverview}
            getManagementOverview={application.getManagementOverview}
            getDirectionDetails={application.getDirectionDetails}
            applyDirectionStrategicReview={application.applyDirectionStrategicReview}
            createProject={application.createProject}
            updateProject={application.updateProject}
            archiveProject={application.archiveProject}
            restoreProject={application.restoreProject}
            completeProject={application.completeProject}
            pauseProject={application.pauseProject}
            resumeProject={application.resumeProject}
            makeProjectMain={application.makeProjectMain}
            getProjects={application.getProjects}
            getProjectLifeActions={application.getProjectLifeActions}
            createDecisionForDate={application.createDecisionForDate}
            currentDate={currentDate}
            getSpheres={application.getSpheres}
            renderDecisionsPage={renderDecisionsPage}
            actionsPage={actionsPage}
            todayPage={todayPage}
            onOpenDay={() => setSelectedDate(currentDate)}
            initialProjectId={managementProjectRequest.projectId}
          />
        ) : null}

        {activeSection === APP_SECTION.decisions ? decisionsPage : null}

        {activeSection === APP_SECTION.actions ? actionsPage : null}

        {activeSection === APP_SECTION.routine ? (
          <RoutinePage
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateChange={changeRoutineDate}
            activeSection={routineSection}
            onSectionChange={openRoutineSection}
            onCurrentDayChange={setCurrentDay}
            createRoutineBlock={application.createRoutineBlock}
            updateRoutineBlock={application.updateRoutineBlock}
            deleteRoutineBlock={application.deleteRoutineBlock}
            getRoutineBlocksForDate={application.getRoutineBlocksForDate}
            delayRoutineOccurrence={application.delayRoutineOccurrence}
            skipRoutineOccurrence={application.skipRoutineOccurrence}
            rescheduleRoutineOccurrence={application.rescheduleRoutineOccurrence}
            shortenRoutineOccurrence={application.shortenRoutineOccurrence}
            replaceRoutineOccurrenceAction={application.replaceRoutineOccurrenceAction}
            clearRoutineOccurrenceOverride={application.clearRoutineOccurrenceOverride}
            getRoutinePlanFactForDate={application.getRoutinePlanFactForDate}
            getRunningRoutineOccurrence={application.getRunningRoutineOccurrence}
            startRoutineOccurrence={application.startRoutineOccurrence}
            completeRoutineOccurrence={application.completeRoutineOccurrence}
            abandonRoutineOccurrence={application.abandonRoutineOccurrence}
            getActiveWalk={application.getActiveWalk}
            onOpenWalks={() => openSection(APP_SECTION.walks)}
            onStartWalk={(request) => {
              setDecisionLaunchRequest(null);
              setRoutineLaunchRequest(request);
              openSection(APP_SECTION.walks);
            }}
            routineReturnTarget={routineReturnTarget}
            onRoutineReturnHandled={consumeRoutineReturn}
            workflow={routineWorkflow}
          />
        ) : null}

        {activeSection === APP_SECTION.walks ? (
          <WalksPage
            getWalkHistory={application.getWalkHistory}
            getWalkAnalytics={application.getWalkAnalytics}
            getWalkRecommendation={application.getWalkRecommendation}
            getWalkHistoryDetail={application.getWalkHistoryDetail}
            onOpenHistoryDecision={(decisionId) => {
              openSection(APP_SECTION.decisions);
              setDecisionReturnId(decisionId);
            }}
            onOpenHistoryRoutine={(request) => {
              setSelectedDate(request.date);
              setRoutineSection(ROUTINE_SECTION.day);
              setRoutineReturnTarget(request);
              writeRoutineRoute(ROUTINE_SECTION.day, request.date);
              setActiveSection(APP_SECTION.routine);
            }}
            createWalkCapture={application.createWalkCapture}
            updateWalkCapture={application.updateWalkCapture}
            processWalkCapture={application.processWalkCapture}
            getPendingWalkCaptures={application.getPendingWalkCaptures}
            getWalkCaptures={application.getWalkCaptures}
            getWalkCaptureById={application.getWalkCaptureById}
            startDecisionWalk={application.startDecisionWalk}
            getDecisionById={application.getDecisionById}
            decisionLaunchRequest={decisionLaunchRequest}
            onDecisionLaunchConsumed={consumeDecisionLaunch}
            onReturnToDecision={(decisionId) => {
              setDecisionLaunchRequest(null);
              openSection(APP_SECTION.decisions);
              setDecisionReturnId(decisionId);
            }}
            startRoutineWalk={application.startRoutineWalk}
            abandonWalk={application.abandonWalk}
            routineLaunchRequest={routineLaunchRequest}
            onRoutineLaunchConsumed={consumeRoutineLaunch}
            onReturnToRoutine={(request) => {
              setSelectedDate(request.date);
              setRoutineSection(ROUTINE_SECTION.day);
              setRoutineReturnTarget(request);
              writeRoutineRoute(ROUTINE_SECTION.day, request.date);
              setActiveSection(APP_SECTION.routine);
            }}
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            createWalk={application.createWalk}
            advanceWalkReflectionStage={application.advanceWalkReflectionStage}
            disableWalkReflectionGuidance={application.disableWalkReflectionGuidance}
            completeWalk={application.completeWalk}
            completeWalkReentry={application.completeWalkReentry}
            closeWalkReentry={application.closeWalkReentry}
            deleteWalk={application.deleteWalk}
            getWalkStatistics={application.getWalkStatistics}
            getWalksForDate={application.getWalksForDate}
            getActiveWalk={application.getActiveWalk}
            getPendingWalkReentry={application.getPendingWalkReentry}
            pauseWalk={application.pauseWalk}
            recordWalkOutcome={application.recordWalkOutcome}
            resumeWalk={application.resumeWalk}
            startWalk={application.startWalk}
            updateWalkPhoto={application.updateWalkPhoto}
            updateWalkSphere={application.updateWalkSphere}
            getSpheres={application.getSpheres}
            onReentryChanged={refreshPendingWalkReentry}
            onOpenSection={openSection}
          />
        ) : null}

        {activeSection === APP_SECTION.spheres ? (
          <SpheresPage
            createSphere={application.createSphere}
            updateSphere={application.updateSphere}
            archiveSphere={application.archiveSphere}
            restoreSphere={application.restoreSphere}
            getSpheres={application.getSpheres}
          />
        ) : null}

        {activeSection === APP_SECTION.history ? (
          <HistoryPage
            currentDate={currentDate}
            selectedDate={selectedDate}
            getJournalTimeline={application.getJournalTimeline}
            correctJournalData={application.correctJournalData}
            idGenerator={application.idGenerator}
            getDecisionById={application.getDecisionById}
            getDecisionOverview={application.getDecisionOverview}
            getLifeActionsForDecision={application.getLifeActionsForDecision}
            getSpheres={application.getSpheres}
            getProjects={application.getProjects}
            createLifeActionForDecision={application.createLifeActionForDecision}
            confirmDecisionFromActions={application.confirmDecisionFromActions}
            updateDecisionDetails={application.updateDecisionDetails}
            cancelDecisionSafely={application.cancelDecisionSafely}
            rescheduleDecisionSafely={application.rescheduleDecisionSafely}
            getActionSessionsForLifeAction={application.getActionSessionsForLifeAction}
            getUnfinishedActionSession={application.getUnfinishedActionSession}
            startLifeActionSession={application.startLifeActionSession}
            pauseActionSession={application.pauseActionSession}
            resumeActionSession={application.resumeActionSession}
            completeActionSession={application.completeActionSession}
            completeLifeAction={application.verifyLifeActionResult}
            updateLifeActionDetails={application.updateLifeActionDetails}
            cancelLifeActionSafely={application.cancelLifeActionSafely}
            rescheduleLifeActionSafely={application.rescheduleLifeActionSafely}
            clock={application.clock}
            onDateChange={setSelectedDate}
            onOpenProject={openProject}
          />
        ) : null}

        {activeSection === APP_SECTION.eveningAnalytics ? (
          <EveningAnalyticsPage
            currentDate={currentDate}
            getEveningAnalytics={application.getEveningAnalytics}
            recommendationApplications={application.recommendationApplications}
            onOpenEvening={openCompletedEvening}
          />
        ) : null}

        {activeSection === APP_SECTION.more ? (
          <MorePage
            settings={settings}
            settingsStorageAvailable={settingsRuntime.initial.storageAvailable}
            settingsRecoveredFromInvalidValue={settingsRuntime.initial.recoveredFromInvalidValue}
            onOpenSection={openSection}
            onSaveSettings={saveSettings}
            onResetSettings={resetSettings}
          />
        ) : null}
      </Suspense>
    </ApplicationShellView>
  );
}
