import { StartupPage } from '../presentation/pages/StartupPage';
import { TodayPage } from '../presentation/pages/TodayPage';
import { LifeOsApplicationProvider, useLifeOsApplication } from './providers';

export function App() {
  return (
    <LifeOsApplicationProvider
      loadingFallback={<StartupPage status="loading" />}
      errorFallback={() => <StartupPage status="error" />}
    >
      <ReadyTodayPage />
    </LifeOsApplicationProvider>
  );
}

function ReadyTodayPage() {
  const application = useLifeOsApplication();

  return (
    <TodayPage
      currentDate={application.currentDate}
      getDecisionsForDate={application.getDecisionsForDate}
      createDecisionForDate={application.createDecisionForDate}
      getDecisionById={application.getDecisionById}
      getLifeActionsForDecision={application.getLifeActionsForDecision}
      createLifeActionForDecision={application.createLifeActionForDecision}
      startLifeActionSession={application.startLifeActionSession}
      pauseActionSession={application.pauseActionSession}
      resumeActionSession={application.resumeActionSession}
      completeActionSession={application.completeActionSession}
      completeLifeAction={application.completeLifeAction}
      confirmDecisionFromActions={application.confirmDecisionFromActions}
      updateDecisionDetails={application.updateDecisionDetails}
      cancelDecisionSafely={application.cancelDecisionSafely}
      getActionSessionsForLifeAction={application.getActionSessionsForLifeAction}
      getUnfinishedActionSession={application.getUnfinishedActionSession}
      clock={application.clock}
    />
  );
}
