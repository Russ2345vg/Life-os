import { HomePage } from '../presentation/pages/HomePage';
import { StartupPage } from '../presentation/pages/StartupPage';
import { LifeOsApplicationProvider, useLifeOsApplication } from './providers';

export function App() {
  return (
    <LifeOsApplicationProvider
      loadingFallback={<StartupPage status="loading" />}
      errorFallback={() => <StartupPage status="error" />}
    >
      <ReadyHomePage />
    </LifeOsApplicationProvider>
  );
}

function ReadyHomePage() {
  const application = useLifeOsApplication();
  const currentDate = application.currentDateProvider.getCurrentDate().toString();

  return <HomePage currentDate={currentDate} />;
}
