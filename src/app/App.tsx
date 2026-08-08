import { StartupPage } from '../presentation/pages/StartupPage';
import { ApplicationShell } from './ApplicationShell';
import { LifeOsApplicationProvider } from './providers';

export function App() {
  return (
    <LifeOsApplicationProvider
      loadingFallback={<StartupPage status="loading" />}
      errorFallback={() => <StartupPage status="error" />}
    >
      <ApplicationShell />
    </LifeOsApplicationProvider>
  );
}
