import { useRef, useState } from 'react';
import type {
  ActionListItem,
  ActionListsForDateSnapshot,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  GetActionListsForDate,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetUnfinishedActionSession,
  GetSpheres,
  GetProjects,
  SpheresSnapshot,
  PauseActionSession,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  StartLifeActionSession,
  UpdateLifeActionDetails,
} from '../../application';
import { ACTION_LIST_GROUP } from '../../application';
import { DayDate, type LifeAction } from '../../domain';
import { formatActionDuration, resolveActionListPrimaryAction } from '../actionListPresentation';
import {
  ACTION_DURATION_FILTER,
  ACTION_FILTER_ANY,
  ACTION_RESULT_FILTER,
  DEFAULT_ACTION_LIST_FILTERS,
  buildActionFilterOptions,
  countActiveActionFilters,
  filterActionListItems,
  type ActionListFilters,
} from '../actionListFilters';
import { LifeActionDetailsController } from '../components/LifeActionDetailsController';
import { SphereBadge } from '../components/SphereReference';
import { useSpheres } from '../components/sphereReferenceModel';
import { SectionDateNavigator } from '../components/SectionDateNavigator';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { isPastDate } from '../date/selectedDate';
import { useDateQuery } from '../date/useDateQuery';
import { SectionError, SectionMessage } from './DecisionsPage';
import type { ActionListFiltersStore } from './ActionListFiltersStore';
import { useProjects } from '../management/projectReferenceModel';

interface ActionsPageProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly getActionListsForDate: Pick<GetActionListsForDate, 'execute'>;
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getActionSessionsForLifeAction: Pick<GetActionSessionsForLifeAction, 'execute'>;
  readonly getUnfinishedActionSession: Pick<GetUnfinishedActionSession, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly getProjects?: Pick<GetProjects, 'execute'>;
  readonly startLifeActionSession: Pick<StartLifeActionSession, 'execute'>;
  readonly pauseActionSession: Pick<PauseActionSession, 'execute'>;
  readonly resumeActionSession: Pick<ResumeActionSession, 'execute'>;
  readonly completeActionSession: Pick<CompleteActionSession, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
  readonly cancelLifeActionSafely: Pick<CancelLifeActionSafely, 'execute'>;
  readonly rescheduleLifeActionSafely: Pick<RescheduleLifeActionSafely, 'execute'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly actionListFiltersStore: ActionListFiltersStore;
  readonly onDateChange: (date: DayDate) => void;
  readonly onOpenToday: () => void;
  readonly onOpenProject?: (projectId: string) => void;
}

interface ActionOperationState {
  readonly dateKey: string | null;
  readonly actionId: string | null;
  readonly message: string | null;
  readonly error: string | null;
}

const INITIAL_OPERATION_STATE: ActionOperationState = {
  dateKey: null,
  actionId: null,
  message: null,
  error: null,
};

export function ActionsPage({
  currentDate,
  selectedDate,
  getActionListsForDate,
  getDecisionById,
  getActionSessionsForLifeAction,
  getUnfinishedActionSession,
  getSpheres,
  getProjects,
  startLifeActionSession,
  pauseActionSession,
  resumeActionSession,
  completeActionSession,
  completeLifeAction,
  updateLifeActionDetails,
  cancelLifeActionSafely,
  rescheduleLifeActionSafely,
  clock,
  actionListFiltersStore,
  onDateChange,
  onOpenToday,
  onOpenProject = () => undefined,
}: ActionsPageProps) {
  const { state, reload } = useDateQuery(selectedDate, getActionListsForDate);
  const spheres = useSpheres(getSpheres);
  const projects = useProjects(getProjects);
  const [filters, setFilters] = useState<ActionListFilters>(() => actionListFiltersStore.load());
  const selectedDateKey = selectedDate.toString();
  const [selection, setSelection] = useState<{
    readonly dateKey: string;
    readonly action: LifeAction;
  } | null>(null);
  const [noticeState, setNoticeState] = useState<{
    readonly dateKey: string;
    readonly message: string;
  } | null>(null);
  const [operationState, setOperationState] =
    useState<ActionOperationState>(INITIAL_OPERATION_STATE);
  const operationRef = useRef(false);
  const selectedAction = selection?.dateKey === selectedDateKey ? selection.action : null;
  const notice = noticeState?.dateKey === selectedDateKey ? noticeState.message : null;
  const visibleOperationState =
    operationState.dateKey === selectedDateKey ? operationState : INITIAL_OPERATION_STATE;
  const canManageSessions = selectedDate.equals(currentDate);

  function updateFilters(nextFilters: ActionListFilters): void {
    setFilters(nextFilters);
    actionListFiltersStore.save(nextFilters);
  }

  function resetFilters(): void {
    setFilters({ ...DEFAULT_ACTION_LIST_FILTERS });
    actionListFiltersStore.reset();
    if (!selectedDate.equals(currentDate)) {
      onDateChange(currentDate);
    }
  }

  function handleActionChanged(lifeAction: LifeAction): void {
    const remainsOnSelectedDate = lifeAction.plannedDate?.equals(selectedDate) ?? false;

    if (remainsOnSelectedDate) {
      setSelection({ dateKey: selectedDateKey, action: lifeAction });
      setNoticeState(null);
    } else {
      setSelection(null);
      setNoticeState({
        dateKey: selectedDateKey,
        message:
          lifeAction.plannedDate === null
            ? 'Действие обновлено и больше не относится к выбранной дате'
            : `Действие перенесено на ${formatShortRussianDate(lifeAction.plannedDate)}`,
      });
    }

    void reload();
  }

  async function handlePrimaryAction(item: ActionListItem): Promise<void> {
    const primaryAction = resolveActionListPrimaryAction(item, canManageSessions);

    if (primaryAction.command === 'open') {
      setSelection({ dateKey: selectedDateKey, action: item.lifeAction });
      return;
    }

    if (operationRef.current) {
      return;
    }

    operationRef.current = true;
    const actionId = item.lifeAction.id.toString();
    setOperationState({ dateKey: selectedDateKey, actionId, message: null, error: null });

    try {
      if (primaryAction.command === 'resume') {
        const session = item.unfinishedSession;
        if (session === null) {
          setOperationState({
            dateKey: selectedDateKey,
            actionId: null,
            message: null,
            error: 'Приостановленная сессия не найдена. Обновите список.',
          });
          return;
        }

        const result = await resumeActionSession.execute({ sessionId: session.id });
        if (!result.ok) {
          setOperationState({
            dateKey: selectedDateKey,
            actionId: null,
            message: null,
            error: result.error.message,
          });
          return;
        }

        setOperationState({
          dateKey: selectedDateKey,
          actionId: null,
          message: `Сессия «${item.lifeAction.title.toString()}» продолжена`,
          error: null,
        });
        await reload();
        return;
      }

      const result = await startLifeActionSession.execute({ lifeActionId: item.lifeAction.id });
      if (!result.ok) {
        setOperationState({
          dateKey: selectedDateKey,
          actionId: null,
          message: null,
          error: result.error.message,
        });
        return;
      }

      setOperationState({
        dateKey: selectedDateKey,
        actionId: null,
        message: `Сессия «${item.lifeAction.title.toString()}» начата`,
        error: null,
      });
      await reload();
    } catch {
      setOperationState({
        dateKey: selectedDateKey,
        actionId: null,
        message: null,
        error: 'Не удалось выполнить команду действия',
      });
    } finally {
      operationRef.current = false;
    }
  }

  return (
    <main className="section-page actions-page">
      <SectionPageHeader
        eyebrow="Исполнение"
        title="Действия"
        description="Смотрите готовую, текущую, приостановленную и завершённую работу в отдельных списках с единым состоянием сессий."
        action={
          <button className="primary-button" type="button" onClick={onOpenToday}>
            Открыть день
          </button>
        }
      />

      <SectionDateNavigator
        currentDate={currentDate}
        selectedDate={selectedDate}
        onDateChange={onDateChange}
      />

      {notice === null ? null : (
        <p className="section-notice" role="status">
          {notice}
        </p>
      )}
      {visibleOperationState.message === null ? null : (
        <p className="section-notice" role="status">
          {visibleOperationState.message}
        </p>
      )}
      {visibleOperationState.error === null ? null : (
        <p className="section-error-message" role="alert">
          {visibleOperationState.error}
        </p>
      )}

      {state.status === 'loading' ? <SectionMessage>Загружаем действия…</SectionMessage> : null}
      {state.status === 'error' ? (
        <SectionError message="Не удалось загрузить действия" onRetry={() => void reload()} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <ActionFiltersPanel
            currentDate={currentDate}
            selectedDate={selectedDate}
            items={state.value.items}
            spheres={spheres}
            filters={filters}
            onDateChange={onDateChange}
            onFiltersChange={updateFilters}
            onReset={resetFilters}
          />
          <ActionsPageContent
            snapshot={{ ...state.value, items: filterActionListItems(state.value.items, filters) }}
            totalItemCount={state.value.items.length}
            activeFilterCount={
              countActiveActionFilters(filters) + (selectedDate.equals(currentDate) ? 0 : 1)
            }
            canManageSessions={canManageSessions}
            spheres={spheres}
            busyActionId={visibleOperationState.actionId}
            onOpenAction={(action) => setSelection({ dateKey: selectedDateKey, action })}
            onPrimaryAction={(item) => void handlePrimaryAction(item)}
          />
        </>
      ) : null}

      <LifeActionDetailsController
        lifeAction={selectedAction}
        spheres={spheres}
        currentDate={currentDate}
        readOnly={isPastDate(selectedDate, currentDate)}
        clock={clock}
        getDecisionById={getDecisionById}
        projects={projects}
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
        backLabel="Назад к спискам действий"
        onClose={() => setSelection(null)}
        onActionChanged={handleActionChanged}
        onOpenProject={onOpenProject}
      />
    </main>
  );
}

interface ActionFiltersPanelProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly items: readonly ActionListItem[];
  readonly spheres?: SpheresSnapshot;
  readonly filters: ActionListFilters;
  readonly onDateChange: (date: DayDate) => void;
  readonly onFiltersChange: (filters: ActionListFilters) => void;
  readonly onReset: () => void;
}

export function ActionFiltersPanel({
  currentDate,
  selectedDate,
  items,
  spheres = { active: [], archived: [] },
  filters,
  onDateChange,
  onFiltersChange,
  onReset,
}: ActionFiltersPanelProps) {
  const options = buildActionFilterOptions(items, spheres);
  const activeCount =
    countActiveActionFilters(filters) + (selectedDate.equals(currentDate) ? 0 : 1);

  function patchFilters(patch: Partial<ActionListFilters>): void {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <section className="action-filters" aria-labelledby="action-filters-title">
      <div className="action-filters-heading">
        <div>
          <p className="section-page-eyebrow">Отбор</p>
          <h2 id="action-filters-title">Фильтры действий</h2>
          <p>Уточните дату, сферу, решение, состояние, длительность и наличие результата.</p>
        </div>
        <div className="action-filters-summary">
          <span>
            {activeCount === 0 ? 'Фильтры не заданы' : `Активно фильтров: ${activeCount}`}
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={activeCount === 0}
            onClick={onReset}
          >
            Сбросить фильтры
          </button>
        </div>
      </div>

      <div className="action-filter-grid">
        <label className="action-filter-field">
          <span>Дата</span>
          <input
            type="date"
            value={selectedDate.toString()}
            onChange={(event) => {
              if (event.currentTarget.value.length > 0) {
                onDateChange(DayDate.create(event.currentTarget.value));
              }
            }}
          />
        </label>

        <label className="action-filter-field">
          <span>Сфера</span>
          <select
            value={filters.sphere}
            onChange={(event) => patchFilters({ sphere: event.currentTarget.value })}
          >
            <option value={ACTION_FILTER_ANY}>Все сферы</option>
            {options.spheres.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="action-filter-field">
          <span>Решение</span>
          <select
            value={filters.decisionId}
            onChange={(event) => patchFilters({ decisionId: event.currentTarget.value })}
          >
            <option value={ACTION_FILTER_ANY}>Все решения</option>
            {options.decisions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="action-filter-field">
          <span>Состояние</span>
          <select
            value={filters.group}
            onChange={(event) =>
              patchFilters({ group: event.currentTarget.value as ActionListFilters['group'] })
            }
          >
            <option value={ACTION_FILTER_ANY}>Все состояния</option>
            <option value={ACTION_LIST_GROUP.active}>Активные</option>
            <option value={ACTION_LIST_GROUP.paused}>Приостановленные</option>
            <option value={ACTION_LIST_GROUP.ready}>Готовые</option>
            <option value={ACTION_LIST_GROUP.completed}>Завершённые</option>
            <option value={ACTION_LIST_GROUP.cancelled}>Отменённые</option>
          </select>
        </label>

        <label className="action-filter-field">
          <span>Рабочее время</span>
          <select
            value={filters.duration}
            onChange={(event) =>
              patchFilters({ duration: event.currentTarget.value as ActionListFilters['duration'] })
            }
          >
            <option value={ACTION_DURATION_FILTER.all}>Любая длительность</option>
            <option value={ACTION_DURATION_FILTER.none}>Без учтённого времени</option>
            <option value={ACTION_DURATION_FILTER.under30}>До 30 минут</option>
            <option value={ACTION_DURATION_FILTER.from30To60}>30–59 минут</option>
            <option value={ACTION_DURATION_FILTER.from60To120}>1–2 часа</option>
            <option value={ACTION_DURATION_FILTER.over120}>2 часа и больше</option>
          </select>
        </label>

        <label className="action-filter-field">
          <span>Фактический результат</span>
          <select
            value={filters.result}
            onChange={(event) =>
              patchFilters({ result: event.currentTarget.value as ActionListFilters['result'] })
            }
          >
            <option value={ACTION_RESULT_FILTER.all}>Не важно</option>
            <option value={ACTION_RESULT_FILTER.withResult}>Результат есть</option>
            <option value={ACTION_RESULT_FILTER.withoutResult}>Результата нет</option>
          </select>
        </label>
      </div>
    </section>
  );
}

interface ActionsPageContentProps {
  readonly snapshot: ActionListsForDateSnapshot;
  readonly totalItemCount?: number;
  readonly activeFilterCount?: number;
  readonly canManageSessions: boolean;
  readonly spheres?: SpheresSnapshot;
  readonly busyActionId: string | null;
  readonly onOpenAction: (lifeAction: LifeAction) => void;
  readonly onPrimaryAction: (item: ActionListItem) => void;
}

export function ActionsPageContent({
  snapshot,
  totalItemCount = snapshot.items.length,
  activeFilterCount = 0,
  canManageSessions,
  spheres = { active: [], archived: [] },
  busyActionId,
  onOpenAction,
  onPrimaryAction,
}: ActionsPageContentProps) {
  const [expandedGroups, setExpandedGroups] = useState<
    Partial<Record<ActionListItem['group'], boolean>>
  >({});

  if (snapshot.items.length === 0) {
    return (
      <SectionMessage>
        {totalItemCount > 0 && activeFilterCount > 0
          ? 'По выбранным фильтрам действий нет. Измените условия или сбросьте фильтры.'
          : 'На выбранный день действий пока нет'}
      </SectionMessage>
    );
  }

  function isGroupExpanded(group: ActionListItem['group']): boolean {
    const override = expandedGroups[group];
    if (override !== undefined) {
      return override;
    }

    return countItems(snapshot.items, group) > 0;
  }

  function setGroupExpanded(group: ActionListItem['group'], expanded: boolean): void {
    setExpandedGroups((current) => ({ ...current, [group]: expanded }));
  }

  function navigateToGroup(group: ActionListItem['group']): void {
    setGroupExpanded(group, true);

    if (typeof document === 'undefined') {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(actionListSectionId(group))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <>
      <section className="action-list-summary" aria-label="Состояние действий">
        {ACTION_LIST_DEFINITIONS.map((definition) => {
          const value = countItems(snapshot.items, definition.group);

          return (
            <SummaryMetric
              key={definition.group}
              label={definition.title}
              value={value}
              controlsId={actionListContentId(definition.group)}
              onActivate={() => navigateToGroup(definition.group)}
              {...(definition.tone === undefined ? {} : { tone: definition.tone })}
            />
          );
        })}
      </section>

      <div className="action-state-lists">
        {ACTION_LIST_DEFINITIONS.map((definition) => {
          const items = snapshot.items.filter((item) => item.group === definition.group);
          const isExpanded = isGroupExpanded(definition.group);

          return (
            <ActionListSection
              key={definition.group}
              definition={definition}
              items={items}
              isExpanded={isExpanded}
              canManageSessions={canManageSessions}
              spheres={spheres}
              busyActionId={busyActionId}
              onToggle={() => setGroupExpanded(definition.group, !isExpanded)}
              onOpenAction={onOpenAction}
              onPrimaryAction={onPrimaryAction}
            />
          );
        })}
      </div>
    </>
  );
}

interface ActionListDefinition {
  readonly group: ActionListItem['group'];
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly tone?: 'positive' | 'active';
}

const ACTION_LIST_DEFINITIONS: readonly ActionListDefinition[] = [
  {
    group: ACTION_LIST_GROUP.active,
    title: 'Активные',
    eyebrow: 'В работе',
    description: 'Действия с текущей сессией или уже начатой работой.',
    emptyMessage: 'Активных действий нет',
    tone: 'active',
  },
  {
    group: ACTION_LIST_GROUP.paused,
    title: 'Приостановленные',
    eyebrow: 'Пауза',
    description: 'Сессии, которые можно безопасно продолжить.',
    emptyMessage: 'Приостановленных действий нет',
  },
  {
    group: ACTION_LIST_GROUP.ready,
    title: 'Готовые',
    eyebrow: 'Можно начать',
    description: 'Подготовленные действия без незавершённой сессии.',
    emptyMessage: 'Готовых действий нет',
  },
  {
    group: ACTION_LIST_GROUP.completed,
    title: 'Завершённые',
    eyebrow: 'Результат',
    description: 'Действия с зафиксированным фактическим результатом.',
    emptyMessage: 'Завершённых действий нет',
    tone: 'positive',
  },
  {
    group: ACTION_LIST_GROUP.cancelled,
    title: 'Отменённые',
    eyebrow: 'История',
    description: 'Отменённые действия сохранены вместе с причиной и сессиями.',
    emptyMessage: 'Отменённых действий нет',
  },
];

interface ActionListSectionProps {
  readonly definition: ActionListDefinition;
  readonly items: readonly ActionListItem[];
  readonly isExpanded: boolean;
  readonly canManageSessions: boolean;
  readonly spheres: SpheresSnapshot;
  readonly busyActionId: string | null;
  readonly onToggle: () => void;
  readonly onOpenAction: (lifeAction: LifeAction) => void;
  readonly onPrimaryAction: (item: ActionListItem) => void;
}

function ActionListSection({
  definition,
  items,
  isExpanded,
  canManageSessions,
  spheres,
  busyActionId,
  onToggle,
  onOpenAction,
  onPrimaryAction,
}: ActionListSectionProps) {
  const titleId = `action-list-${definition.group}`;
  const sectionId = actionListSectionId(definition.group);
  const contentId = actionListContentId(definition.group);

  return (
    <section
      id={sectionId}
      className={`action-state-list action-state-list-${definition.group}${isExpanded ? ' is-expanded' : ' is-collapsed'}`}
      aria-labelledby={titleId}
    >
      <button
        className="action-state-list-toggle"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="action-state-list-heading-copy">
          <span className="section-page-eyebrow">{definition.eyebrow}</span>
          <strong id={titleId}>{definition.title}</strong>
          <span className="action-state-list-description">{definition.description}</span>
        </span>
        <span className="action-state-list-toggle-meta">
          <span className="action-state-list-count" aria-label={`${items.length} действий`}>
            {items.length}
          </span>
          <span className="action-state-list-chevron" aria-hidden="true">
            {isExpanded ? '−' : '+'}
          </span>
        </span>
      </button>

      {isExpanded ? (
        <div id={contentId} className="action-state-list-content">
          {items.length === 0 ? (
            <p className="action-list-empty">{definition.emptyMessage}</p>
          ) : (
            <div className="action-list-card-grid">
              {items.map((item) => (
                <ActionListCard
                  key={item.lifeAction.id.toString()}
                  item={item}
                  canManageSessions={canManageSessions}
                  spheres={spheres}
                  isBusy={busyActionId === item.lifeAction.id.toString()}
                  onOpenAction={onOpenAction}
                  onPrimaryAction={onPrimaryAction}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

interface ActionListCardProps {
  readonly item: ActionListItem;
  readonly canManageSessions: boolean;
  readonly spheres: SpheresSnapshot;
  readonly isBusy: boolean;
  readonly onOpenAction: (lifeAction: LifeAction) => void;
  readonly onPrimaryAction: (item: ActionListItem) => void;
}

function ActionListCard({
  item,
  canManageSessions,
  spheres,
  isBusy,
  onOpenAction,
  onPrimaryAction,
}: ActionListCardProps) {
  const action = item.lifeAction;
  const primaryAction = resolveActionListPrimaryAction(item, canManageSessions);

  return (
    <article className="section-entity-card action-list-card" aria-busy={isBusy}>
      <div className="section-card-meta">
        <span>{item.decisionTitle ?? 'Самостоятельное действие'}</span>
        <SphereBadge sphereId={item.sphereId} snapshot={spheres} />
        <time dateTime={action.plannedDate?.toString()}>
          {action.plannedDate === null ? 'Без даты' : formatShortRussianDate(action.plannedDate)}
        </time>
      </div>

      <div className="action-list-card-heading">
        <h3>{action.title.toString()}</h3>
        <span className={`section-status action-list-status action-list-status-${item.group}`}>
          {actionListGroupLabel(item)}
        </span>
      </div>

      <p className="action-list-expected-result">
        {action.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}
      </p>

      <dl className="action-list-facts">
        <div>
          <dt>Сессии</dt>
          <dd>
            {item.sessions.length}, завершено {item.completedSessionCount}
          </dd>
        </div>
        <div>
          <dt>Рабочее время</dt>
          <dd>{formatActionDuration(item.totalWorkedDurationMs)}</dd>
        </div>
      </dl>

      {action.actualResult === null ? null : (
        <div className="action-list-actual-result">
          <span>Фактический результат</span>
          <p>{action.actualResult.toString()}</p>
        </div>
      )}

      {action.rescheduleCount > 0 ? (
        <p className="action-list-reschedule-note">Переносов: {action.rescheduleCount}</p>
      ) : null}

      <div className="action-list-card-actions">
        <button
          className="primary-button action-list-primary-button"
          type="button"
          disabled={isBusy}
          onClick={() => onPrimaryAction(item)}
        >
          {isBusy ? 'Выполняем…' : primaryAction.label}
        </button>
        {primaryAction.command === 'open' ? null : (
          <button
            className="secondary-button"
            type="button"
            disabled={isBusy}
            onClick={() => onOpenAction(action)}
          >
            Открыть карточку
          </button>
        )}
      </div>
    </article>
  );
}

function countItems(items: readonly ActionListItem[], group: ActionListItem['group']): number {
  return items.filter((item) => item.group === group).length;
}

function actionListGroupLabel(item: ActionListItem): string {
  switch (item.group) {
    case ACTION_LIST_GROUP.active:
      return item.unfinishedSession?.isRunning() === true ? 'Сессия идёт' : 'В работе';
    case ACTION_LIST_GROUP.paused:
      return 'Сессия на паузе';
    case ACTION_LIST_GROUP.ready:
      return 'Готово';
    case ACTION_LIST_GROUP.completed:
      return 'Завершено';
    case ACTION_LIST_GROUP.cancelled:
      return 'Отменено';
  }
}

interface SummaryMetricProps {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'positive' | 'active';
  readonly controlsId: string;
  readonly onActivate: () => void;
}

function SummaryMetric({ label, value, tone, controlsId, onActivate }: SummaryMetricProps) {
  const className =
    tone === undefined
      ? 'section-summary-card action-summary-button'
      : `section-summary-card action-summary-button ${tone}`;

  return (
    <button className={className} type="button" aria-controls={controlsId} onClick={onActivate}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function actionListSectionId(group: ActionListItem['group']): string {
  return `action-state-list-${group}`;
}

function actionListContentId(group: ActionListItem['group']): string {
  return `action-state-list-content-${group}`;
}

function formatShortRussianDate(date: DayDate): string {
  const [yearText, monthText, dayText] = date.toString().split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return date.toString();
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
