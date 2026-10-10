import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLifeOsApplication } from '../../src/app/composition/createLifeOsApplication';
import { DayDate } from '../../src/domain';
import { DayAutopilotCard } from '../../src/presentation/planner-v2/DayAutopilotCard';
import type { AutopilotSetup } from '../../src/application/planner/DayAutopilotService';
import type { DayAutopilotClient } from '../../src/presentation/planner-v2/PreferenceAutopilotCard';
import '../../src/presentation/styles/tokens.css';
import '../../src/presentation/planner-v2/planner-v2.css';
import '../../src/presentation/planner-v2/planner-master.css';
import '../../src/presentation/planner-v2/planner-premium.css';
const app = await createLifeOsApplication();
const source = app.dayAutopilot!;
const pending: Array<() => void> = [];
const service: DayAutopilotClient = {
  getSetup: async (date) => {
    const setup = await source.getSetup(date);
    return date.toString() === '2026-10-10'
      ? new Promise<AutopilotSetup>((resolve) => pending.push(() => resolve(setup)))
      : setup;
  },
  savePreferences: (value, version) => source.savePreferences(value, version),
  saveDraft: (value, version) => source.saveDraft(value, version),
  preview: (input) => source.preview(input),
  apply: (preview) => source.apply(preview),
  readSchedule: (from, to) => source.readSchedule(from, to),
};
function Fixture() {
  const [date, setDate] = useState('2026-10-10');
  const [changed, setChanged] = useState(false);
  return (
    <div className="planner-v2">
      <button onClick={() => setDate('2026-10-11')}>Показать 11 октября</button>
      <button onClick={() => pending.splice(0).forEach((resolve) => resolve())}>
        Завершить старую загрузку
      </button>
      <button
        onClick={() =>
          void source
            .getSetup(DayDate.create(date))
            .then((setup) =>
              source.saveDraft(
                { ...setup.draft.value, wishes: 'Текст другого редактора' },
                setup.draft.version,
              ),
            )
            .then(() => setChanged(true))
        }
      >
        Изменить черновик извне
      </button>
      {changed && <p>Внешнее сохранение завершено</p>}
      <DayAutopilotCard
        date={DayDate.create(date)}
        service={service}
        busy={false}
        onApplied={() => {}}
      />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
