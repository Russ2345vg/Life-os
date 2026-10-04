import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  MorningWorkoutService,
  MorningWorkoutSetSnapshot,
  MorningWorkoutSnapshot,
} from '../../application';
import { EXERCISE_MEASUREMENT_TYPE } from '../../domain';
import './morning-workout.css';

export function MorningWorkoutCard({
  service,
  onSnapshotChange,
}: {
  readonly service: MorningWorkoutService;
  readonly onSnapshotChange?: (snapshot: MorningWorkoutSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState<MorningWorkoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandRunning = useRef(false);
  const publish = useCallback(
    (next: MorningWorkoutSnapshot) => {
      setSnapshot(next);
      onSnapshotChange?.(next);
    },
    [onSnapshotChange],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      publish(await service.get());
    } catch (reason: unknown) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [publish, service]);
  useEffect(() => {
    void load();
    return service.subscribe(() => void load());
  }, [load, service]);

  const run = (command: () => Promise<MorningWorkoutSnapshot>) => {
    if (commandRunning.current) return;
    commandRunning.current = true;
    setBusy(true);
    setError(null);
    void command()
      .then(publish)
      .catch((reason: unknown) => setError(messageOf(reason)))
      .finally(() => {
        commandRunning.current = false;
        setBusy(false);
      });
  };

  return (
    <MorningWorkoutCardView
      snapshot={snapshot}
      loading={loading}
      error={error}
      busy={busy}
      onRetry={() => void load()}
      onStart={() => run(() => service.start())}
      onSkipWorkout={() => run(() => service.skip())}
      onCompleteSet={(set, actual) =>
        run(() =>
          service.completeCurrentSet({
            exerciseDefinitionId: set.exerciseDefinitionId,
            setNumber: set.setNumber,
            actual,
          }),
        )
      }
      onSkipSet={(set) =>
        run(() =>
          service.skipCurrentSet({
            exerciseDefinitionId: set.exerciseDefinitionId,
            setNumber: set.setNumber,
          }),
        )
      }
      onAcceptRecommendation={() => run(() => service.acceptRecommendation())}
      onDismissRecommendation={() => run(() => service.dismissRecommendation())}
    />
  );
}

export function MorningWorkoutCardView({
  snapshot,
  loading,
  error = null,
  busy = false,
  onRetry,
  onStart,
  onSkipWorkout,
  onCompleteSet,
  onSkipSet,
  onAcceptRecommendation,
  onDismissRecommendation,
}: {
  readonly snapshot: MorningWorkoutSnapshot | null;
  readonly loading: boolean;
  readonly error?: string | null;
  readonly busy?: boolean;
  readonly onRetry: () => void;
  readonly onStart: () => void;
  readonly onSkipWorkout: () => void;
  readonly onCompleteSet: (set: MorningWorkoutSetSnapshot, actual: number) => void;
  readonly onSkipSet: (set: MorningWorkoutSetSnapshot) => void;
  readonly onAcceptRecommendation: () => void;
  readonly onDismissRecommendation: () => void;
}) {
  if (loading && snapshot === null) {
    return (
      <section className="morning-workout" aria-busy="true" aria-labelledby="morning-workout-title">
        <p className="planner-eyebrow">Утренний ритуал · Шаг 1</p>
        <h2 id="morning-workout-title">Утренняя зарядка</h2>
        <p className="planner-muted">Загружаю зарядку…</p>
      </section>
    );
  }
  if (snapshot === null) {
    return (
      <section className="morning-workout" aria-labelledby="morning-workout-title">
        <p className="planner-eyebrow">Утренний ритуал · Шаг 1</p>
        <h2 id="morning-workout-title">Утренняя зарядка</h2>
        <p className="planner-error" role="alert">
          {error ?? 'Не удалось загрузить зарядку.'}
        </p>
        <button type="button" onClick={onRetry}>Повторить</button>
      </section>
    );
  }

  const inProgress = snapshot.status === 'IN_PROGRESS';
  return (
    <section
      className={`morning-workout morning-workout--${snapshot.status.toLowerCase()}`}
      aria-labelledby="morning-workout-title"
      aria-busy={busy}
    >
      <header className="morning-workout__header">
        <div>
          <p className="planner-eyebrow">Утренний ритуал · Шаг 1</p>
          <h2 id="morning-workout-title">Утренняя зарядка</h2>
          <p className="planner-muted">≈ {snapshot.estimatedMinutes} минут · турник и коврик · без таймера</p>
        </div>
        <strong className="morning-workout__progress">
          {snapshot.completedSets} из {snapshot.totalSets} подходов
        </strong>
      </header>

      {snapshot.status === 'COMPLETED' ? (
        <p className="morning-workout__status morning-workout__status--success">Зарядка выполнена</p>
      ) : null}
      {snapshot.status === 'SKIPPED' ? (
        <p className="morning-workout__status">Зарядка пропущена сегодня</p>
      ) : null}
      {error ? <p className="planner-error" role="alert">{error}</p> : null}

      {snapshot.status === 'NOT_STARTED' ? (
        <div className="morning-workout__actions">
          <button className="planner-primary" type="button" disabled={busy} onClick={onStart}>
            Начать зарядку
          </button>
          <button type="button" disabled={busy} onClick={onSkipWorkout}>Пропустить сегодня</button>
        </div>
      ) : null}

      {snapshot.status !== 'SKIPPED' ? (
        <ol className="morning-workout__exercises">
          {snapshot.items.map((item) => (
            <li key={item.exerciseDefinitionId} className="morning-workout__exercise">
              <div className="morning-workout__exercise-heading">
                <strong>{item.exerciseName}</strong>
                <span>{planLabel(item.sets.length, item.target, item.measurementType)}</span>
              </div>
              <ol className="morning-workout__sets" aria-label={`Подходы: ${item.exerciseName}`}>
                {item.sets.map((set) => (
                  <WorkoutSetRow
                    key={set.setNumber}
                    set={set}
                    busy={busy}
                    inProgress={inProgress}
                    onComplete={onCompleteSet}
                    onSkip={onSkipSet}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : null}

      {snapshot.recommendation ? (
        <section className="morning-workout__recommendation" aria-labelledby="morning-workout-recommendation-title">
          <h3 id="morning-workout-recommendation-title">Нагрузка на следующее утро</h3>
          {snapshot.recommendation.changes.length ? (
            <ul>
              {snapshot.recommendation.changes.map((change) => (
                <li key={change.exerciseDefinitionId}>
                  {change.exerciseName}: {change.from} → {change.to}{' '}
                  {change.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                    ? 'повторений'
                    : 'секунд'}
                </li>
              ))}
            </ul>
          ) : null}
          {snapshot.recommendation.status === 'PENDING' ? (
            <div className="morning-workout__actions">
              <button className="planner-primary" type="button" disabled={busy} onClick={onAcceptRecommendation}>
                Принять на завтра
              </button>
              <button type="button" disabled={busy} onClick={onDismissRecommendation}>Оставить текущую</button>
            </div>
          ) : (
            <p className="planner-muted">
              {snapshot.recommendation.status === 'ACCEPTED'
                ? 'Новая нагрузка принята.'
                : 'Текущая нагрузка сохранена.'}
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}

function WorkoutSetRow({
  set,
  busy,
  inProgress,
  onComplete,
  onSkip,
}: {
  readonly set: MorningWorkoutSetSnapshot;
  readonly busy: boolean;
  readonly inProgress: boolean;
  readonly onComplete: (set: MorningWorkoutSetSnapshot, actual: number) => void;
  readonly onSkip: (set: MorningWorkoutSetSnapshot) => void;
}) {
  const unit = set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions ? 'повт.' : 'сек.';
  if (set.status === 'COMPLETED') {
    return <li className="morning-workout__set morning-workout__set--done">{set.setNumber}. {set.actual} {unit} выполнено</li>;
  }
  if (set.status === 'SKIPPED') {
    return <li className="morning-workout__set morning-workout__set--skipped">{set.setNumber}. Пропущено</li>;
  }
  if (!set.current || !inProgress) {
    return <li className="morning-workout__set">{set.setNumber}. Цель {set.target} {unit}</li>;
  }
  const inputLabel = `${
    set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
      ? 'Фактические повторения'
      : 'Фактические секунды'
  }: ${set.exerciseName}, подход ${set.setNumber}`;
  return (
    <li className="morning-workout__set morning-workout__set--current">
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onComplete(set, Number(form.get('actual')));
        }}
      >
        <span>{set.setNumber}. Цель {set.target} {unit}</span>
        <input
          aria-label={inputLabel}
          name="actual"
          type="number"
          min={1}
          max={set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions ? 1000 : 3600}
          step={1}
          defaultValue={set.target}
          disabled={busy}
          required
        />
        <button className="planner-primary" type="submit" disabled={busy}>Готово</button>
        <button type="button" disabled={busy} onClick={() => onSkip(set)}>Пропустить подход</button>
      </form>
    </li>
  );
}

function planLabel(sets: number, target: number, measurementType: string): string {
  return measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? `${sets} × ${target} повт.`
    : `${sets} × ${target} сек.`;
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Не удалось сохранить результат зарядки.';
}
