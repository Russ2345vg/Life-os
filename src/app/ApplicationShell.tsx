import { useMemo, useState } from 'react';
import type { Day, DayDate } from '../domain';
import { ApplicationShellView } from '../presentation/layouts/ApplicationShellView';
import { ActionsPage } from '../presentation/pages/ActionsPage';
import { DecisionsPage } from '../presentation/pages/DecisionsPage';
import { HistoryPage } from '../presentation/pages/HistoryPage';
import { MorePage } from '../presentation/pages/MorePage';
import { TodayPage } from '../presentation/pages/TodayPage';
import { RoutinePage } from '../presentation/pages/RoutinePage';
import { WalksPage } from '../presentation/pages/WalksPage';
import { APP_SECTION, type AppSection } from '../presentation/navigation/AppSection';
import { useLifeOsApplication } from './providers';
import { BrowserActionListFiltersStore } from './settings/BrowserActionListFiltersStore';
import { BrowserLocalSettingsStore } from './settings/BrowserLocalSettingsStore';
import { BrowserTodayActionSelectionStore } from './settings/BrowserTodayActionSelectionStore';
import {
  copyLocalSettings,
  DEFAULT_LOCAL_SETTINGS,
  type LocalSettings,
} from '../presentation/settings/localSettings';

export function ApplicationShell() {
  const application = useLifeOsApplication();
  const [todayActionSelectionStore] = useState(() => new BrowserTodayActionSelectionStore());
  const [actionListFiltersStore] = useState(() => new BrowserActionListFiltersStore());
  const [settingsRuntime] = useState(() => {
    const store = new BrowserLocalSettingsStore();
    return { store, initial: store.load() };
  });
  const [settings, setSettings] = useState<LocalSettings>(() =>
    copyLocalSettings(settingsRuntime.initial.settings),
  );
  const [activeSection, setActiveSection] = useState<AppSection>(settings.defaultSection);
  const [currentDay, setCurrentDay] = useState<Day>(application.currentDay);
  const [selectedDate, setSelectedDate] = useState<DayDate>(application.currentDate);
  const [openCreateRequested, setOpenCreateRequested] = useState(false);
  const routineWorkflow = useMemo(
    () => ({
      getRoutineActionOptions: application.getRoutineActionOptions,
      getRoutineActionDetails: application.getRoutineActionDetails,
      getDecisionsForDate: application.getDecisionsForDate,
      getEveningReview: application.getEveningReview,
      completeCurrentDay: application.completeCurrentDay,
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
    [application],
  );

  function openSection(section: AppSection): void {
    setActiveSection(section);
  }

  function openToday(): void {
    setActiveSection(APP_SECTION.today);
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
    if (selectedDate.isBefore(application.currentDate)) {
      setSelectedDate(application.currentDate);
    }
    setActiveSection(APP_SECTION.today);
    setOpenCreateRequested(true);
  }

  return (
    <ApplicationShellView
      activeSection={activeSection}
      currentDate={application.currentDate}
      selectedDate={selectedDate}
      currentDayStatus={currentDay.status}
      onOpenSection={openSection}
      onCreate={openCreate}
      interfaceDensity={settings.interfaceDensity}
      reduceMotion={settings.reduceMotion}
      showMobileWeekday={settings.showMobileWeekday}
    >
      {activeSection === APP_SECTION.today ? (
        <TodayPage
          currentDate={application.currentDate}
          currentDay={currentDay}
          onCurrentDayChange={setCurrentDay}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          openCreateRequested={openCreateRequested}
          onOpenCreateRequestHandled={() => setOpenCreateRequested(false)}
          startCurrentDay={application.startCurrentDay}
          getEveningReview={application.getEveningReview}
          completeCurrentDay={application.completeCurrentDay}
          getDecisionsForDate={application.getDecisionsForDate}
          getLifeActionsForDate={application.getLifeActionsForDate}
          createDecisionForDate={application.createDecisionForDate}
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
          resolveOpenDayConflict={application.resolveOpenDayConflict}
          clock={application.clock}
          todayActionSelectionStore={todayActionSelectionStore}
        />
      ) : null}

      {activeSection === APP_SECTION.decisions ? (
        <DecisionsPage
          currentDate={application.currentDate}
          selectedDate={selectedDate}
          getDecisionsForDate={application.getDecisionsForDate}
          getDeletedDecisions={application.getDeletedDecisions}
          createDecisionForDate={application.createDecisionForDate}
          getDecisionById={application.getDecisionById}
          getDecisionOverview={application.getDecisionOverview}
          getLifeActionsForDecision={application.getLifeActionsForDecision}
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
        />
      ) : null}

      {activeSection === APP_SECTION.actions ? (
        <ActionsPage
          currentDate={application.currentDate}
          selectedDate={selectedDate}
          getActionListsForDate={application.getActionListsForDate}
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
        />
      ) : null}

      {activeSection === APP_SECTION.routine ? (
        <RoutinePage
          currentDate={application.currentDate}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
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
          onOpenWalks={() => setActiveSection(APP_SECTION.walks)}
          workflow={routineWorkflow}
        />
      ) : null}
      {activeSection === APP_SECTION.walks ? (
        <WalksPage
          currentDate={application.currentDate}
          selectedDate={selectedDate}
          createWalk={application.createWalk}
          completeWalk={application.completeWalk}
          abandonWalk={application.abandonWalk}
          deleteWalk={application.deleteWalk}
          getWalkStatistics={application.getWalkStatistics}
          getWalksForDate={application.getWalksForDate}
          getRunningWalk={application.getRunningWalk}
          startWalk={application.startWalk}
          updateWalkPhoto={application.updateWalkPhoto}
          updateWalkSphere={application.updateWalkSphere}
          onDateChange={setSelectedDate}
        />
      ) : null}


      {activeSection === APP_SECTION.history ? (
        <HistoryPage
          currentDate={application.currentDate}
          selectedDate={selectedDate}
          getHistoryForDateRange={application.getHistoryForDateRange}
          getDecisionById={application.getDecisionById}
          getDecisionOverview={application.getDecisionOverview}
          getLifeActionsForDecision={application.getLifeActionsForDecision}
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
    </ApplicationShellView>
  );
}
