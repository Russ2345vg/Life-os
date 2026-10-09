import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLifeOsApplication } from '../../../src/app/composition/createLifeOsApplication';
import type { DesktopFocusWindow } from '../../../src/application/ports/DesktopFocusWindow';
import { LifeActionTitle } from '../../../src/domain';
import { LocalPomodoroPreferences } from '../../../src/infrastructure/time/LocalPomodoroPreferences';
import {
  ActionPomodoro,
  type PomodoroSelection,
} from '../../../src/presentation/planner-v2/ActionPomodoro';
import { usePlannerWorkTime } from '../../../src/presentation/planner-v2/usePlannerWorkTime';
import '../../../src/presentation/styles/tokens.css';
import '../../../src/presentation/planner-v2/planner-v2.css';
import '../../../src/presentation/planner-v2/planner-master.css';
import '../../../src/presentation/planner-v2/planner-premium.css';

// Only the OS window port fails; real application commands and persistence remain in use.
const app = await createLifeOsApplication();
const created = await app.createLifeActionDraft.execute({
  title: LifeActionTitle.create('Фокус ошибки окна'),
});
if (!created.ok) throw created.error;
const action = created.value;
let compact = false;
let listener: (compact: boolean, error?: string) => void = () => {};
const port: DesktopFocusWindow = {
  available: true,
  async subscribe(callback) {
    listener = callback;
    callback(false);
    return () => {
      listener = () => {};
    };
  },
  async setActive(active) {
    if (!active && compact) throw new Error('QA restore failure');
  },
  async restore() {
    compact = false;
    listener(false);
  },
  async drag() {},
};
const preferences = new LocalPomodoroPreferences(localStorage);
function Harness() {
  const [selection, setSelection] = useState<PomodoroSelection | null>({
    actionId: action.id.toString(),
    title: action.title.toString(),
  });
  const workTime = usePlannerWorkTime(app.workSessions);
  return (
    <div className="planner-v2">
      <button
        type="button"
        onClick={() => {
          compact = true;
          listener(true);
        }}
      >
        Свернуть тестовое окно
      </button>
      <ActionPomodoro
        selection={selection}
        onCloseSelection={() => setSelection(null)}
        workTime={workTime}
        service={app.workSessions}
        preferences={preferences}
        desktopWindow={port}
        onOpenWorkTime={() => {}}
      />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
