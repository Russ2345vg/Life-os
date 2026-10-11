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
  day,
  service,
  busy,
  onApplied,
  onSelectDay,
  onBack,
}: {
  readonly date: DayDate;
  readonly day: 'today' | 'tomorrow';
  readonly service?:
    | (Pick<DayAutopilotService, 'preview' | 'apply'> &
        Partial<
          Pick<DayAutopilotService, 'getSetup' | 'savePreferences' | 'saveDraft' | 'readSchedule'>
        >)
    | undefined;
  readonly busy: boolean;
  readonly onApplied: () => Promise<void> | void;
  readonly onSelectDay: (day: 'today' | 'tomorrow') => void;
  readonly onBack: () => void;
}) {
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date.toString()}T12:00:00Z`));
  return (
    <div className="routine-subpage">
      <RoutineBack onBack={onBack} />
      <header className="routine-subpage__heading">
        <p className="planner-eyebrow">Распорядок · день</p>
        <h1 id="routine-autopilot-title">Автопилот дня</h1>
        <p>Соберите план и проверьте его перед применением.</p>
      </header>
      <div className="planner-page-heading routine-autopilot-day">
        <p className="planner-eyebrow">
          {day === 'tomorrow' ? 'План на завтра' : 'План на сегодня'} ·{' '}
          <time dateTime={date.toString()}>{dateLabel}</time>
        </p>
        <div className="planner-day-switch" role="group" aria-label="День автопилота">
          <button
            type="button"
            aria-pressed={day === 'today'}
            disabled={busy}
            onClick={() => onSelectDay('today')}
          >
            Сегодня
          </button>
          <button
            type="button"
            aria-pressed={day === 'tomorrow'}
            disabled={busy}
            onClick={() => onSelectDay('tomorrow')}
          >
            Завтра
          </button>
        </div>
      </div>
      {service ? (
        <DayAutopilotCard
          key={date.toString()}
          date={date}
          day={day}
          service={service}
          busy={busy}
          onApplied={onApplied}
        />
      ) : (
        <p role="alert">Автопилот недоступен в этой сборке.</p>
      )}
    </div>
  );
}
