import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlannerActionTimeSheet } from '../../../src/presentation/planner-v2/PlannerActionTimeSheet';
import { createLifeActionDraft } from '../../../src/test/helpers/LifeActionTestFactory';
import '../../../src/presentation/planner-v2/planner-v2.css';

export function TimeFormRegression() {
  const [action, setAction] = useState(() => createLifeActionDraft('form-race'));
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const refresh = (event: MessageEvent<unknown>) => {
      if (event.origin !== location.origin || event.data !== 'time-form-refresh') return;
      const updated = createLifeActionDraft('form-race');
      updated.setTimePlanning({
        estimateMinutes: 90,
        scheduledStartMinute: null,
        scheduledDurationMinutes: null,
      });
      setAction(updated);
    };
    window.addEventListener('message', refresh);
    return () => window.removeEventListener('message', refresh);
  }, []);
  return (
    <div className="planner-v2">
      <p>Версия записи: {action.version}</p>
      {open && (
        <PlannerActionTimeSheet
          action={action}
          onClose={() => setOpen(false)}
          onSave={async (_id, _estimate, _start, _duration, expectedVersion) => {
            if (expectedVersion !== action.version)
              throw new Error('Действие изменилось. Откройте планирование времени заново.');
          }}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById('form-root')!).render(<TimeFormRegression />);
