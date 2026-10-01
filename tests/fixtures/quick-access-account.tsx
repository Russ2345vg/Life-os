import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createLifeOsApplication } from '../../src/app/composition/createLifeOsApplication';
import { ApplicationShell } from '../../src/app/ApplicationShell';
import { LifeOsApplicationContext } from '../../src/app/providers/LifeOsApplicationContext';
import '../../src/presentation/styles/global.css';
import '../../src/presentation/planner-v2/planner-v2.css';
import '../../src/presentation/planner-v2/planner-master.css';
import '../../src/presentation/planner-v2/planner-premium.css';

const application = await createLifeOsApplication();
const loadAccount = application.accountSync.load.bind(application.accountSync);
// Exercise the native-available account form without native IPC or real authentication.
application.accountSync.load = async () => ({
  ...(await loadAccount()),
  availability: { available: true, reason: '' },
});

const root = document.getElementById('root');
if (!root) throw new Error('Fixture root is missing.');
createRoot(root).render(
  <StrictMode>
    <LifeOsApplicationContext.Provider value={application}>
      <ApplicationShell />
    </LifeOsApplicationContext.Provider>
  </StrictMode>,
);
