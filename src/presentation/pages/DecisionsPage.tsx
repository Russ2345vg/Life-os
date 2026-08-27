import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  CancelDecisionSafely,
  DeleteDecisionSafely,
  RestoreDeletedDecision,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionOverview,
  GetDecisionsForDate,
  GetDeletedDecisions,
  GetLifeActionsForDecision,
  GetSpheres,
  GetProjects,
  SpheresSnapshot,
  GetUnfinishedActionSession,
  PauseActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
} from '../../application';
import {
  DECISION_KIND,
  DECISION_STATUS,
  EntityId,
  type DayDate,
  type Decision,
} from '../../domain';
import { DecisionDetailsController } from '../components/DecisionDetailsController';
import type { DecisionWalkIntegration } from '../decision/DecisionWalkNavigation';
import { SphereBadge } from '../components/SphereReference';
import {
  SPHERE_FILTER_ALL,
  SPHERE_FILTER_NONE,
  useSpheres,
} from '../components/sphereReferenceModel';
import { SectionDateNavigator } from '../components/SectionDateNavigator';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { DECISION_FILTER, filterDecisions, type DecisionFilter } from '../decisionFilters';
import { useProjects } from '../management/projectReferenceModel';
import { isPastDate } from '../date/selectedDate';
import { useDateQuery } from '../date/useDateQuery';
import {
  decisionKindLabel,
  decisionPriorityLabel,
  decisionStatusLabel,
  statusTone,
} from '../entityPresentation';
import { DecisionCreationDialog } from './DecisionCreationForm';
import { DecisionDeleteConfirmation, DecisionTrashPanel } from './DecisionTrashPanel';
import {
  createDecisionCreationForm,
  createEmptyDecisionCreationErrors,
  submitDecisionCreation,
  type DecisionCreationFormErrors,
  type DecisionCreationFormState,
} from './DecisionCreationFormState';

interface DecisionsPageProps {
  readonly decisionWalk?: DecisionWalkIntegration | undefined;
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
  readonly getDeletedDecisions: Pick<GetDeletedDecisions, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getDecisionOverview: Pick<GetDecisionOverview, 'execute'>;
  readonly getLifeActionsForDecision: Pick<GetLifeActionsForDecision, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly getProjects: Pick<GetProjects, 'execute'>;
  readonly createLifeActionForDecision: Pick<CreateLifeActionForDecision, 'execute'>;
  readonly confirmDecisionFromActions: Pick<ConfirmDecisionFromActions, 'execute'>;
  readonly updateDecisionDetails: Pick<UpdateDecisionDetails, 'execute'>;
  readonly cancelDecisionSafely: Pick<CancelDecisionSafely, 'execute'>;
  readonly deleteDecisionSafely: Pick<DeleteDecisionSafely, 'execute'>;
  readonly restoreDeletedDecision: Pick<RestoreDeletedDecision, 'execute'>;
  readonly rescheduleDecisionSafely: Pick<RescheduleDecisionSafely, 'execute'>;
  readonly getActionSessionsForLifeAction: Pick<GetActionSessionsForLifeAction, 'execute'>;
  readonly getUnfinishedActionSession: Pick<GetUnfinishedActionSession, 'execute'>;
  readonly startLifeActionSession: Pick<StartLifeActionSession, 'execute'>;
  readonly pauseActionSession: Pick<PauseActionSession, 'execute'>;
  readonly resumeActionSession: Pick<ResumeActionSession, 'execute'>;
  readonly completeActionSession: Pick<CompleteActionSession, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
  readonly cancelLifeActionSafely: Pick<CancelLifeActionSafely, 'execute'>;
  readonly rescheduleLifeActionSafely: Pick<RescheduleLifeActionSafely, 'execute'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly onDateChange: (date: DayDate) => void;
  readonly onOpenToday: () => void;
  readonly onOpenProject?: (projectId: string) => void;
  readonly initialDecisionId?: string | null;
}

interface DateScopedFormState {
  readonly dateKey: string;
  readonly open: boolean;
  readonly saving: boolean;
  readonly form: DecisionCreationFormState;
  readonly errors: DecisionCreationFormErrors;
}

export function DecisionsPage({
  decisionWalk,
  currentDate,
  selectedDate,
  getDecisionsForDate,
  getDeletedDecisions,
  createDecisionForDate,
  getDecisionById,
  getDecisionOverview,
  getLifeActionsForDecision,
  getSpheres,
  getProjects,
  createLifeActionForDecision,
  confirmDecisionFromActions,
  updateDecisionDetails,
  cancelDecisionSafely,
  deleteDecisionSafely,
  restoreDeletedDecision,
  rescheduleDecisionSafely,
  getActionSessionsForLifeAction,
  getUnfinishedActionSession,
  startLifeActionSession,
  pauseActionSession,
  resumeActionSession,
  completeActionSession,
  completeLifeAction,
  updateLifeActionDetails,
  cancelLifeActionSafely,
  rescheduleLifeActionSafely,
  clock,
  onDateChange,
  onOpenToday,
  onOpenProject = () => undefined,
  initialDecisionId = null,
}: DecisionsPageProps) {
  const { state, reload } = useDateQuery(selectedDate, getDecisionsForDate);
  const spheres = useSpheres(getSpheres);
  const projects = useProjects(getProjects);
  const [sphereFilter, setSphereFilter] = useState(SPHERE_FILTER_ALL);
  const selectedDateKey = selectedDate.toString();
  const selectedDateKeyRef = useRef(selectedDateKey);
  const createRef = useRef(false);
  const [filterState, setFilterState] = useState<{
    readonly dateKey: string;
    readonly value: DecisionFilter;
  }>({ dateKey: selectedDateKey, value: DECISION_FILTER.all });
  const [selection, setSelection] = useState<{
    readonly dateKey: string;
    readonly decision: Decision;
  } | null>(null);
  const [noticeState, setNoticeState] = useState<{
    readonly dateKey: string;
    readonly message: string;
  } | null>(null);
  const [formState, setFormState] = useState<DateScopedFormState>(() =>
    createClosedFormState(selectedDateKey, selectedDate),
  );
  const filter = filterState.dateKey === selectedDateKey ? filterState.value : DECISION_FILTER.all;
  const selectedDecision = selection?.dateKey === selectedDateKey ? selection.decision : null;
  const notice = noticeState?.dateKey === selectedDateKey ? noticeState.message : null;
  const activeFormState =
    formState.dateKey === selectedDateKey
      ? formState
      : createClosedFormState(selectedDateKey, selectedDate);
  const pastDate = isPastDate(selectedDate, currentDate);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [trashState, setTrashState] = useState<
    | { readonly status: 'loading'; readonly decisions: readonly Decision[] }
    | { readonly status: 'ready'; readonly decisions: readonly Decision[] }
    | {
        readonly status: 'error';
        readonly decisions: readonly Decision[];
        readonly message: string;
      }
  >({ status: 'loading', decisions: [] });
  const [deleteCandidate, setDeleteCandidate] = useState<Decision | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoringDecisionId, setRestoringDecisionId] = useState<string | null>(null);
  const operationRef = useRef(false);
  const handledInitialDecisionId = useRef<string | null>(null);

  useEffect(() => {
    if (initialDecisionId === null) {
      handledInitialDecisionId.current = null;
      return;
    }
    if (handledInitialDecisionId.current === initialDecisionId) return;
    let active = true;
    void getDecisionById
      .execute(EntityId.create(initialDecisionId))
      .then((result) => {
        if (!active) return;
        handledInitialDecisionId.current = initialDecisionId;
        if (!result.ok || result.value.isDeleted()) {
          setNoticeState({
            dateKey: selectedDate.toString(),
            message: 'Связанное решение больше недоступно',
          });
          return;
        }
        const decisionDate = result.value.plannedDate ?? selectedDate;
        const dateKey = decisionDate.toString();
        setSelection({ dateKey, decision: result.value });
        if (!decisionDate.equals(selectedDate)) {
          selectedDateKeyRef.current = dateKey;
          onDateChange(decisionDate);
        }
      })
      .catch(() => {
        if (active) {
          handledInitialDecisionId.current = initialDecisionId;
          setNoticeState({
            dateKey: selectedDate.toString(),
            message: 'Связанное решение больше недоступно',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [getDecisionById, initialDecisionId, onDateChange, selectedDate]);

  async function reloadTrash(): Promise<void> {
    setTrashState((current) => ({ status: 'loading', decisions: current.decisions }));
    try {
      const decisions = await getDeletedDecisions.execute();
      setTrashState({ status: 'ready', decisions });
    } catch {
      setTrashState((current) => ({
        status: 'error',
        decisions: current.decisions,
        message: 'Не удалось загрузить корзину решений',
      }));
    }
  }

  function handleDateChange(date: DayDate): void {
    selectedDateKeyRef.current = date.toString();
    onDateChange(date);
  }

  function openCreateForm(): void {
    if (pastDate) {
      return;
    }

    setFormState({
      dateKey: selectedDateKey,
      open: true,
      saving: false,
      form: createDecisionCreationForm(selectedDate),
      errors: createEmptyDecisionCreationErrors(),
    });
  }

  function updateForm(form: DecisionCreationFormState): void {
    setFormState({
      dateKey: selectedDateKey,
      open: true,
      saving: false,
      form,
      errors: createEmptyDecisionCreationErrors(),
    });
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (createRef.current || !activeFormState.open || activeFormState.saving || pastDate) {
      return;
    }

    const submissionDateKey = selectedDateKey;
    createRef.current = true;
    setFormState({
      ...activeFormState,
      saving: true,
      errors: createEmptyDecisionCreationErrors(),
    });

    try {
      const result = await submitDecisionCreation({
        form: activeFormState.form,
        currentDate,
        createDecisionForDate,
        projects,
      });

      if (submissionDateKey !== selectedDateKeyRef.current) {
        return;
      }

      if (!result.ok) {
        setFormState({ ...activeFormState, saving: false, errors: result.errors });
        return;
      }

      const createdDate = result.decision.plannedDate ?? selectedDate;
      const createdDateKey = createdDate.toString();
      setFormState(createClosedFormState(createdDateKey, createdDate));
      setNoticeState({ dateKey: createdDateKey, message: 'Решение создано' });

      if (!createdDate.equals(selectedDate)) {
        selectedDateKeyRef.current = createdDateKey;
        onDateChange(createdDate);
        return;
      }

      await reload();
    } catch {
      setFormState({
        ...activeFormState,
        saving: false,
        errors: {
          ...createEmptyDecisionCreationErrors(),
          form: 'Не удалось создать решение',
        },
      });
    } finally {
      createRef.current = false;
    }
  }

  function handleDecisionChanged(decision: Decision): void {
    const remainsOnSelectedDate = decision.plannedDate?.equals(selectedDate) ?? false;

    if (remainsOnSelectedDate) {
      setSelection({ dateKey: selectedDateKey, decision });
      setNoticeState({ dateKey: selectedDateKey, message: 'Решение обновлено' });
    } else {
      setSelection(null);
      setNoticeState({
        dateKey: selectedDateKey,
        message:
          decision.plannedDate === null
            ? 'Решение обновлено и больше не относится к выбранной дате'
            : `Решение перенесено на ${formatShortRussianDate(decision.plannedDate)}`,
      });
    }

    void reload();
  }

  async function handleDeleteDecision(): Promise<void> {
    if (deleteCandidate === null || operationRef.current) {
      return;
    }

    operationRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteDecisionSafely.execute({
        decisionId: deleteCandidate.id,
        expectedVersion: deleteCandidate.version,
      });
      if (!result.ok) {
        setDeleteError(result.error.message);
        return;
      }

      setDeleteCandidate(null);
      setSelection(null);
      setNoticeState({ dateKey: selectedDateKey, message: 'Решение перемещено в корзину' });
      await Promise.all([reload(), reloadTrash()]);
    } catch {
      setDeleteError('Не удалось переместить решение в корзину');
    } finally {
      operationRef.current = false;
      setDeleting(false);
    }
  }

  async function handleRestoreDecision(decision: Decision): Promise<void> {
    if (operationRef.current) {
      return;
    }

    operationRef.current = true;
    setRestoringDecisionId(decision.id.toString());
    try {
      const result = await restoreDeletedDecision.execute({
        decisionId: decision.id,
        expectedVersion: decision.version,
      });
      if (!result.ok) {
        setTrashState((current) => ({
          status: 'error',
          decisions: current.decisions,
          message: result.error.message,
        }));
        return;
      }

      setSelection(null);
      await Promise.all([reloadTrash(), reload()]);
    } catch {
      setTrashState((current) => ({
        status: 'error',
        decisions: current.decisions,
        message: 'Не удалось восстановить решение',
      }));
    } finally {
      operationRef.current = false;
      setRestoringDecisionId(null);
    }
  }

  return (
    <main className="section-page decisions-page">
      <SectionPageHeader
        eyebrow="Контур решений"
        title="Решения"
        description="Создавайте, открывайте и управляйте главными и дополнительными решениями выбранного дня."
        action={
          <div className="section-header-actions">
            {viewMode === 'active' && !pastDate ? (
              <button className="primary-button" type="button" onClick={openCreateForm}>
                Создать решение
              </button>
            ) : null}
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelection(null);
                if (viewMode === 'active') {
                  setViewMode('trash');
                  void reloadTrash();
                } else {
                  setViewMode('active');
                }
              }}
            >
              {viewMode === 'active' ? 'Корзина' : 'Вернуться к решениям'}
            </button>
            {viewMode === 'active' ? (
              <button className="secondary-button" type="button" onClick={onOpenToday}>
                Открыть день
              </button>
            ) : null}
          </div>
        }
      />

      {viewMode === 'active' ? (
        <>
          <SectionDateNavigator
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
          />

          {pastDate ? (
            <p className="section-read-only-note">
              Прошедший день: создание и редактирование недоступны
            </p>
          ) : null}

          {notice === null ? null : (
            <p className="section-notice" role="status">
              {notice}
            </p>
          )}

          {activeFormState.open ? (
            <DecisionCreationDialog
              currentDate={currentDate}
              form={activeFormState.form}
              isSaving={activeFormState.saving}
              spheres={spheres}
              projects={projects}
              errors={activeFormState.errors}
              onChange={updateForm}
              onClose={() => setFormState(createClosedFormState(selectedDateKey, selectedDate))}
              onSubmit={(event) => void handleCreateSubmit(event)}
            />
          ) : null}

          {state.status === 'loading' ? <SectionMessage>Загружаем решения…</SectionMessage> : null}

          {state.status === 'error' ? (
            <SectionError message="Не удалось загрузить решения" onRetry={() => void reload()} />
          ) : null}

          {state.status === 'ready' ? (
            <DecisionsPageContent
              decisions={state.value}
              spheres={spheres}
              sphereFilter={sphereFilter}
              onSphereFilterChange={setSphereFilter}
              filter={filter}
              onFilterChange={(value) => setFilterState({ dateKey: selectedDateKey, value })}
              onOpenDecision={(decision) => setSelection({ dateKey: selectedDateKey, decision })}
              onDeleteDecision={(decision) => {
                setDeleteError(null);
                setDeleteCandidate(decision);
              }}
            />
          ) : null}
        </>
      ) : (
        <DecisionTrashPanel
          decisions={trashState.decisions}
          restoringDecisionId={restoringDecisionId}
          error={trashState.status === 'error' ? trashState.message : null}
          onOpenDecision={(decision) => setSelection({ dateKey: selectedDateKey, decision })}
          onRestoreDecision={(decision) => void handleRestoreDecision(decision)}
          onRetry={() => void reloadTrash()}
        />
      )}

      {deleteCandidate === null ? null : (
        <DecisionDeleteConfirmation
          decision={deleteCandidate}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) {
              setDeleteCandidate(null);
              setDeleteError(null);
            }
          }}
          onConfirm={() => void handleDeleteDecision()}
        />
      )}

      <DecisionDetailsController
        decisionWalk={decisionWalk}
        decision={selectedDecision}
        currentDate={currentDate}
        selectedDate={selectedDate}
        readOnly={viewMode === 'trash' || pastDate}
        getDecisionById={getDecisionById}
        getDecisionOverview={getDecisionOverview}
        getLifeActionsForDecision={getLifeActionsForDecision}
        spheres={spheres}
        projects={projects}
        createLifeActionForDecision={createLifeActionForDecision}
        confirmDecisionFromActions={confirmDecisionFromActions}
        updateDecisionDetails={updateDecisionDetails}
        cancelDecisionSafely={cancelDecisionSafely}
        rescheduleDecisionSafely={rescheduleDecisionSafely}
        getActionSessionsForLifeAction={getActionSessionsForLifeAction}
        getUnfinishedActionSession={getUnfinishedActionSession}
        startLifeActionSession={startLifeActionSession}
        pauseActionSession={pauseActionSession}
        resumeActionSession={resumeActionSession}
        completeActionSession={completeActionSession}
        completeLifeAction={completeLifeAction}
        updateLifeActionDetails={updateLifeActionDetails}
        cancelLifeActionSafely={cancelLifeActionSafely}
        rescheduleLifeActionSafely={rescheduleLifeActionSafely}
        clock={clock}
        onClose={() => setSelection(null)}
        onDecisionChanged={viewMode === 'trash' ? () => void reloadTrash() : handleDecisionChanged}
        onOpenProject={onOpenProject}
      />
    </main>
  );
}

interface DecisionsPageContentProps {
  readonly decisions: readonly Decision[];
  readonly spheres?: SpheresSnapshot;
  readonly sphereFilter?: string;
  readonly onSphereFilterChange?: (sphereId: string) => void;
  readonly filter: DecisionFilter;
  readonly onFilterChange: (filter: DecisionFilter) => void;
  readonly onOpenDecision: (decision: Decision) => void;
  readonly onDeleteDecision?: (decision: Decision) => void;
}

export function DecisionsPageContent({
  decisions,
  spheres = { active: [], archived: [] },
  sphereFilter = SPHERE_FILTER_ALL,
  onSphereFilterChange = () => undefined,
  filter,
  onFilterChange,
  onOpenDecision,
  onDeleteDecision = () => undefined,
}: DecisionsPageContentProps) {
  const mainCount = decisions.filter((decision) => decision.kind === DECISION_KIND.main).length;
  const additionalCount = decisions.length - mainCount;
  const confirmedCount = decisions.filter(
    (decision) => decision.status === DECISION_STATUS.confirmed,
  ).length;
  const filteredDecisions = useMemo(
    () =>
      filterDecisions(decisions, filter).filter((decision) => {
        if (sphereFilter === SPHERE_FILTER_ALL) return true;
        if (sphereFilter === SPHERE_FILTER_NONE) return decision.sphereId === null;
        return decision.sphereId?.toString() === sphereFilter;
      }),
    [decisions, filter, sphereFilter],
  );

  if (decisions.length === 0) {
    return <SectionMessage>На выбранный день решений пока нет</SectionMessage>;
  }

  return (
    <>
      <section className="section-summary-grid" aria-label="Итоги решений">
        <SummaryMetric label="Главные" value={mainCount} />
        <SummaryMetric label="Дополнительные" value={additionalCount} />
        <SummaryMetric label="Подтверждено" value={confirmedCount} tone="positive" />
      </section>

      <section className="action-filter-panel decision-filter-panel" aria-label="Фильтры решений">
        <div className="action-filter-heading">
          <div>
            <p className="section-page-eyebrow">Фильтр</p>
            <h2>Состояние решений</h2>
          </div>
          <span>
            {filteredDecisions.length} из {decisions.length}
          </span>
        </div>
        <div className="action-filter-list" role="group" aria-label="Выбрать состояние решений">
          {DECISION_FILTER_OPTIONS.map((option) => (
            <button
              className="action-filter-button"
              type="button"
              aria-pressed={filter === option.value}
              key={option.value}
              onClick={() => onFilterChange(option.value)}
            >
              <span>{option.label}</span>
              <strong>{countDecisionsForFilter(decisions, option.value)}</strong>
            </button>
          ))}
        </div>
        <label className="action-filter-field decision-sphere-filter">
          <span>Сфера</span>
          <select
            value={sphereFilter}
            onChange={(event) => onSphereFilterChange(event.currentTarget.value)}
          >
            <option value={SPHERE_FILTER_ALL}>Все сферы</option>
            <option value={SPHERE_FILTER_NONE}>Без сферы</option>
            {[...spheres.active, ...spheres.archived].map((sphere) => (
              <option key={sphere.id.toString()} value={sphere.id.toString()}>
                {sphere.name}
                {sphere.status === 'archived' ? ' · Архивная' : ''}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="section-entity-list" aria-labelledby="decision-list-title">
        <div className="section-list-heading">
          <div>
            <p className="section-page-eyebrow">Выбранная дата</p>
            <h2 id="decision-list-title">Список решений</h2>
          </div>
          <span>{filteredDecisions.length}</span>
        </div>
        {filteredDecisions.length === 0 ? (
          <p className="action-filter-empty">В выбранном состоянии решений нет</p>
        ) : (
          <div className="section-card-grid">
            {filteredDecisions.map((decision) => (
              <article
                className="section-entity-card decision-overview-card decision-manageable-card"
                key={decision.id.toString()}
              >
                <button
                  className="action-overview-button decision-card-open"
                  type="button"
                  aria-label={`Открыть решение «${decision.title.toString()}». Статус: ${decisionStatusLabel(decision.status)}`}
                  onClick={() => onOpenDecision(decision)}
                >
                  <div className="section-card-meta">
                    <span>{decisionKindLabel(decision.kind)}</span>
                    <span>{decisionPriorityLabel(decision.priority)}</span>
                    {decision.sphereId === null ? null : (
                      <SphereBadge sphereId={decision.sphereId.toString()} snapshot={spheres} />
                    )}
                    {decision.kind === DECISION_KIND.main && decision.order !== null ? (
                      <span>Позиция {decision.order}</span>
                    ) : null}
                  </div>
                  <h3>{decision.title.toString()}</h3>
                  <p>{decision.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}</p>
                  <div className="section-card-footer">
                    <span
                      className={`section-status section-status-${statusTone(decision.status)}`}
                    >
                      {decisionStatusLabel(decision.status)}
                    </span>
                    <span className="action-open-hint">Открыть →</span>
                  </div>
                </button>
                <button
                  className="decision-delete-inline"
                  type="button"
                  onClick={() => onDeleteDecision(decision)}
                >
                  В корзину
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

interface SummaryMetricProps {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'positive';
}

function SummaryMetric({ label, value, tone }: SummaryMetricProps) {
  return (
    <div className={tone === 'positive' ? 'section-summary-card positive' : 'section-summary-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface SectionErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}

export function SectionError({ message, onRetry }: SectionErrorProps) {
  return (
    <section className="section-page-message section-page-error" role="alert">
      <p>{message}</p>
      <button className="secondary-button" type="button" onClick={onRetry}>
        Повторить
      </button>
    </section>
  );
}

interface SectionMessageProps {
  readonly children: string;
}

export function SectionMessage({ children }: SectionMessageProps) {
  return (
    <p className="section-page-message" role="status">
      {children}
    </p>
  );
}

const DECISION_FILTER_OPTIONS: readonly {
  readonly value: DecisionFilter;
  readonly label: string;
}[] = [
  { value: DECISION_FILTER.all, label: 'Все' },
  { value: DECISION_FILTER.planned, label: 'Запланированы' },
  { value: DECISION_FILTER.inProgress, label: 'В работе' },
  { value: DECISION_FILTER.confirmed, label: 'Подтверждены' },
  { value: DECISION_FILTER.cancelled, label: 'Отменены' },
  { value: DECISION_FILTER.draft, label: 'Черновики' },
  { value: DECISION_FILTER.archived, label: 'Архив' },
];

function countDecisionsForFilter(decisions: readonly Decision[], filter: DecisionFilter): number {
  return filterDecisions(decisions, filter).length;
}

function createClosedFormState(dateKey: string, selectedDate: DayDate): DateScopedFormState {
  return {
    dateKey,
    open: false,
    saving: false,
    form: createDecisionCreationForm(selectedDate),
    errors: createEmptyDecisionCreationErrors(),
  };
}

function formatShortRussianDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}
