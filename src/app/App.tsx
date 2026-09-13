import { StartupPage } from '../presentation/pages/StartupPage';
import { ApplicationShell } from './ApplicationShell';
import { createLifeOsApplicationForEnvironment } from './createLifeOsApplicationForEnvironment';
import { LifeOsApplicationProvider } from './providers';
import { VoiceInputProvider } from './providers/VoiceInputProvider';

export function App() {
  return (
    <LifeOsApplicationProvider
      loadingFallback={<StartupPage status="loading" />}
      errorFallback={() => <StartupPage status="error" />}
      createApplication={createLifeOsApplicationForEnvironment}
    >
      <VoiceInputProvider>
        <ApplicationShell />
      </VoiceInputProvider>
    </LifeOsApplicationProvider>
  );
}
