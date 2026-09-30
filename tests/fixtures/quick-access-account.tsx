import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLifeOsApplication } from '../../src/app/composition/createLifeOsApplication';
import { PlannerWorkspace } from '../../src/presentation/planner-v2/PlannerWorkspace';
import {
  buildPlannerRoute,
  parsePlannerRoute,
  type PlannerRoute,
} from '../../src/presentation/planner-v2/PlannerNavigation';
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

// eslint-disable-next-line react-refresh/only-export-components -- Standalone browser test entry point.
function Fixture() {
  const [route, setRoute] = useState<PlannerRoute>(
    () => parsePlannerRoute(location.hash) ?? { view: 'today' },
  );
  return (
    <PlannerWorkspace
      services={application}
      currentDate={application.currentDateProvider.getCurrentDate()}
      route={route}
      onNavigate={(next) => {
        history.pushState(null, '', buildPlannerRoute(next));
        setRoute(next);
      }}
    />
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Fixture root is missing.');
createRoot(root).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
