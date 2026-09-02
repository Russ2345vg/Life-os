import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import type {
  Clock,
  GetMorningPhysicalExecutionOverview,
  MorningCycleApplicationService,
  MorningPhysicalExecutionOverview,
} from '../../application';
import { EXERCISE_MEASUREMENT_TYPE, MORNING_PHYSICAL_SET_STATUS, type DayDate } from '../../domain';

export type PhysicalExecutionPendingAction =
  'recover' | 'pause' | 'resume' | 'complete-set' | 'skip-set' | 'advance' | 'finish';

export interface MorningPhysicalExecutionViewProps {
  readonly overview: MorningPhysicalExecutionOverview;
  readonly displayWorkedDurationMs: number;
  readonly actualInput: string;
  readonly pendingAction: PhysicalExecutionPendingAction | null;
  readonly mutationError: string | null;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly actualInputRef?: Ref<HTMLInputElement>;
  readonly onBack: () => void;
  readonly onActualInputChange: (value: string) => void;
  readonly onRecover: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onCompleteSet: () => void;
  readonly onSkipSet: () => void;
  readonly onAdvance: () => void;
  readonly onFinish: () => void;
}

interface MorningPhysicalExecutionPageProps {
  readonly date: DayDate;
  readonly getOverview: Pick<GetMorningPhysicalExecutionOverview, 'execute'>;
  readonly cycle: Pick<
    MorningCycleApplicationService,
    | 'recoverPhysicalExecution'
    | 'pausePhysicalExecution'
    | 'resumePhysicalExecution'
    | 'completePhysicalSet'
    | 'skipPhysicalSet'
    | 'advancePhysicalExecution'
    | 'completePhysicalExecution'
  >;
  readonly clock: Pick<Clock, 'now'>;
  readonly onBack: () => void;
  readonly onCompleted: () => void;
}

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly overview: MorningPhysicalExecutionOverview;
      readonly baselineNow: Date;
    };

export function MorningPhysicalExecutionPage(props: MorningPhysicalExecutionPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [actualInput, setActualInput] = useState('');
  const [pendingAction, setPendingAction] = useState<PhysicalExecutionPendingAction | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [displayNow, setDisplayNow] = useState(() => props.clock.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actualInputRef = useRef<HTMLInputElement>(null);
  const focusActualAfterLoad = useRef(false);
  const initialHeadingFocused = useRef(false);

  const load = useCallback(async (): Promise<MorningPhysicalExecutionOverview> => {
    const overview = await props.getOverview.execute(props.date);
    const baselineNow = props.clock.now();
    setDisplayNow(baselineNow);
    setLoadState({ status: 'ready', overview, baselineNow });
    return overview;
  }, [props.clock, props.date, props.getOverview]);

  useEffect(() => {
    let active = true;
    void props.getOverview
      .execute(props.date)
      .then((overview) => {
        if (!active) return;
        const baselineNow = props.clock.now();
        setDisplayNow(baselineNow);
        setLoadState({ status: 'ready', overview, baselineNow });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Не удалось загрузить выполнение.',
        });
      });
    return () => {
      active = false;
    };
  }, [props.clock, props.date, props.getOverview]);

  useEffect(() => {
    if (loadState.status !== 'ready') return;
    if (focusActualAfterLoad.current && loadState.overview.canResolve) {
      focusActualAfterLoad.current = false;
      actualInputRef.current?.focus();
      return;
    }
    if (!initialHeadingFocused.current) {
      initialHeadingFocused.current = true;
      headingRef.current?.focus();
    }
  }, [loadState]);

  useEffect(() => {
    if (loadState.status !== 'ready' || !loadState.overview.canPause) return;
    const timer = window.setInterval(() => setDisplayNow(props.clock.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [loadState, props.clock]);

  const displayWorkedDurationMs = useMemo(() => {
    if (loadState.status !== 'ready') return 0;
    return (
      loadState.overview.workedDurationMs +
      (loadState.overview.canPause
        ? Math.max(0, displayNow.getTime() - loadState.baselineNow.getTime())
        : 0)
    );
  }, [displayNow, loadState]);

  const mutate = useCallback(
    async (
      action: PhysicalExecutionPendingAction,
      command: () => Promise<unknown>,
      options: { readonly clearActual?: boolean; readonly complete?: boolean } = {},
    ): Promise<void> => {
      if (pendingAction !== null) return;
      setPendingAction(action);
      setMutationError(null);
      const result = await runPhysicalCommandAndReload(command, load);
      try {
        if (!result.ok) {
          if (result.phase === 'reload') {
            setLoadState({ status: 'error', message: result.message });
          } else {
            setMutationError(result.message);
          }
          return;
        }
        if (options.clearActual === true) setActualInput('');
        if (options.complete === true) props.onCompleted();
      } finally {
        setPendingAction(null);
      }
    },
    [load, pendingAction, props],
  );

  if (loadState.status === 'loading') {
    return <div className="morning-execution-state">Загружаем выполнение…</div>;
  }
  if (loadState.status === 'error') {
    const retry = (): void => {
      setLoadState({ status: 'loading' });
      void load().catch((error: unknown) =>
        setLoadState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Не удалось загрузить выполнение.',
        }),
      );
    };
    return (
      <div className="morning-execution-state" role="alert">
        <p>{loadState.message}</p>
        <button type="button" onClick={retry}>
          Повторить
        </button>
        <button type="button" onClick={props.onBack}>
          Вернуться к плану
        </button>
      </div>
    );
  }

  const overview = loadState.overview;
  const currentSet = overview.currentSet;
  const completeSet = (): void => {
    if (currentSet === null) return;
    const actual = parsePhysicalActual(actualInput, currentSet.measurementType);
    if (!actual.ok) {
      setMutationError(actual.message);
      return;
    }
    void mutate(
      'complete-set',
      () =>
        props.cycle.completePhysicalSet(
          props.date,
          currentSet.exerciseDefinitionId,
          currentSet.setNumber,
          actual.value,
        ),
      { clearActual: true },
    );
  };

  return (
    <MorningPhysicalExecutionView
      overview={overview}
      displayWorkedDurationMs={displayWorkedDurationMs}
      actualInput={actualInput}
      pendingAction={pendingAction}
      mutationError={mutationError}
      headingRef={headingRef}
      actualInputRef={actualInputRef}
      onBack={props.onBack}
      onActualInputChange={setActualInput}
      onRecover={() =>
        void mutate('recover', () => props.cycle.recoverPhysicalExecution(props.date))
      }
      onPause={() => void mutate('pause', () => props.cycle.pausePhysicalExecution(props.date))}
      onResume={() => void mutate('resume', () => props.cycle.resumePhysicalExecution(props.date))}
      onCompleteSet={completeSet}
      onSkipSet={() => {
        if (currentSet === null) return;
        void mutate(
          'skip-set',
          () =>
            props.cycle.skipPhysicalSet(
              props.date,
              currentSet.exerciseDefinitionId,
              currentSet.setNumber,
            ),
          { clearActual: true },
        );
      }}
      onAdvance={() => {
        focusActualAfterLoad.current = true;
        void mutate('advance', () => props.cycle.advancePhysicalExecution(props.date));
      }}
      onFinish={() =>
        void mutate('finish', () => props.cycle.completePhysicalExecution(props.date), {
          complete: true,
        })
      }
    />
  );
}

export function MorningPhysicalExecutionView({
  overview,
  displayWorkedDurationMs,
  actualInput,
  pendingAction,
  mutationError,
  headingRef,
  actualInputRef,
  onBack,
  onActualInputChange,
  onRecover,
  onPause,
  onResume,
  onCompleteSet,
  onSkipSet,
  onAdvance,
  onFinish,
}: MorningPhysicalExecutionViewProps) {
  const busy = pendingAction !== null;
  const currentSet = overview.currentSet;
  const unavailable =
    overview.state === 'unavailable' ||
    overview.state === 'unrecoverable' ||
    overview.state === 'legacy-completed';
  const statusText = executionStatusText(overview.state);
  const progressItems = buildMorningPhysicalProgressItems(overview);

  return (
    <section className="morning-execution" aria-busy={busy}>
      <div className="morning-execution-navigation">
        <button type="button" onClick={onBack}>
          ← Утренний центр
        </button>
        <span>Этап 02</span>
      </div>
      <header className="morning-execution-header">
        <div>
          <p className="morning-execution-status" aria-live="polite">
            {statusText}
          </p>
          <h2 ref={headingRef} tabIndex={-1}>
            Физическая активация
          </h2>
        </div>
        <p role="timer" aria-label={`Прошло ${formatDuration(displayWorkedDurationMs)}`}>
          {formatDuration(displayWorkedDurationMs)}
        </p>
      </header>

      {pendingAction !== null ? (
        <p className="morning-execution-pending" aria-live="polite">
          {pendingLabel(pendingAction)}
        </p>
      ) : null}
      {mutationError === null ? null : (
        <p className="morning-execution-error" role="alert">
          {mutationError}
        </p>
      )}

      {overview.state === 'recoverable' ? (
        <div className="morning-execution-state-card">
          <p>Сохранённое выполнение требует безопасного восстановления.</p>
          <button type="button" disabled={busy || !overview.canRecover} onClick={onRecover}>
            {pendingAction === 'recover' ? 'Восстанавливаем…' : 'Восстановить выполнение'}
          </button>
        </div>
      ) : null}

      {overview.state === 'unrecoverable' ? (
        <div className="morning-execution-state-card">
          <p>Безопасное восстановление недоступно: в сохранённом запуске нет плана.</p>
          <button type="button" onClick={onBack}>
            Вернуться к плану
          </button>
        </div>
      ) : null}

      {overview.state === 'unavailable' ? (
        <div className="morning-execution-state-card">
          <p>Выполнение ещё не начато.</p>
          <button type="button" onClick={onBack}>
            Вернуться к плану
          </button>
        </div>
      ) : null}

      {overview.state === 'legacy-completed' ? (
        <div className="morning-execution-state-card">
          <p>Подробные результаты подходов не записывались.</p>
          <button type="button" onClick={onBack}>
            Вернуться к плану
          </button>
        </div>
      ) : null}

      {!unavailable && overview.state !== 'recoverable' ? (
        <>
          <div className="morning-execution-layout">
            <article className="morning-execution-current">
              {currentSet === null ? null : (
                <>
                  <div className="morning-execution-progress">
                    <span>
                      Упражнение {currentSet.exerciseIndex} из {currentSet.exerciseCount}
                    </span>
                    <span>
                      Подход {currentSet.setNumber} из {currentSet.setCount}
                    </span>
                    <span>
                      Выполнено {overview.resolvedSets} из {overview.totalSets} подходов
                    </span>
                  </div>
                  <h3>{currentSet.name}</h3>
                  <p id="morning-execution-target">План: {plannedTarget(currentSet)}</p>
                  {currentSet.status === MORNING_PHYSICAL_SET_STATUS.pending ? (
                    <div className="morning-execution-actual">
                      <label htmlFor="morning-execution-actual">Фактически</label>
                      <div>
                        <input
                          ref={actualInputRef}
                          id="morning-execution-actual"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={
                            currentSet.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                              ? 1000
                              : 3600
                          }
                          step={1}
                          value={actualInput}
                          disabled={busy || !overview.canResolve}
                          aria-invalid={mutationError !== null}
                          aria-describedby="morning-execution-target"
                          onChange={(event) => onActualInputChange(event.currentTarget.value)}
                        />
                        <span>
                          {currentSet.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                            ? 'повторений'
                            : 'секунд'}
                        </span>
                      </div>
                      <div className="morning-execution-set-actions">
                        <button
                          type="button"
                          disabled={busy || !overview.canResolve}
                          onClick={onCompleteSet}
                        >
                          Завершить подход
                        </button>
                        <button
                          type="button"
                          disabled={busy || !overview.canResolve}
                          onClick={onSkipSet}
                        >
                          Пропустить подход
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="morning-execution-result">
                      <p>{resolvedFact(currentSet)}</p>
                      {overview.canAdvance ? (
                        <button type="button" disabled={busy} onClick={onAdvance}>
                          Следующий подход
                        </button>
                      ) : null}
                    </div>
                  )}
                </>
              )}
              {overview.state === 'completed' ? (
                <p className="morning-execution-complete">Физическая активация завершена.</p>
              ) : null}
            </article>

            <aside className="morning-execution-summary">
              <h3>Факты выполнения</h3>
              <ul>
                <li>Выполнено подходов: {overview.completedSets}</li>
                <li>Пропущено подходов: {overview.skippedSets}</li>
                <li>Осталось подходов: {overview.totalSets - overview.resolvedSets}</li>
                <li>Фактические повторения: {overview.totalActualReps}</li>
                <li>Фактическое время: {overview.totalActualDurationSeconds} сек</li>
                <li>Время выполнения: {formatDuration(displayWorkedDurationMs)}</li>
              </ul>
              <div className="morning-execution-overall-actions">
                {overview.canPause ? (
                  <button type="button" disabled={busy} onClick={onPause}>
                    Поставить на паузу
                  </button>
                ) : null}
                {overview.canResume ? (
                  <button type="button" disabled={busy} onClick={onResume}>
                    Продолжить выполнение
                  </button>
                ) : null}
                {overview.canFinish ? (
                  <button type="button" disabled={busy} onClick={onFinish}>
                    Завершить физическую активацию
                  </button>
                ) : null}
              </div>
            </aside>
          </div>
          <section
            className="morning-execution-plan-progress"
            aria-labelledby="execution-plan-progress"
          >
            <h3 id="execution-plan-progress">Прогресс плана</h3>
            <ol>
              {progressItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </section>
  );
}

export function parsePhysicalActual(
  value: string,
  measurementType:
    typeof EXERCISE_MEASUREMENT_TYPE.repetitions | typeof EXERCISE_MEASUREMENT_TYPE.duration,
):
  | {
      readonly ok: true;
      readonly value:
        | {
            readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
            readonly actualReps: number;
          }
        | {
            readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
            readonly actualDurationSeconds: number;
          };
    }
  | { readonly ok: false; readonly message: string } {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return {
      ok: false,
      message:
        measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? 'Введите целое число фактических повторений.'
          : 'Введите целое число фактических секунд.',
    };
  }
  const number = Number(trimmed);
  if (!Number.isSafeInteger(number)) {
    return { ok: false, message: 'Фактический результат указан неверно.' };
  }
  return measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? { ok: true, value: { measurementType, actualReps: number } }
    : { ok: true, value: { measurementType, actualDurationSeconds: number } };
}

export async function runPhysicalCommandAndReload<T>(
  command: () => Promise<unknown>,
  reload: () => Promise<T>,
): Promise<
  | { readonly ok: true; readonly overview: T }
  | { readonly ok: false; readonly phase: 'command' | 'reload'; readonly message: string }
> {
  try {
    await command();
  } catch (error: unknown) {
    return {
      ok: false,
      phase: 'command',
      message: error instanceof Error ? error.message : 'Не удалось сохранить действие.',
    };
  }
  try {
    return { ok: true, overview: await reload() };
  } catch (error: unknown) {
    return {
      ok: false,
      phase: 'reload',
      message:
        error instanceof Error
          ? error.message
          : 'Действие сохранено, но актуальное состояние не загрузилось.',
    };
  }
}

export function buildMorningPhysicalProgressItems(
  overview: MorningPhysicalExecutionOverview,
): readonly string[] {
  const items = [
    overview.currentSet === null
      ? 'Текущий подход недоступен'
      : `Текущая позиция: подход ${overview.currentSet.globalSetIndex} из ${overview.currentSet.globalSetCount}`,
    `Разрешено подходов: ${overview.resolvedSets} из ${overview.totalSets}`,
    `Выполнено: ${overview.completedSets}`,
    `Пропущено: ${overview.skippedSets}`,
    `Осталось: ${Math.max(0, overview.totalSets - overview.resolvedSets)}`,
  ];
  return Object.freeze(items);
}

function plannedTarget(
  currentSet: NonNullable<MorningPhysicalExecutionOverview['currentSet']>,
): string {
  return currentSet.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? `${currentSet.targetReps} повторений`
    : `${currentSet.targetDurationSeconds} секунд`;
}

function resolvedFact(
  currentSet: NonNullable<MorningPhysicalExecutionOverview['currentSet']>,
): string {
  if (currentSet.status === MORNING_PHYSICAL_SET_STATUS.skipped) return 'Подход пропущен';
  return currentSet.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? `Фактически: ${currentSet.actualReps} повторений`
    : `Фактически: ${currentSet.actualDurationSeconds} секунд`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function pendingLabel(action: PhysicalExecutionPendingAction): string {
  return {
    recover: 'Восстанавливаем…',
    pause: 'Ставим на паузу…',
    resume: 'Продолжаем…',
    'complete-set': 'Сохраняем подход…',
    'skip-set': 'Пропускаем…',
    advance: 'Открываем следующий подход…',
    finish: 'Завершаем…',
  }[action];
}

function executionStatusText(state: MorningPhysicalExecutionOverview['state']): string {
  return {
    unavailable: 'Не начато',
    recoverable: 'Требуется восстановление',
    unrecoverable: 'Восстановление недоступно',
    running: 'Выполнение идёт',
    paused: 'На паузе',
    'awaiting-advance': 'Подход сохранён',
    'ready-to-finish': 'Готово к завершению',
    completed: 'Завершено',
    'legacy-completed': 'Завершено',
  }[state];
}
