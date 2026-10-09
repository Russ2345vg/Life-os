import { useState } from 'react';
import type { ActionSession, DayDate, LifeAction } from '../../domain';
import type {
  DayAutopilotService,
  MorningWorkoutService,
  PlannerTodayOverview,
} from '../../application';
import { MorningWorkoutCard } from './MorningWorkoutCard';
import { MorningFocusCard } from './MorningFocusCard';
import { DayAutopilotCard } from './DayAutopilotCard';

function RoutineBack({ onBack }: { readonly onBack: () => void }) {
  return (
    <button className="planner-text-link routine-page__back" type="button" onClick={onBack}>
      ← Распорядок
    </button>
  );
}

export function RoutineMorningPage({
  date,
  overview,
  sessions,
  workout,
  onStartFocus,
  onOpenToday,
  onBack,
}: {
  readonly date: DayDate;
  readonly overview: PlannerTodayOverview;
  readonly sessions: readonly ActionSession[] | null;
  readonly workout?: MorningWorkoutService | undefined;
  readonly onStartFocus: (action: LifeAction) => void;
  readonly onOpenToday: () => void;
  readonly onBack: () => void;
}) {
  const [workoutResolved, setWorkoutResolved] = useState(workout === undefined);
  return (
    <section className="routine-subpage" aria-labelledby="routine-morning-title">
      <RoutineBack onBack={onBack} />
      <header className="routine-subpage__heading">
        <p className="planner-eyebrow">Распорядок · утро</p>
        <h1 id="routine-morning-title">Утренние практики</h1>
        <p>Зарядка и фокус в начале дня.</p>
      </header>
      {workout ? (
        <MorningWorkoutCard
          service={workout}
          onSnapshotChange={(snapshot) => setWorkoutResolved(snapshot.focusUnlocked)}
        />
      ) : null}
      <MorningFocusCard
        dateKey={date.toString()}
        action={overview.main}
        sessions={sessions}
        onStart={onStartFocus}
        unlocked={workoutResolved}
      />
      {overview.main === null ? (
        <button
          className="planner-text-link routine-subpage__next"
          type="button"
          onClick={onOpenToday}
        >
          Выбрать главное действие в плане на сегодня →
        </button>
      ) : null}
    </section>
  );
}

export function RoutineAutopilotPage({
  date,
  service,
  busy,
  onApplied,
  onBack,
}: {
  readonly date: DayDate;
  readonly service?: Pick<DayAutopilotService, 'preview' | 'apply'> | undefined;
  readonly busy: boolean;
  readonly onApplied: () => Promise<void> | void;
  readonly onBack: () => void;
}) {
  return (
    <div className="routine-subpage">
      <RoutineBack onBack={onBack} />
      <header className="routine-subpage__heading">
        <p className="planner-eyebrow">Распорядок · день</p>
        <h1 id="routine-autopilot-title">Автопилот дня</h1>
        <p>Соберите план и проверьте его перед применением.</p>
      </header>
      {service ? (
        <DayAutopilotCard date={date} service={service} busy={busy} onApplied={onApplied} />
      ) : (
        <p role="alert">Автопилот недоступен в этой сборке.</p>
      )}
    </div>
  );
}
