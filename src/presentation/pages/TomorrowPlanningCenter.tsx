import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  CreateDecisionForDate,
  DeleteDecisionSafely,
  SpheresSnapshot,
  UpdateDecisionDetails,
  TomorrowPlanService,
} from '../../application';
import {
  DECISION_KIND,
  DECISION_PRIORITY,
  EntityId,
  type DayDate,
  type Decision,
  type DecisionKind,
  type DecisionPriority,
  type Project,
} from '../../domain';
import { SphereSelect } from '../components/SphereReference';
import { EveningVisualIcon } from '../components/EveningVisualIcon';
import '../styles/planning-tomorrow.css';
import {
  createEmptyDecisionCreationErrors,
  submitDecisionCreation,
  validateDecisionCreationForm,
  type DecisionCreationFormErrors,
  type DecisionCreationFormState,
} from './DecisionCreationFormState';
import {
  TOMORROW_PLAN_CAPACITY,
  createTomorrowPlanPresentation,
  createTomorrowPlanningState,
  tomorrowPlanningReducer,
} from './TomorrowPlanningState';
import { TomorrowComposer } from './TomorrowComposer';

interface TomorrowPlanningCenterProps {
  readonly currentDate: DayDate;
  readonly plannedDate: DayDate;
  readonly decisions: readonly Decision[];
  readonly spheres: SpheresSnapshot;
  readonly projects?: readonly Project[];
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly updateDecisionDetails: Pick<UpdateDecisionDetails, 'execute'>;
  readonly deleteDecisionSafely: Pick<DeleteDecisionSafely, 'execute'>;
  readonly onDecisionsChange: (decisions: readonly Decision[]) => void;
  readonly onBack: () => void;
  readonly initialIntent?: TomorrowPlanningIntent;
  readonly tomorrowPlan?: Pick<
    TomorrowPlanService,
    | 'getByTargetDate'
    | 'getOrCreate'
    | 'setVector'
    | 'assignPrimaryDecision'
    | 'createPrimaryDecision'
    | 'setOutcomes'
    | 'assignFirstAction'
    | 'createFirstAction'
    | 'setSupportingDecisions'
    | 'createSupportingDecision'
    | 'complete'
  >;
}

export type TomorrowPlanningIntent = 'plan' | 'first-action';

export function TomorrowPlanningCenter({
  currentDate,
  plannedDate,
  decisions,
  spheres,
  projects = [],
  createDecisionForDate,
  updateDecisionDetails,
  deleteDecisionSafely,
  onDecisionsChange,
  onBack,
  initialIntent = 'plan',
  tomorrowPlan,
}: TomorrowPlanningCenterProps) {
  const [state, dispatch] = useReducer(
    tomorrowPlanningReducer,
    plannedDate,
    createTomorrowPlanningState,
  );
  const [usesSharedPlan, setUsesSharedPlan] = useState(initialIntent === 'first-action');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const operationRef = useRef(false);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plan = createTomorrowPlanPresentation(decisions);
  const isEditing = state.mode.kind === 'edit';
  const formReady = isPlanningFormReady(state.form);
  const capacityReached = !isEditing && plan.count >= TOMORROW_PLAN_CAPACITY;
  const linkedProjectCount = new Set(
    plan.decisions.flatMap((decision) =>
      decision.projectId === null ? [] : [decision.projectId.toString()],
    ),
  ).size;
  const activeStepIndex = Math.min(plan.count, TOMORROW_PLAN_CAPACITY - 1);

  useEffect(
    () => () => {
      if (navigationTimerRef.current !== null) {
        clearTimeout(navigationTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (tomorrowPlan === undefined || initialIntent === 'first-action')
      return () => {
        cancelled = true;
      };
    void tomorrowPlan.getByTargetDate(plannedDate).then((snapshot) => {
      if (!cancelled) setUsesSharedPlan(snapshot !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [initialIntent, plannedDate, tomorrowPlan]);

  if (usesSharedPlan && tomorrowPlan !== undefined) {
    return (
      <TomorrowComposer
        cycleDate={currentDate}
        service={tomorrowPlan}
        onPrepared={onBack}
        onClose={onBack}
        initialEditingBlock={initialIntent === 'first-action' ? 'first-action' : null}
      />
    );
  }

  function focusCreationForm(): void {
    dispatch({ type: 'create_requested', plannedDate });
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  function focusFirstInvalidField(): void {
    setTimeout(() => {
      const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.focus();
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (operationRef.current || capacityReached) {
      return;
    }

    const validation = validateDecisionCreationForm(state.form, currentDate, projects);
    if (!validation.ok) {
      dispatch({ type: 'save_failed', errors: validation.errors });
      focusFirstInvalidField();
      return;
    }

    operationRef.current = true;
    dispatch({ type: 'save_started' });
    try {
      if (state.mode.kind === 'create') {
        const result = await submitDecisionCreation({
          form: state.form,
          currentDate,
          createDecisionForDate,
          projects,
        });
        if (!result.ok) {
          dispatch({ type: 'save_failed', errors: result.errors });
          focusFirstInvalidField();
          return;
        }

        onDecisionsChange([...decisions, result.decision]);
        dispatch({ type: 'create_succeeded', plannedDate });
        return;
      }

      const result = await updateDecisionDetails.execute({
        decisionId: state.mode.decision.id,
        expectedVersion: state.mode.decision.version,
        title: state.form.title,
        expectedResult: state.form.expectedResult,
        reason: state.form.reason,
        sphereId:
          state.form.sphereId.trim().length === 0 ? null : EntityId.create(state.form.sphereId),
        price: state.form.price,
        sacrifices: state.form.sacrifices,
        priority: state.form.priority,
        projectReference: state.form.projectReference,
        projectId: state.form.projectId === '' ? null : EntityId.create(state.form.projectId),
        kind: state.form.kind,
      });
      if (!result.ok) {
        dispatch({
          type: 'save_failed',
          errors: errorsForUpdateCode(result.error.code),
        });
        focusFirstInvalidField();
        return;
      }

      onDecisionsChange(
        decisions.map((decision) =>
          decision.id.equals(result.value.id) ? result.value : decision,
        ),
      );
      dispatch({ type: 'edit_succeeded', plannedDate });
    } catch {
      dispatch({
        type: 'save_failed',
        errors: {
          ...createEmptyDecisionCreationErrors(),
          form: isEditing ? 'Не удалось сохранить изменения' : 'Не удалось добавить Решение',
        },
      });
    } finally {
      operationRef.current = false;
    }
  }

  async function handleDelete(): Promise<void> {
    if (state.deleteCandidate === null || operationRef.current) {
      return;
    }

    operationRef.current = true;
    dispatch({ type: 'delete_started' });
    try {
      const result = await deleteDecisionSafely.execute({
        decisionId: state.deleteCandidate.id,
        expectedVersion: state.deleteCandidate.version,
      });
      if (!result.ok) {
        dispatch({ type: 'delete_failed', message: result.error.message });
        return;
      }

      onDecisionsChange(
        decisions.filter(
          (decision) => !decision.id.equals(state.deleteCandidate?.id ?? result.value.id),
        ),
      );
      dispatch({ type: 'delete_succeeded', plannedDate });
    } catch {
      dispatch({ type: 'delete_failed', message: 'Не удалось удалить Решение из плана' });
    } finally {
      operationRef.current = false;
    }
  }

  function handlePlanSave(): void {
    if (!plan.hasMain || navigationTimerRef.current !== null) {
      return;
    }

    dispatch({ type: 'plan_saved' });
    navigationTimerRef.current = setTimeout(onBack, 650);
  }

  return (
    <main className="tomorrow-planning-page">
      <header className="tomorrow-planning-header">
        <button className="tomorrow-back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>Назад</span>
        </button>
        <div className="tomorrow-planning-heading-copy">
          <p className="tomorrow-planning-kicker">Центр планирования</p>
          <h1>Планирование завтра</h1>
          <p className="tomorrow-planning-date">{formatPlanningDate(plannedDate)}</p>
          <p className="tomorrow-planning-intro">
            Определите до трёх решений,
            <br />
            которые приблизят вас к результату.
          </p>
        </div>
      </header>

      <div className="tomorrow-planning-grid">
        <section
          className="tomorrow-planning-card tomorrow-plan-card"
          aria-labelledby="tomorrow-plan-title"
        >
          <div className="tomorrow-card-heading tomorrow-plan-heading">
            <div className="tomorrow-card-title">
              <EveningVisualIcon name="calendar" size={22} />
              <h2 id="tomorrow-plan-title">План на завтра</h2>
            </div>
            <strong className="tomorrow-plan-count">
              {plan.count} из {TOMORROW_PLAN_CAPACITY} решений
            </strong>
          </div>

          <ol className="tomorrow-plan-path" aria-label="Этапы формирования плана">
            {['Главное решение', 'Второе решение', 'Третье решение'].map((label, index) => {
              const stepState =
                plan.count >= TOMORROW_PLAN_CAPACITY || index < activeStepIndex
                  ? 'complete'
                  : index === activeStepIndex
                    ? 'current'
                    : 'future';
              return (
                <li
                  className={`tomorrow-plan-step is-${stepState}`}
                  key={label}
                  {...(stepState === 'current' ? { 'aria-current': 'step' as const } : {})}
                >
                  <span className="tomorrow-plan-step-number" aria-hidden="true">
                    {stepState === 'complete' ? '✓' : index + 1}
                  </span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>

          <p className="tomorrow-plan-guidance">Выберите до трёх главных решений на завтра.</p>
          <p className="visually-hidden" role="status">
            {plan.status}
          </p>

          <ol className="tomorrow-plan-slots">
            {Array.from({ length: TOMORROW_PLAN_CAPACITY }, (_, index) => {
              const decision = plan.decisions[index];
              const slot = String(index + 1).padStart(2, '0');
              const emptyLabel = [
                'Добавьте главное решение',
                'Добавьте второе решение',
                'Добавьте третье решение',
              ][index];
              return (
                <li key={decision?.id.toString() ?? slot}>
                  {decision === undefined ? (
                    <button
                      className="tomorrow-plan-slot tomorrow-plan-slot-empty"
                      type="button"
                      onClick={focusCreationForm}
                    >
                      <span className="tomorrow-slot-number">{slot}</span>
                      <span className="tomorrow-slot-add" aria-hidden="true">
                        +
                      </span>
                      <strong>{emptyLabel}</strong>
                      <span className="tomorrow-slot-star" aria-hidden="true">
                        ☆
                      </span>
                    </button>
                  ) : (
                    <article className="tomorrow-plan-slot tomorrow-plan-slot-filled">
                      <span className="tomorrow-slot-number">{slot}</span>
                      <div className="tomorrow-slot-copy">
                        <strong>{decision.title.toString()}</strong>
                        {decision.projectReference === null ? null : (
                          <small>{decision.projectReference}</small>
                        )}
                        <span className="tomorrow-decision-kind">
                          {decision.kind === DECISION_KIND.main ? 'Главное' : 'Дополнительное'}
                        </span>
                      </div>
                      <div className="tomorrow-slot-actions">
                        <button
                          type="button"
                          aria-label={`Редактировать Решение «${decision.title.toString()}»`}
                          title="Редактировать"
                          onClick={() => {
                            dispatch({ type: 'edit_requested', decision, plannedDate });
                            setTimeout(() => titleInputRef.current?.focus(), 0);
                          }}
                        >
                          <EveningVisualIcon name="pencil" size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Удалить Решение «${decision.title.toString()}»`}
                          title="Удалить"
                          onClick={() => dispatch({ type: 'delete_requested', decision })}
                        >
                          <EveningVisualIcon name="close" size={18} />
                        </button>
                      </div>
                    </article>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section
          className="tomorrow-planning-card tomorrow-planning-form-card"
          aria-labelledby="tomorrow-form-title"
        >
          <div className="tomorrow-card-heading">
            <div className="tomorrow-card-title">
              <EveningVisualIcon name="spark" size={23} />
              <h2 id="tomorrow-form-title">
                {isEditing ? 'Редактирование решения' : 'Новое решение'}
              </h2>
            </div>
            {isEditing ? (
              <button className="tomorrow-text-button" type="button" onClick={focusCreationForm}>
                Отменить
              </button>
            ) : null}
          </div>

          <form
            ref={formRef}
            className="tomorrow-planning-form"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
          >
            <PlanningField
              label="Название решения"
              error={state.errors.title}
              fieldId="tomorrow-decision-title"
            >
              <VoiceTextInput
                ref={titleInputRef}
                id="tomorrow-decision-title"
                value={state.form.title}
                maxLength={200}
                disabled={state.isSaving || capacityReached}
                aria-invalid={state.errors.title !== null}
                aria-describedby={errorId('tomorrow-decision-title', state.errors.title)}
                placeholder="Что важно решить завтра?"
                onValueChange={(value) =>
                  dispatch({
                    type: 'form_changed',
                    form: { ...state.form, title: value },
                  })
                }
              />
            </PlanningField>

            <PlanningField label="Цель" error={state.errors.projectId} fieldId="tomorrow-project">
              <select
                id="tomorrow-project"
                value={state.form.projectId}
                disabled={state.isSaving || capacityReached}
                aria-invalid={state.errors.projectId !== null}
                aria-describedby={errorId('tomorrow-project', state.errors.projectId)}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const projectId = event.target.value;
                  const project = projects.find((item) => item.id.toString() === projectId);
                  dispatch({
                    type: 'form_changed',
                    form: {
                      ...state.form,
                      projectId,
                      sphereId:
                        state.form.sphereId === '' && project?.sphereId !== null
                          ? (project?.sphereId?.toString() ?? '')
                          : state.form.sphereId,
                    },
                  });
                }}
              >
                <option value="">Без цели</option>
                {projects
                  .filter(
                    (project) =>
                      (project.status !== 'completed' && project.status !== 'archived') ||
                      project.id.toString() === state.form.projectId,
                  )
                  .map((project) => (
                    <option key={project.id.toString()} value={project.id.toString()}>
                      {project.title}
                    </option>
                  ))}
              </select>
            </PlanningField>

            <PlanningField
              label="Связь с целью (необязательно)"
              error={state.errors.projectReference}
              fieldId="tomorrow-project-reference"
            >
              <VoiceTextInput
                id="tomorrow-project-reference"
                value={state.form.projectReference}
                maxLength={200}
                disabled={state.isSaving || capacityReached}
                aria-invalid={state.errors.projectReference !== null}
                aria-describedby={errorId(
                  'tomorrow-project-reference',
                  state.errors.projectReference,
                )}
                placeholder="Цель"
                onValueChange={(value) =>
                  dispatch({
                    type: 'form_changed',
                    form: { ...state.form, projectReference: value },
                  })
                }
              />
            </PlanningField>

            <PlanningField label="Тип" error={state.errors.kind} fieldId="tomorrow-decision-kind">
              <select
                id="tomorrow-decision-kind"
                value={state.form.kind}
                disabled={state.isSaving || capacityReached}
                aria-invalid={state.errors.kind !== null}
                aria-describedby={errorId('tomorrow-decision-kind', state.errors.kind)}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  dispatch({
                    type: 'form_changed',
                    form: { ...state.form, kind: event.target.value as DecisionKind },
                  })
                }
              >
                <option value={DECISION_KIND.main}>Главное</option>
                <option value={DECISION_KIND.additional}>Дополнительное</option>
              </select>
            </PlanningField>

            <PlanningField
              label={`Ожидаемый результат${state.form.kind === DECISION_KIND.main ? ' *' : ''}`}
              error={state.errors.expectedResult}
              fieldId="tomorrow-expected-result"
            >
              <span className="tomorrow-textarea-shell">
                <VoiceTextArea
                  id="tomorrow-expected-result"
                  value={state.form.expectedResult}
                  rows={3}
                  maxLength={1000}
                  disabled={state.isSaving || capacityReached}
                  aria-required={state.form.kind === DECISION_KIND.main}
                  aria-invalid={state.errors.expectedResult !== null}
                  aria-describedby={errorId(
                    'tomorrow-expected-result',
                    state.errors.expectedResult,
                  )}
                  placeholder="Какой результат вы хотите получить?"
                  onValueChange={(value) =>
                    dispatch({
                      type: 'form_changed',
                      form: { ...state.form, expectedResult: value },
                    })
                  }
                />
                <small aria-hidden="true">{state.form.expectedResult.length} / 1000</small>
              </span>
            </PlanningField>

            <details className="tomorrow-planning-more">
              <summary>
                <span aria-hidden="true">›</span>
                <span>
                  <strong>Дополнительно</strong>
                  <small>Детали, условия, напоминания, зависимости и ресурсы.</small>
                </span>
              </summary>
              <div className="tomorrow-planning-more-fields">
                <PlanningField
                  label="Сфера"
                  error={state.errors.sphereId}
                  fieldId="tomorrow-sphere"
                >
                  <SphereSelect
                    id="tomorrow-sphere"
                    value={state.form.sphereId || null}
                    snapshot={spheres}
                    disabled={state.isSaving || capacityReached}
                    onChange={(sphereId) =>
                      dispatch({
                        type: 'form_changed',
                        form: { ...state.form, sphereId: sphereId ?? '' },
                      })
                    }
                  />
                </PlanningField>
                <PlanningField
                  label="Приоритет"
                  error={state.errors.priority}
                  fieldId="tomorrow-priority"
                >
                  <select
                    id="tomorrow-priority"
                    value={state.form.priority}
                    disabled={state.isSaving || capacityReached}
                    aria-invalid={state.errors.priority !== null}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      dispatch({
                        type: 'form_changed',
                        form: { ...state.form, priority: event.target.value as DecisionPriority },
                      })
                    }
                  >
                    <option value={DECISION_PRIORITY.high}>Высокий</option>
                    <option value={DECISION_PRIORITY.normal}>Обычный</option>
                    <option value={DECISION_PRIORITY.low}>Низкий</option>
                  </select>
                </PlanningField>
                <PlanningField
                  label="Причина"
                  error={state.errors.reason}
                  fieldId="tomorrow-reason"
                >
                  <VoiceTextArea
                    id="tomorrow-reason"
                    value={state.form.reason}
                    rows={2}
                    maxLength={1000}
                    disabled={state.isSaving || capacityReached}
                    aria-invalid={state.errors.reason !== null}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'form_changed',
                        form: { ...state.form, reason: value },
                      })
                    }
                  />
                </PlanningField>
                <PlanningField
                  label="Цена решения"
                  error={state.errors.price}
                  fieldId="tomorrow-price"
                >
                  <VoiceTextArea
                    id="tomorrow-price"
                    value={state.form.price}
                    rows={2}
                    maxLength={500}
                    disabled={state.isSaving || capacityReached}
                    aria-invalid={state.errors.price !== null}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'form_changed',
                        form: { ...state.form, price: value },
                      })
                    }
                  />
                </PlanningField>
                <PlanningField
                  label="Жертвы"
                  error={state.errors.sacrifices}
                  fieldId="tomorrow-sacrifices"
                >
                  <VoiceTextArea
                    id="tomorrow-sacrifices"
                    value={state.form.sacrifices}
                    rows={2}
                    maxLength={1000}
                    disabled={state.isSaving || capacityReached}
                    aria-invalid={state.errors.sacrifices !== null}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'form_changed',
                        form: { ...state.form, sacrifices: value },
                      })
                    }
                  />
                </PlanningField>
              </div>
            </details>

            {capacityReached ? (
              <p className="tomorrow-form-note">
                Все три места заполнены. Отредактируйте или удалите Решение.
              </p>
            ) : null}
            {state.errors.form === null ? null : (
              <p className="form-error" role="alert">
                {state.errors.form}
              </p>
            )}
            {state.notice === null ? null : (
              <p className="tomorrow-planning-notice" role="status">
                {state.notice}
              </p>
            )}

            <button
              className="tomorrow-form-submit"
              type="submit"
              aria-busy={state.isSaving}
              disabled={state.isSaving || capacityReached || !formReady}
            >
              {state.isSaving ? (
                'Сохраняем…'
              ) : (
                <>
                  <span>{isEditing ? 'Сохранить изменения' : 'Добавить в план'}</span>
                  <EveningVisualIcon name="arrow-right" size={18} />
                </>
              )}
            </button>
          </form>
        </section>

        <section className="tomorrow-focus-summary" aria-labelledby="tomorrow-focus-title">
          <div className="tomorrow-focus-copy">
            <p id="tomorrow-focus-title">Завтра в фокусе</p>
            <span>
              {plan.count === 0 ? 'План пока не сформирован.' : 'Главные ориентиры определены.'}
            </span>
          </div>
          <div
            className="tomorrow-focus-metric"
            aria-label={`${plan.count} ${formatCount(plan.count, 'решение', 'решения', 'решений')}`}
          >
            <EveningVisualIcon name="target" size={20} />
            <strong>{plan.count}</strong>
            <span>{formatCount(plan.count, 'решение', 'решения', 'решений')}</span>
          </div>
          <div
            className="tomorrow-focus-metric"
            aria-label={`${linkedProjectCount} ${formatCount(linkedProjectCount, 'цель', 'цели', 'целей')}`}
          >
            <EveningVisualIcon name="preparation" size={20} />
            <strong>{linkedProjectCount}</strong>
            <span>{formatCount(linkedProjectCount, 'цель', 'цели', 'целей')}</span>
          </div>
          <div className="tomorrow-focus-metric">
            <EveningVisualIcon name="clock" size={20} />
            <strong>—</strong>
            <span>ориентир</span>
          </div>
        </section>

        <div className="tomorrow-plan-save">
          <button
            className="tomorrow-plan-primary"
            type="button"
            disabled={!plan.hasMain}
            onClick={handlePlanSave}
          >
            <span>Сохранить план на завтра</span>
            <EveningVisualIcon name="arrow-right" size={19} />
          </button>
          {plan.hasMain ? null : (
            <p>Добавьте хотя бы одно главное Решение, чтобы сохранить план.</p>
          )}
        </div>
      </div>

      <aside className="tomorrow-planning-quote" aria-label="Принцип планирования">
        <span aria-hidden="true">“</span>
        <p>
          Правильные решения сегодня — это результаты завтра.
          <br />
          Сфокусируйтесь на главном. Остальное подождёт.
        </p>
      </aside>

      {state.deleteCandidate === null ? null : (
        <div className="decision-delete-backdrop" role="presentation">
          <section
            className="decision-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tomorrow-delete-title"
          >
            <p className="section-page-eyebrow">Подтверждение</p>
            <h2 id="tomorrow-delete-title">Удалить Решение из плана?</h2>
            <p>«{state.deleteCandidate.title.toString()}» будет перемещено в корзину.</p>
            {state.deleteError === null ? null : (
              <p className="form-error" role="alert">
                {state.deleteError}
              </p>
            )}
            <div className="form-actions">
              <button
                className="danger-button"
                type="button"
                aria-busy={state.isDeleting}
                disabled={state.isDeleting}
                onClick={() => void handleDelete()}
              >
                {state.isDeleting ? 'Удаляем…' : 'Удалить'}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={state.isDeleting}
                onClick={() => dispatch({ type: 'delete_cancelled' })}
              >
                Отмена
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function PlanningField({
  label,
  error,
  fieldId,
  children,
}: {
  readonly label: string;
  readonly error: string | null;
  readonly fieldId: string;
  readonly children: ReactNode;
}) {
  return (
    <VoiceField className="tomorrow-planning-field">
      <span>{label}</span>
      {children}
      {error === null ? null : <small id={`${fieldId}-error`}>{error}</small>}
    </VoiceField>
  );
}

function isPlanningFormReady(form: DecisionCreationFormState): boolean {
  return (
    form.title.trim().length > 0 &&
    (form.kind !== DECISION_KIND.main || form.expectedResult.trim().length > 0)
  );
}

function errorsForUpdateCode(code: string): DecisionCreationFormErrors {
  const errors = createEmptyDecisionCreationErrors();
  switch (code) {
    case 'decision.title_required':
    case 'decision_title.invalid':
      return { ...errors, title: 'Введите название Решения' };
    case 'decision.expected_result_required':
    case 'decision.main_requires_expected_result':
    case 'expected_result.invalid':
      return { ...errors, expectedResult: 'Укажите ожидаемый результат' };
    case 'decision.duplicate_for_date':
      return { ...errors, title: 'Такое Решение уже есть в плане' };
    case 'decision.main_limit_reached':
      return { ...errors, kind: 'Все места для главных Решений уже заняты' };
    case 'decision.project_not_found':
      return { ...errors, projectId: 'Выбранная цель не найдена' };
    case 'decision.project_unavailable':
      return { ...errors, projectId: 'Завершённая или архивная цель недоступна' };
    case 'decision.project_sphere_mismatch':
      return { ...errors, projectId: 'Сфера решения не совпадает со сферой цели' };
    default:
      return { ...errors, form: 'Не удалось сохранить изменения' };
  }
}

function errorId(fieldId: string, error: string | null): string | undefined {
  return error === null ? undefined : `${fieldId}-error`;
}

function formatCount(count: number, one: string, few: string, many: string): string {
  const normalized = Math.abs(count) % 100;
  const lastDigit = normalized % 10;
  if (normalized > 10 && normalized < 20) return many;
  if (lastDigit === 1) return one;
  if (lastDigit > 1 && lastDigit < 5) return few;
  return many;
}

function formatPlanningDate(date: DayDate): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date.toString()}T12:00:00`));
}
