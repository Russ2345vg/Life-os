import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DayDate } from '../../src/domain';
import type { ManagementOverviewSnapshot } from '../../src/application';
import { ManagementOverview } from '../../src/presentation/management/ManagementOverview';
import '../../src/presentation/styles/global.css';

// A controlled query port lets browser tests exercise the real component's asynchronous states.
// It is test-only and never connects to a user's database or sync account.
const pending: {
  resolve: (value: ManagementOverviewSnapshot) => void;
  reject: (error: Error) => void;
}[] = [];
const query = {
  execute: () =>
    new Promise<ManagementOverviewSnapshot>((resolve, reject) => pending.push({ resolve, reject })),
};
const snapshot: ManagementOverviewSnapshot = {
  focus: { kind: 'direction', id: 'direction-test', title: 'Тестовое направление' },
  today: { mainDecision: null, decisionCount: 0, actionCount: 0, currentSession: null },
  course: { activeDirectionCount: 1, activeProjectCount: 0 },
  signals: [],
};
function Fixture() {
  const [date, setDate] = useState(DayDate.create('2026-09-09'));
  return (
    <>
      <nav aria-label="Fixture controls">
        <button onClick={() => pending.shift()?.resolve(snapshot)}>Resolve query</button>
        <button onClick={() => pending.shift()?.reject(new Error('Test read failure'))}>
          Reject query
        </button>
        <button onClick={() => setDate(DayDate.create('2026-09-10'))}>Change date</button>
      </nav>
      <div className="management-page">
        <ManagementOverview
          currentDate={date}
          getManagementOverview={query}
          onOpenSection={() => undefined}
          onOpenProject={() => undefined}
          onOpenDirection={() => undefined}
          onOpenDecision={() => undefined}
        />
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
