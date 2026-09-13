import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  GetMorningPhysicalActivationOverview,
  MorningExerciseCatalogService,
  MorningPhysicalActivationOverview,
  MorningPhysicalSelectedItem,
  MorningCycleApplicationService,
} from '../../application';
import {
  EXERCISE_MEASUREMENT_TYPE,
  type DayDate,
  type EntityId,
  type ExerciseMeasurementType,
  type MorningPhysicalPlanAdjustment,
} from '../../domain';
import { MorningExerciseIcon } from '../components/MorningExerciseIcon';
import { exerciseCountLabel, setsCountLabel } from './MorningPhysicalCopy';

type PhysicalPendingAction = 'toggle' | 'adjust' | 'create' | 'start';

interface MorningPhysicalActivationPageProps {
  readonly date: DayDate;
  readonly getOverview: Pick<GetMorningPhysicalActivationOverview, 'execute'>;
  readonly cycle: Pick<
    MorningCycleApplicationService,
    | 'selectPhysicalExercise'
    | 'deselectPhysicalExercise'
    | 'adjustPhysicalExercise'
    | 'startPhysicalExecution'
  >;
  readonly exerciseCatalog: Pick<MorningExerciseCatalogService, 'createCustom'>;
  readonly onBack: () => void;
  readonly onExecutionStarted: () => void;
}

type PhysicalLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly overview: MorningPhysicalActivationOverview };

export interface MorningPhysicalActivationViewProps {
  readonly overview: MorningPhysicalActivationOverview;
  readonly pendingAction: PhysicalPendingAction | null;
  readonly mutationError: string | null;
  readonly customFormOpen: boolean;
  readonly customName: string;
  readonly customMeasurementType: ExerciseMeasurementType;
  readonly onBack: () => void;
  readonly onToggleExercise: (id: EntityId, selected: boolean) => void;
  readonly onAdjustExercise: (id: EntityId, adjustment: MorningPhysicalPlanAdjustment) => void;
  readonly onToggleCustomForm: () => void;
  readonly onCustomNameChange: (name: string) => void;
  readonly onCustomMeasurementTypeChange: (type: ExerciseMeasurementType) => void;
  readonly onCreateCustom: () => void;
  readonly onStartExecution: () => void;
}

export function MorningPhysicalActivationPage(props: MorningPhysicalActivationPageProps) {
  const [loadState, setLoadState] = useState<PhysicalLoadState>({ status: 'loading' });
  const [pendingAction, setPendingAction] = useState<PhysicalPendingAction | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMeasurementType, setCustomMeasurementType] = useState<ExerciseMeasurementType>(
    EXERCISE_MEASUREMENT_TYPE.repetitions,
  );

  async function load(): Promise<void> {
    setLoadState({ status: 'loading' });
    try {
      setLoadState({ status: 'ready', overview: await props.getOverview.execute(props.date) });
    } catch (error: unknown) {
      setLoadState({ status: 'error', message: errorMessage(error) });
    }
  }

  useEffect(() => {
    let active = true;
    void props.getOverview.execute(props.date).then(
      (overview) => {
        if (active) setLoadState({ status: 'ready', overview });
      },
      (error: unknown) => {
        if (active) setLoadState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [props.date, props.getOverview]);

  useEffect(() => {
    if (loadState.status === 'ready') {
      document.getElementById('morning-physical-heading')?.focus();
    }
  }, [loadState.status]);

  async function mutate(
    action: PhysicalPendingAction,
    command: () => Promise<unknown>,
  ): Promise<void> {
    if (pendingAction !== null) return;
    setPendingAction(action);
    setMutationError(null);
    try {
      await command();
      const overview = await props.getOverview.execute(props.date);
      setLoadState({ status: 'ready', overview });
    } catch (error: unknown) {
      setMutationError(errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function startExecution(): Promise<void> {
    if (pendingAction !== null) return;
    setPendingAction('start');
    setMutationError(null);
    let commandSucceeded = false;
    try {
      await runMorningPhysicalStart(
        async () => {
          await props.cycle.startPhysicalExecution(props.date);
          commandSucceeded = true;
        },
        async () => {
          const overview = await props.getOverview.execute(props.date);
          setLoadState({ status: 'ready', overview });
        },
        props.onExecutionStarted,
      );
    } catch (error: unknown) {
      if (commandSucceeded) {
        setLoadState({ status: 'error', message: errorMessage(error) });
      } else {
        setMutationError(errorMessage(error));
      }
    } finally {
      setPendingAction(null);
    }
  }

  if (loadState.status === 'loading') {
    return (
      <section className="morning-physical-state" aria-live="polite">
        Загружаем упражнения…
      </section>
    );
  }
  if (loadState.status === 'error') {
    return (
      <section className="morning-physical-state morning-center-error" role="alert">
        <h2>Физическая активация недоступна</h2>
        <p>{loadState.message}</p>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          Повторить загрузку
        </button>
      </section>
    );
  }

  return (
    <MorningPhysicalActivationView
      overview={loadState.overview}
      pendingAction={pendingAction}
      mutationError={mutationError}
      customFormOpen={customFormOpen}
      customName={customName}
      customMeasurementType={customMeasurementType}
      onBack={props.onBack}
      onToggleExercise={(id, selected) =>
        void mutate('toggle', () =>
          selected
            ? props.cycle.deselectPhysicalExercise(props.date, id)
            : props.cycle.selectPhysicalExercise(props.date, id),
        )
      }
      onAdjustExercise={(id, adjustment) =>
        void mutate('adjust', () => props.cycle.adjustPhysicalExercise(props.date, id, adjustment))
      }
      onToggleCustomForm={() => setCustomFormOpen((open) => !open)}
      onCustomNameChange={setCustomName}
      onCustomMeasurementTypeChange={setCustomMeasurementType}
      onCreateCustom={() =>
        void mutate('create', async () => {
          await props.exerciseCatalog.createCustom(customName, customMeasurementType);
          setCustomName('');
          setCustomFormOpen(false);
        })
      }
      onStartExecution={() => void startExecution()}
    />
  );
}

export function MorningPhysicalActivationView(props: MorningPhysicalActivationViewProps) {
  const busy = props.pendingAction !== null;
  const editable = props.overview.canEditPlan && !busy;
  const hasSelection = props.overview.summary.selectedCount > 0;
  return (
    <section className="morning-physical" aria-busy={busy}>
      <div className="morning-physical-navigation">
        <button
          className="morning-back-button"
          type="button"
          disabled={busy}
          onClick={props.onBack}
        >
          ← Утренний центр
        </button>
        <span>Этап 02</span>
      </div>
      <header className="morning-physical-header">
        <div>
          <p className="morning-center-eyebrow">Движение · настройка нагрузки</p>
          <h2 id="morning-physical-heading" tabIndex={-1}>
            Физическая активация
          </h2>
          <p>Выбери упражнения и настрой нагрузку на сегодняшнее утро.</p>
        </div>
        <p className="morning-physical-summary" aria-live="polite">
          {`Выбрано ${exerciseCountLabel(props.overview.summary.selectedCount)} · ${setsCountLabel(
            props.overview.summary.totalSets,
          )} · ≈ ${props.overview.summary.estimatedMinutes} мин`}
        </p>
      </header>

      {!props.overview.mutable ? (
        <p className="morning-readonly-note" role="status">
          Режим просмотра: план этого утра доступен только для чтения.
        </p>
      ) : null}
      {props.mutationError === null ? null : (
        <p className="morning-center-message error" role="alert">
          {props.mutationError}
        </p>
      )}

      <div className="morning-physical-layout">
        <section
          className="morning-physical-library"
          aria-labelledby="morning-physical-library-heading"
        >
          <div className="morning-physical-section-heading">
            <div>
              <p>01</p>
              <h3 id="morning-physical-library-heading">Библиотека</h3>
            </div>
            {props.overview.canCreateCustom ? (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={props.onToggleCustomForm}
              >
                + Добавить своё
              </button>
            ) : null}
          </div>
          {props.customFormOpen && props.overview.canCreateCustom ? (
            <form
              className="morning-physical-custom-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                props.onCreateCustom();
              }}
            >
              <VoiceField className="morning-physical-custom-name" htmlFor="custom-exercise-name">
                <span>Название упражнения</span>
                <VoiceTextInput
                  id="custom-exercise-name"
                  name="custom-exercise-name"
                  type="text"
                  value={props.customName}
                  maxLength={80}
                  placeholder="Например, вис на перекладине"
                  required
                  disabled={busy}
                  onValueChange={(value) => props.onCustomNameChange(value)}
                />
              </VoiceField>
              <fieldset className="morning-physical-segmented">
                <legend>Как измерять</legend>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="custom-exercise-type"
                      checked={
                        props.customMeasurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                      }
                      disabled={busy}
                      onChange={() =>
                        props.onCustomMeasurementTypeChange(EXERCISE_MEASUREMENT_TYPE.repetitions)
                      }
                    />
                    <span>Повторения</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="custom-exercise-type"
                      checked={props.customMeasurementType === EXERCISE_MEASUREMENT_TYPE.duration}
                      disabled={busy}
                      onChange={() =>
                        props.onCustomMeasurementTypeChange(EXERCISE_MEASUREMENT_TYPE.duration)
                      }
                    />
                    <span>Время</span>
                  </label>
                </div>
              </fieldset>
              <button
                className="primary-button morning-physical-add-button"
                type="submit"
                disabled={busy || props.customName.trim().length === 0}
              >
                {props.pendingAction === 'create' ? 'Добавляем…' : 'Добавить упражнение'}
              </button>
            </form>
          ) : null}
          <div className="morning-physical-card-grid">
            {props.overview.library.map((item) => (
              <button
                key={item.id.toString()}
                className={`physical-exercise-card${item.selected ? ' physical-exercise-card-selected' : ''}`}
                type="button"
                aria-pressed={item.selected}
                disabled={!editable}
                onClick={() => props.onToggleExercise(item.id, item.selected)}
              >
                <span className="physical-exercise-icon">
                  <MorningExerciseIcon exerciseId={item.id.toString()} />
                </span>
                <span className="physical-exercise-name">{item.name}</span>
                <span className="physical-exercise-unit">
                  {item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                    ? 'повторения'
                    : 'секунды'}
                </span>
                {item.selected ? (
                  <span className="physical-exercise-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <div className="morning-physical-plan">
          <section
            className="morning-physical-selection"
            aria-labelledby="morning-physical-selection-heading"
          >
            <div className="morning-physical-section-heading">
              <div>
                <p>02</p>
                <h3 id="morning-physical-selection-heading">Сегодняшний набор</h3>
              </div>
            </div>
            {props.overview.selectedItems.length === 0 ? (
              <div className="morning-physical-empty">
                <strong>Упражнения не выбраны</strong>
                <p>Нажми на карточки в библиотеке — они появятся здесь.</p>
              </div>
            ) : (
              <ol className="morning-physical-selected-list">
                {props.overview.selectedItems.map((item) => (
                  <li key={item.id.toString()}>
                    <div className="morning-physical-selected-copy">
                      <strong>{item.name}</strong>
                      <span>{targetSummary(item)}</span>
                    </div>
                    {props.overview.canEditPlan ? (
                      <div className="morning-physical-steppers">
                        <Stepper
                          label="подходы"
                          exerciseName={item.name}
                          value={item.sets}
                          disabled={busy}
                          onDecrease={() =>
                            props.onAdjustExercise(item.id, { field: 'sets', delta: -1 })
                          }
                          onIncrease={() =>
                            props.onAdjustExercise(item.id, { field: 'sets', delta: 1 })
                          }
                        />
                        <Stepper
                          label={
                            item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                              ? 'повторения'
                              : 'секунды'
                          }
                          exerciseName={item.name}
                          value={
                            item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
                              ? item.targetReps
                              : item.targetDurationSeconds
                          }
                          disabled={busy}
                          onDecrease={() =>
                            props.onAdjustExercise(item.id, { field: 'target', delta: -1 })
                          }
                          onIncrease={() =>
                            props.onAdjustExercise(item.id, { field: 'target', delta: 1 })
                          }
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="morning-physical-cta" aria-label="Готовность плана">
            <div>
              <span>{exerciseCountLabel(props.overview.summary.selectedCount)}</span>
              <strong>
                {setsCountLabel(props.overview.summary.totalSets)} · ≈{' '}
                {props.overview.summary.estimatedMinutes} мин
              </strong>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!hasSelection || !props.overview.canEditPlan || busy}
              onClick={props.onStartExecution}
            >
              {props.pendingAction === 'start' ? 'Начинаем…' : 'Начать выполнение'}
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}

export async function runMorningPhysicalStart(
  start: () => Promise<unknown>,
  reload: () => Promise<unknown>,
  onExecutionStarted: () => void,
): Promise<void> {
  await start();
  await reload();
  onExecutionStarted();
}

function Stepper(props: {
  readonly label: 'подходы' | 'повторения' | 'секунды';
  readonly exerciseName: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly onDecrease: () => void;
  readonly onIncrease: () => void;
}) {
  return (
    <div className="morning-physical-stepper">
      <span>{props.label}</span>
      <div>
        <button
          type="button"
          disabled={props.disabled}
          aria-label={`Уменьшить ${props.label}: ${props.exerciseName}`}
          onClick={props.onDecrease}
        >
          −
        </button>
        <output aria-label={`${props.label}: ${props.exerciseName}`}>{props.value}</output>
        <button
          type="button"
          disabled={props.disabled}
          aria-label={`Увеличить ${props.label}: ${props.exerciseName}`}
          onClick={props.onIncrease}
        >
          +
        </button>
      </div>
    </div>
  );
}

function targetSummary(item: MorningPhysicalSelectedItem): string {
  return item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? `${item.sets} × ${item.targetReps} повторений`
    : `${item.sets} × ${item.targetDurationSeconds} сек`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось обновить план упражнений.';
}
