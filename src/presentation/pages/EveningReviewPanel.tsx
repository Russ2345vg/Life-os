import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  CompleteCurrentDay,
  CompleteCurrentDayResult,
  EveningReviewSnapshot,
  GetEveningReview,
} from '../../application';
import {
  ACTION_SESSION_STATUS,
  DECISION_KIND,
  type DayDate,
  type DecisionKind,
  type LifeAction,
} from '../../domain';
import {
  decisionKindLabel,
  decisionStatusLabel,
  lifeActionStatusLabel,
} from '../entityPresentation';
import {
  buildCompleteCurrentDayInput,
  canCompleteAction,
  createEmptyTomorrowDecisionForm,
  createInitialEveningActionForms,
  createInitialTomorrowDecisionForms,
  getEveningReviewReadiness,
  isUnfinishedAction,
  updateEveningActionForm,
  validateEveningReviewSubmission,
  type EveningActionForms,
  type EveningActionResolutionKind,
  type TomorrowDecisionForm,
} from './EveningReviewPanelState';

interface EveningReviewPanelProps {
  readonly getEveningReview: Pick<GetEveningReview, 'execute'>;
  readonly completeCurrentDay: Pick<CompleteCurrentDay, 'execute'>;
  readonly reviewDate?: DayDate;
  readonly onClose: () => void;
  readonly onCompleted: (result: CompleteCurrentDayResult) => void;
}

type LoadState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; snapshot: EveningReviewSnapshot }>;

export function EveningReviewPanel({
  getEveningReview,
  completeCurrentDay,
  reviewDate,
  onClose,
  onCompleted,
}: EveningReviewPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [summary, setSummary] = useState('');
  const [actionForms, setActionForms] = useState<EveningActionForms>({});
  const [tomorrowForms, setTomorrowForms] = useState<readonly TomorrowDecisionForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nextTomorrowFormId = useRef(2);

  async function load(): Promise<void> {
    setLoadState({ status: 'loading' });
    setSubmitError(null);
    try {
      const snapshot = await getEveningReview.execute(reviewDate);
      setActionForms(createInitialEveningActionForms(snapshot));
      setTomorrowForms(createInitialTomorrowDecisionForms(snapshot));
      setLoadState({ status: 'ready', snapshot });
    } catch {
      setLoadState({
        status: 'error',
        message: 'Не удалось загрузить данные вечернего контроля',
      });
    }
  }

  useEffect(() => {
    let isCancelled = false;

    void getEveningReview
      .execute(reviewDate)
      .then((snapshot) => {
        if (isCancelled) {
          return;
        }
        setActionForms(createInitialEveningActionForms(snapshot));
        setTomorrowForms(createInitialTomorrowDecisionForms(snapshot));
        setLoadState({ status: 'ready', snapshot });
      })
      .catch(() => {
        if (!isCancelled) {
          setLoadState({
            status: 'error',
            message: 'Не удалось загрузить данные вечернего контроля',
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [getEveningReview, reviewDate]);

  function updateActionForm(
    actionId: string,
    patch: Parameters<typeof updateEveningActionForm>[2],
  ): void {
    setActionForms((current) => updateEveningActionForm(current, actionId, patch));
    setSubmitError(null);
  }

  function addTomorrowDecision(): void {
    const formId = `tomorrow-decision-${nextTomorrowFormId.current}`;
    nextTomorrowFormId.current += 1;
    setTomorrowForms((current) => [...current, createEmptyTomorrowDecisionForm(formId)]);
    setSubmitError(null);
  }

  function updateTomorrowDecision(
    formId: string,
    patch: Partial<Omit<TomorrowDecisionForm, 'formId'>>,
  ): void {
    setTomorrowForms((current) =>
      current.map((form) => (form.formId === formId ? { ...form, ...patch } : form)),
    );
    setSubmitError(null);
  }

  function removeTomorrowDecision(formId: string): void {
    setTomorrowForms((current) => current.filter((form) => form.formId !== formId));
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting || loadState.status !== 'ready') {
      return;
    }

    const validationError = validateEveningReviewSubmission(
      loadState.snapshot,
      summary,
      actionForms,
      tomorrowForms,
    );
    if (validationError !== null) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await completeCurrentDay.execute(
        buildCompleteCurrentDayInput(loadState.snapshot, summary, actionForms, tomorrowForms),
        reviewDate,
      );
      if (!result.ok) {
        setSubmitError(result.error.message);
        return;
      }
      onCompleted(result.value);
    } catch {
      setSubmitError('Не удалось завершить день. Данные не были изменены.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return (
      <EveningReviewFrame title="Вечерний контроль" onClose={onClose}>
        <p className="page-message" role="status">
          Проверяем день, действия и рабочие сессии…
        </p>
      </EveningReviewFrame>
    );
  }

  if (loadState.status === 'error') {
    return (
      <EveningReviewFrame title="Вечерний контроль" onClose={onClose}>
        <section className="page-message page-error" role="alert">
          <p>{loadState.message}</p>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </section>
      </EveningReviewFrame>
    );
  }

  return (
    <EveningReviewPanelView
      snapshot={loadState.snapshot}
      summary={summary}
      actionForms={actionForms}
      tomorrowForms={tomorrowForms}
      isSubmitting={isSubmitting}
      error={submitError}
      onClose={onClose}
      onSummaryChange={(value) => {
        setSummary(value);
        setSubmitError(null);
      }}
      onActionKindChange={(actionId, kind) => updateActionForm(actionId, { kind })}
      onActionActualResultChange={(actionId, actualResult) =>
        updateActionForm(actionId, { actualResult })
      }
      onActionDateChange={(actionId, newPlannedDate) =>
        updateActionForm(actionId, { newPlannedDate })
      }
      onActionReasonChange={(actionId, reason) => updateActionForm(actionId, { reason })}
      onAddTomorrowDecision={addTomorrowDecision}
      onUpdateTomorrowDecision={updateTomorrowDecision}
      onRemoveTomorrowDecision={removeTomorrowDecision}
      onSubmit={(event) => void handleSubmit(event)}
    />
  );
}

interface EveningReviewPanelViewProps {
  readonly snapshot: EveningReviewSnapshot;
  readonly summary: string;
  readonly actionForms: EveningActionForms;
  readonly tomorrowForms: readonly TomorrowDecisionForm[];
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSummaryChange: (value: string) => void;
  readonly onActionKindChange: (actionId: string, kind: EveningActionResolutionKind) => void;
  readonly onActionActualResultChange: (actionId: string, value: string) => void;
  readonly onActionDateChange: (actionId: string, value: string) => void;
  readonly onActionReasonChange: (actionId: string, value: string) => void;
  readonly onAddTomorrowDecision: () => void;
  readonly onUpdateTomorrowDecision: (
    formId: string,
    patch: Partial<Omit<TomorrowDecisionForm, 'formId'>>,
  ) => void;
  readonly onRemoveTomorrowDecision: (formId: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function EveningReviewPanelView({
  snapshot,
  summary,
  actionForms,
  tomorrowForms,
  isSubmitting,
  error,
  onClose,
  onSummaryChange,
  onActionKindChange,
  onActionActualResultChange,
  onActionDateChange,
  onActionReasonChange,
  onAddTomorrowDecision,
  onUpdateTomorrowDecision,
  onRemoveTomorrowDecision,
  onSubmit,
}: EveningReviewPanelViewProps) {
  const unfinishedActions = snapshot.lifeActions.filter(isUnfinishedAction);
  const completedActions = snapshot.lifeActions.filter((action) => !isUnfinishedAction(action));
  const sessionBlock = snapshot.unfinishedSession;
  const readiness = getEveningReviewReadiness(snapshot, summary, actionForms, tomorrowForms);
  const hasRecordedActivity =
    snapshot.decisions.length > 0 ||
    snapshot.lifeActions.length > 0 ||
    snapshot.actionSessions.length > 0 ||
    (snapshot.routineSummary?.plannedCount ?? 0) > 0;

  return (
    <EveningReviewFrame
      title={
        snapshot.isRecoveryReview
          ? 'Восстановление и завершение прошлого дня'
          : 'Вечерний контроль и завершение дня'
      }
      onClose={onClose}
    >
      <form className="evening-review-form" onSubmit={onSubmit} noValidate>
        <div className="evening-review-scroll-region">
          <EveningReviewSteps readiness={readiness} isRecoveryReview={snapshot.isRecoveryReview} />

          <section className="evening-review-overview" aria-labelledby="evening-overview-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker gold">Проверка дня</p>
                <h3 id="evening-overview-title">Единое состояние</h3>
              </div>
            </div>
            {hasRecordedActivity ? (
              <div className="evening-review-metrics">
                <EveningMetric label="Решения" value={snapshot.decisions.length} />
                <EveningMetric label="Действия" value={snapshot.lifeActions.length} />
                <EveningMetric label="Сессии" value={snapshot.actionSessions.length} />
                <EveningMetric label="Требуют решения" value={unfinishedActions.length} />
                <EveningMetric
                  label="Блоки распорядка"
                  value={snapshot.routineSummary?.plannedCount ?? 0}
                />
              </div>
            ) : (
              <p className="evening-review-empty-summary">
                Сегодня решений, действий и рабочих сессий не зафиксировано.
              </p>
            )}
            {sessionBlock === null ? (
              <p className="evening-review-check evening-review-check-ok">
                Незавершённых рабочих сессий нет
              </p>
            ) : (
              <p className="evening-review-blocker" role="alert">
                {sessionBlock.status === ACTION_SESSION_STATUS.paused
                  ? 'Приостановленная рабочая сессия блокирует завершение дня. Сначала завершите её.'
                  : 'Активная рабочая сессия блокирует завершение дня. Сначала завершите её.'}
              </p>
            )}
            {snapshot.routineSummary === undefined ||
            snapshot.routineSummary.runningExecution === null ? (
              <p className="evening-review-check evening-review-check-ok">
                Выполняющихся блоков распорядка нет
              </p>
            ) : (
              <p className="evening-review-blocker" role="alert">
                Выполняющийся блок распорядка блокирует завершение дня. Сначала завершите или
                прервите его.
              </p>
            )}
            <p className="evening-review-check">
              Блоки распорядка: запланировано {snapshot.routineSummary?.plannedCount ?? 0}, начато{' '}
              {snapshot.routineSummary?.startedCount ?? 0}, завершено{' '}
              {snapshot.routineSummary?.completedCount ?? 0}
            </p>
          </section>

          <section className="evening-review-section" aria-labelledby="evening-decisions-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Решения дня</p>
                <h3 id="evening-decisions-title">Проверка решений</h3>
              </div>
            </div>
            {snapshot.decisions.length === 0 ? (
              <p className="page-message">Решений на текущий день нет</p>
            ) : (
              <div className="evening-review-list">
                {snapshot.decisions.map((decision) => (
                  <article className="evening-review-row" key={decision.id.toString()}>
                    <div>
                      <strong>{decision.title.toString()}</strong>
                      <p>{decisionKindLabel(decision.kind)}</p>
                    </div>
                    <span className="entity-status-chip">
                      {decisionStatusLabel(decision.status)}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="evening-review-section" aria-labelledby="evening-actions-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Остатки дня</p>
                <h3 id="evening-actions-title">Обработайте каждое действие</h3>
              </div>
            </div>
            {unfinishedActions.length === 0 ? (
              <p className="evening-review-check evening-review-check-ok">
                Все действия завершены, отменены или уже перенесены
              </p>
            ) : (
              <div className="evening-action-review-list">
                {unfinishedActions.map((lifeAction) => (
                  <EveningActionResolutionCard
                    key={lifeAction.id.toString()}
                    lifeAction={lifeAction}
                    snapshot={snapshot}
                    form={actionForms[lifeAction.id.toString()]}
                    disabled={isSubmitting}
                    onKindChange={onActionKindChange}
                    onActualResultChange={onActionActualResultChange}
                    onDateChange={onActionDateChange}
                    onReasonChange={onActionReasonChange}
                  />
                ))}
              </div>
            )}
            {completedActions.length === 0 ? null : (
              <details className="evening-completed-actions">
                <summary>Уже обработано: {completedActions.length}</summary>
                <div className="evening-review-list">
                  {completedActions.map((lifeAction) => (
                    <article className="evening-review-row" key={lifeAction.id.toString()}>
                      <strong>{lifeAction.title.toString()}</strong>
                      <span className="entity-status-chip">
                        {lifeActionStatusLabel(lifeAction.status)}
                      </span>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </section>

          <section className="evening-review-section" aria-labelledby="evening-summary-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker green">Итог</p>
                <h3 id="evening-summary-title">Что стало результатом дня?</h3>
              </div>
            </div>
            <label className="evening-review-field">
              <span>Итог дня *</span>
              <textarea
                value={summary}
                rows={4}
                maxLength={4000}
                disabled={isSubmitting}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  onSummaryChange(event.target.value)
                }
              />
            </label>
          </section>

          <section className="evening-review-section" aria-labelledby="tomorrow-decisions-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker gold">Следующий цикл</p>
                <h3 id="tomorrow-decisions-title">
                  {snapshot.isRecoveryReview ? 'Решения для продолжения' : 'Решения на завтра'}
                </h3>
                <p>{snapshot.tomorrowDate.toString()}</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={isSubmitting}
                onClick={onAddTomorrowDecision}
              >
                Добавить решение
              </button>
            </div>

            {snapshot.tomorrowDecisions.length === 0 ? (
              <p className="page-message">
                {snapshot.isRecoveryReview
                  ? 'Сохранённых решений на текущую дату пока нет'
                  : 'Сохранённых решений на завтра пока нет'}
              </p>
            ) : (
              <div className="evening-review-list">
                {snapshot.tomorrowDecisions.map((decision) => (
                  <article className="evening-review-row" key={decision.id.toString()}>
                    <div>
                      <strong>{decision.title.toString()}</strong>
                      <p>{decisionKindLabel(decision.kind)}</p>
                    </div>
                    <span className="entity-status-chip">
                      {decisionStatusLabel(decision.status)}
                    </span>
                  </article>
                ))}
              </div>
            )}

            <div className="tomorrow-decision-form-list">
              {tomorrowForms.map((form, index) => (
                <TomorrowDecisionFormCard
                  key={form.formId}
                  index={index}
                  form={form}
                  disabled={isSubmitting}
                  onUpdate={onUpdateTomorrowDecision}
                  onRemove={onRemoveTomorrowDecision}
                />
              ))}
            </div>
          </section>

          {error === null ? null : (
            <p className="form-error evening-review-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="evening-review-submit-bar">
          <div className="evening-review-submit-copy">
            <strong>
              {readiness.canComplete ? 'Всё готово к завершению' : 'Осталось выполнить'}
            </strong>
            <p id="evening-review-submit-reason">
              {readiness.blockingMessage ??
                (snapshot.isRecoveryReview
                  ? 'Прошлый день, остатки и решения для продолжения будут сохранены одной атомарной операцией.'
                  : 'День, действия и решения на завтра будут сохранены одной атомарной операцией.')}
            </p>
            <EveningCompletionChecklist
              readiness={readiness}
              isRecoveryReview={snapshot.isRecoveryReview}
            />
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting || !readiness.canComplete}
            aria-describedby="evening-review-submit-reason"
            data-completion-ready={readiness.canComplete ? 'true' : 'false'}
          >
            {isSubmitting ? 'Завершаем день…' : 'Завершить день'}
          </button>
        </div>
      </form>
    </EveningReviewFrame>
  );
}

function EveningReviewSteps({
  readiness,
  isRecoveryReview,
}: {
  readonly readiness: ReturnType<typeof getEveningReviewReadiness>;
  readonly isRecoveryReview: boolean;
}) {
  const steps = [
    { label: 'Проверка дня', complete: readiness.sessionsComplete },
    { label: 'Остатки', complete: readiness.actionsResolved },
    { label: 'Итог', complete: readiness.summaryRecorded },
    { label: isRecoveryReview ? 'Продолжение' : 'Завтра', complete: readiness.tomorrowPrepared },
  ];
  const firstIncompleteIndex = steps.findIndex((step) => !step.complete);
  const activeIndex = firstIncompleteIndex === -1 ? steps.length : firstIncompleteIndex;

  return (
    <ol className="evening-review-steps" aria-label="Этапы вечернего контроля">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={step.complete ? 'is-complete' : index === activeIndex ? 'is-current' : ''}
          aria-current={index === activeIndex ? 'step' : undefined}
        >
          <span>{index + 1}</span>
          {step.label}
        </li>
      ))}
      <li
        className={activeIndex === steps.length ? 'is-current' : ''}
        aria-current={activeIndex === steps.length ? 'step' : undefined}
      >
        <span>5</span>
        Завершение
      </li>
    </ol>
  );
}

function EveningCompletionChecklist({
  readiness,
  isRecoveryReview,
}: {
  readonly readiness: ReturnType<typeof getEveningReviewReadiness>;
  readonly isRecoveryReview: boolean;
}) {
  const items = [
    { label: 'Сессии завершены', complete: readiness.sessionsComplete },
    { label: 'Блоки распорядка закрыты', complete: readiness.routineComplete },
    { label: 'Действия обработаны', complete: readiness.actionsResolved },
    { label: 'Итог заполнен', complete: readiness.summaryRecorded },
    {
      label: isRecoveryReview
        ? 'Главное решение для продолжения готово'
        : 'Главное решение на завтра готово',
      complete: readiness.tomorrowPrepared,
    },
  ];

  return (
    <ul className="evening-review-completion-checklist" aria-label="Условия завершения дня">
      {items.map((item) => (
        <li className={item.complete ? 'is-complete' : ''} key={item.label}>
          <span aria-hidden="true">{item.complete ? '✓' : '○'}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function EveningReviewFrame({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="details-backdrop evening-review-backdrop" role="presentation">
      <section
        className="details-panel evening-review-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evening-review-title"
      >
        <header className="details-panel-header">
          <div>
            <p className="section-kicker gold">Этап 9.9</p>
            <h2 id="evening-review-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="details-panel-content evening-review-content">{children}</div>
      </section>
    </div>
  );
}

function EveningMetric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="evening-review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EveningActionResolutionCard({
  lifeAction,
  snapshot,
  form,
  disabled,
  onKindChange,
  onActualResultChange,
  onDateChange,
  onReasonChange,
}: {
  readonly lifeAction: LifeAction;
  readonly snapshot: EveningReviewSnapshot;
  readonly form: EveningActionForms[string] | undefined;
  readonly disabled: boolean;
  readonly onKindChange: (actionId: string, kind: EveningActionResolutionKind) => void;
  readonly onActualResultChange: (actionId: string, value: string) => void;
  readonly onDateChange: (actionId: string, value: string) => void;
  readonly onReasonChange: (actionId: string, value: string) => void;
}) {
  const actionId = lifeAction.id.toString();
  const resolvedForm = form ?? {
    kind: '',
    actualResult: '',
    newPlannedDate: snapshot.tomorrowDate.toString(),
    reason: '',
  };
  const completionAllowed = canCompleteAction(lifeAction, snapshot);

  return (
    <article className="evening-action-review-card">
      <div className="evening-action-review-heading">
        <div>
          <strong>{lifeAction.title.toString()}</strong>
          <p>{lifeAction.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}</p>
        </div>
        <span className="entity-status-chip">{lifeActionStatusLabel(lifeAction.status)}</span>
      </div>
      <label className="evening-review-field">
        <span>Решение по действию *</span>
        <select
          value={resolvedForm.kind}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onKindChange(actionId, event.target.value as EveningActionResolutionKind)
          }
        >
          <option value="">Выберите действие</option>
          <option value="complete" disabled={!completionAllowed}>
            Завершить
          </option>
          <option value="reschedule">Перенести</option>
          <option value="cancel">Отменить</option>
        </select>
      </label>
      {!completionAllowed ? (
        <p className="evening-action-hint">
          Завершение доступно только после начатого действия и завершённой рабочей сессии.
        </p>
      ) : null}
      {resolvedForm.kind === 'complete' ? (
        <label className="evening-review-field">
          <span>Фактический результат *</span>
          <textarea
            value={resolvedForm.actualResult}
            rows={3}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onActualResultChange(actionId, event.target.value)
            }
          />
        </label>
      ) : null}
      {resolvedForm.kind === 'reschedule' ? (
        <label className="evening-review-field">
          <span>Новая дата *</span>
          <input
            type="date"
            min={snapshot.tomorrowDate.toString()}
            value={resolvedForm.newPlannedDate}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onDateChange(actionId, event.target.value)
            }
          />
        </label>
      ) : null}
      {resolvedForm.kind === 'cancel' ? (
        <label className="evening-review-field">
          <span>Причина отмены</span>
          <textarea
            value={resolvedForm.reason}
            rows={2}
            disabled={disabled}
            placeholder="Например: потеряло актуальность"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onReasonChange(actionId, event.target.value)
            }
          />
        </label>
      ) : null}
    </article>
  );
}

function TomorrowDecisionFormCard({
  index,
  form,
  disabled,
  onUpdate,
  onRemove,
}: {
  readonly index: number;
  readonly form: TomorrowDecisionForm;
  readonly disabled: boolean;
  readonly onUpdate: (formId: string, patch: Partial<Omit<TomorrowDecisionForm, 'formId'>>) => void;
  readonly onRemove: (formId: string) => void;
}) {
  return (
    <article className="tomorrow-decision-form-card">
      <div className="tomorrow-decision-form-heading">
        <strong>Новое решение {index + 1}</strong>
        <button
          className="text-button danger-text-button"
          type="button"
          disabled={disabled}
          onClick={() => onRemove(form.formId)}
        >
          Убрать
        </button>
      </div>
      <label className="evening-review-field">
        <span>Вид</span>
        <select
          value={form.kind}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onUpdate(form.formId, { kind: event.target.value as DecisionKind })
          }
        >
          <option value={DECISION_KIND.main}>Главное</option>
          <option value={DECISION_KIND.additional}>Дополнительное</option>
        </select>
      </label>
      <label className="evening-review-field">
        <span>Название *</span>
        <input
          value={form.title}
          maxLength={200}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onUpdate(form.formId, { title: event.target.value })
          }
        />
      </label>
      <label className="evening-review-field">
        <span>Ожидаемый результат{form.kind === DECISION_KIND.main ? ' *' : ''}</span>
        <textarea
          value={form.expectedResult}
          rows={2}
          maxLength={1000}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onUpdate(form.formId, { expectedResult: event.target.value })
          }
        />
      </label>
    </article>
  );
}
