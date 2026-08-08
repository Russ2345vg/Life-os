import { useMemo, useState } from 'react';
import type {
  CancelDecisionSafely,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  CreateLifeActionForDecision,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionOverview,
  GetHistoryForDateRange,
  GetLifeActionsForDecision,
  GetUnfinishedActionSession,
  HistoryDateRangeResult,
  PauseActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
} from '../../application';
import {
  SESSION_COMPLETION_KIND,
  type DayDate,
  type Decision,
  type LifeAction,
} from '../../domain';
import { DecisionDetailsController } from '../components/DecisionDetailsController';
import { LifeActionDetailsController } from '../components/LifeActionDetailsController';
import { SectionDateNavigator } from '../components/SectionDateNavigator';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { addDays } from '../date/selectedDate';
import { useDateQuery } from '../date/useDateQuery';
import {
  HISTORY_ENTITY_FILTER,
  HISTORY_OUTCOME_FILTER,
  HISTORY_RANGE,
  createHistoryEntries,
  filterHistoryEntries,
  formatHistoryDuration,
  summarizeHistory,
  type HistoryEntityFilter,
  type HistoryEntry,
  type HistoryOutcomeFilter,
  type HistoryRange,
} from '../historyPresentation';
import {
  decisionKindLabel,
  decisionStatusLabel,
  lifeActionStatusLabel,
} from '../entityPresentation';
import { SectionError, SectionMessage } from './DecisionsPage';

interface HistoryPageProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly getHistoryForDateRange: Pick<GetHistoryForDateRange, 'execute'>;
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getDecisionOverview: Pick<GetDecisionOverview, 'execute'>;
  readonly getLifeActionsForDecision: Pick<GetLifeActionsForDecision, 'execute'>;
  readonly createLifeActionForDecision: Pick<CreateLifeActionForDecision, 'execute'>;
  readonly confirmDecisionFromActions: Pick<ConfirmDecisionFromActions, 'execute'>;
  readonly updateDecisionDetails: Pick<UpdateDecisionDetails, 'execute'>;
  readonly cancelDecisionSafely: Pick<CancelDecisionSafely, 'execute'>;
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
}

export function HistoryPage({
  currentDate,
  selectedDate,
  getHistoryForDateRange,
  getDecisionById,
  getDecisionOverview,
  getLifeActionsForDecision,
  createLifeActionForDecision,
  confirmDecisionFromActions,
  updateDecisionDetails,
  cancelDecisionSafely,
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
}: HistoryPageProps) {
  const [range, setRange] = useState<HistoryRange>(HISTORY_RANGE.day);
  const [entityFilter, setEntityFilter] = useState<HistoryEntityFilter>(HISTORY_ENTITY_FILTER.all);
  const [outcomeFilter, setOutcomeFilter] = useState<HistoryOutcomeFilter>(
    HISTORY_OUTCOME_FILTER.all,
  );
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [selectedAction, setSelectedAction] = useState<LifeAction | null>(null);
  const historyQuery = useMemo(
    () => ({
      execute: (endDate: DayDate) =>
        getHistoryForDateRange.execute({
          startDate: addDays(endDate, -(rangeLength(range) - 1)),
          endDate,
        }),
    }),
    [getHistoryForDateRange, range],
  );
  const { state, reload } = useDateQuery(selectedDate, historyQuery);

  function closeDetails(): void {
    setSelectedDecision(null);
    setSelectedAction(null);
  }

  function handleDateChange(date: DayDate): void {
    closeDetails();
    onDateChange(date);
  }

  function handleRangeChange(nextRange: HistoryRange): void {
    closeDetails();
    setRange(nextRange);
  }

  return (
    <main className="section-page history-page">
      <SectionPageHeader
        eyebrow="След результата"
        title="История"
        description="Хронология подтверждённых решений, завершённых действий и рабочих сессий. Раздел доступен только для просмотра."
      />

      <SectionDateNavigator
        currentDate={currentDate}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
      />

      <HistoryRangeSelector range={range} onChange={handleRangeChange} />

      {state.status === 'loading' ? <SectionMessage>Загружаем историю…</SectionMessage> : null}
      {state.status === 'error' ? (
        <SectionError message="Не удалось загрузить историю" onRetry={() => void reload()} />
      ) : null}
      {state.status === 'ready' ? (
        <HistoryPageContent
          data={state.value}
          entityFilter={entityFilter}
          outcomeFilter={outcomeFilter}
          onEntityFilterChange={setEntityFilter}
          onOutcomeFilterChange={setOutcomeFilter}
          onOpenDecision={(decision) => {
            setSelectedAction(null);
            setSelectedDecision(decision);
          }}
          onOpenAction={(lifeAction) => {
            setSelectedDecision(null);
            setSelectedAction(lifeAction);
          }}
        />
      ) : null}

      <DecisionDetailsController
        decision={selectedDecision}
        currentDate={currentDate}
        selectedDate={selectedDecision?.plannedDate ?? selectedDate}
        readOnly
        getDecisionById={getDecisionById}
        getDecisionOverview={getDecisionOverview}
        getLifeActionsForDecision={getLifeActionsForDecision}
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
        onClose={() => setSelectedDecision(null)}
        onDecisionChanged={() => undefined}
      />

      <LifeActionDetailsController
        lifeAction={selectedAction}
        currentDate={currentDate}
        readOnly
        clock={clock}
        getDecisionById={getDecisionById}
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
        backLabel="Назад к истории"
        onClose={() => setSelectedAction(null)}
        onActionChanged={() => undefined}
      />
    </main>
  );
}

interface HistoryPageContentProps {
  readonly data: HistoryDateRangeResult;
  readonly entityFilter?: HistoryEntityFilter;
  readonly outcomeFilter?: HistoryOutcomeFilter;
  readonly onEntityFilterChange?: (filter: HistoryEntityFilter) => void;
  readonly onOutcomeFilterChange?: (filter: HistoryOutcomeFilter) => void;
  readonly onOpenDecision?: (decision: Decision) => void;
  readonly onOpenAction?: (lifeAction: LifeAction) => void;
}

export function HistoryPageContent({
  data,
  entityFilter = HISTORY_ENTITY_FILTER.all,
  outcomeFilter = HISTORY_OUTCOME_FILTER.all,
  onEntityFilterChange = () => undefined,
  onOutcomeFilterChange = () => undefined,
  onOpenDecision = () => undefined,
  onOpenAction = () => undefined,
}: HistoryPageContentProps) {
  const entries = useMemo(() => createHistoryEntries(data), [data]);
  const filteredEntries = useMemo(
    () => filterHistoryEntries(entries, entityFilter, outcomeFilter),
    [entries, entityFilter, outcomeFilter],
  );
  const summary = useMemo(() => summarizeHistory(entries), [entries]);

  if (entries.length === 0) {
    return <SectionMessage>В выбранном диапазоне завершённой истории пока нет</SectionMessage>;
  }

  return (
    <>
      <section className="history-summary-grid" aria-label="Итоги истории">
        <HistoryMetric label="Решения подтверждены" value={summary.confirmedDecisions.toString()} />
        <HistoryMetric label="Действия завершены" value={summary.completedActions.toString()} />
        <HistoryMetric label="Рабочие сессии" value={summary.sessions.toString()} />
        <HistoryMetric
          label="Время работы"
          value={formatHistoryDuration(summary.workedDurationMs)}
        />
      </section>

      <section className="history-filter-panel" aria-label="Фильтры истории">
        <HistoryFilterGroup
          label="Что показывать"
          value={entityFilter}
          options={ENTITY_FILTER_OPTIONS}
          count={(value) => filterHistoryEntries(entries, value, HISTORY_OUTCOME_FILTER.all).length}
          onChange={onEntityFilterChange}
        />
        <HistoryFilterGroup
          label="Исход"
          value={outcomeFilter}
          options={OUTCOME_FILTER_OPTIONS}
          count={(value) => filterHistoryEntries(entries, HISTORY_ENTITY_FILTER.all, value).length}
          onChange={onOutcomeFilterChange}
        />
      </section>

      <section className="history-timeline" aria-labelledby="history-timeline-title">
        <div className="section-list-heading">
          <div>
            <p className="section-page-eyebrow">Хронология</p>
            <h2 id="history-timeline-title">События результата</h2>
          </div>
          <span>{filteredEntries.length}</span>
        </div>

        {filteredEntries.length === 0 ? (
          <p className="history-empty">По выбранным фильтрам событий нет</p>
        ) : (
          <ol className="history-timeline-list">
            {filteredEntries.map((entry) => (
              <li key={entry.key}>
                <HistoryEntryCard
                  entry={entry}
                  onOpenDecision={onOpenDecision}
                  onOpenAction={onOpenAction}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

interface HistoryRangeSelectorProps {
  readonly range: HistoryRange;
  readonly onChange: (range: HistoryRange) => void;
}

function HistoryRangeSelector({ range, onChange }: HistoryRangeSelectorProps) {
  return (
    <section className="history-range-panel" aria-label="Диапазон истории">
      <div>
        <p className="section-page-eyebrow">Диапазон</p>
        <strong>Выбранная дата является концом периода</strong>
      </div>
      <div className="history-range-options" role="group" aria-label="Выбрать диапазон истории">
        {RANGE_OPTIONS.map((option) => (
          <button
            type="button"
            className="history-filter-button"
            aria-pressed={range === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

interface HistoryMetricProps {
  readonly label: string;
  readonly value: string;
}

function HistoryMetric({ label, value }: HistoryMetricProps) {
  return (
    <div className="history-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface FilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface HistoryFilterGroupProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly FilterOption<T>[];
  readonly count: (value: T) => number;
  readonly onChange: (value: T) => void;
}

function HistoryFilterGroup<T extends string>({
  label,
  value,
  options,
  count,
  onChange,
}: HistoryFilterGroupProps<T>) {
  return (
    <div className="history-filter-group">
      <strong>{label}</strong>
      <div className="history-filter-options" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            className="history-filter-button"
            aria-pressed={value === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            <small>{count(option.value)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

interface HistoryEntryCardProps {
  readonly entry: HistoryEntry;
  readonly onOpenDecision: (decision: Decision) => void;
  readonly onOpenAction: (lifeAction: LifeAction) => void;
}

function HistoryEntryCard({ entry, onOpenDecision, onOpenAction }: HistoryEntryCardProps) {
  const presentation = historyEntryPresentation(entry);
  const open =
    entry.kind === 'decision'
      ? () => onOpenDecision(entry.decision)
      : () => onOpenAction(entry.lifeAction);

  return (
    <button
      className={`history-timeline-card history-${entry.kind}-entry`}
      type="button"
      aria-label={`Открыть ${presentation.entityLabel.toLocaleLowerCase('ru-RU')} «${presentation.title}»`}
      onClick={open}
    >
      <span className="history-timeline-marker" aria-hidden="true" />
      <div className="history-entry-content">
        <div className="section-card-meta">
          <span>{presentation.entityLabel}</span>
          <time dateTime={entry.occurredAt.toISOString()}>
            {formatHistoryDateTime(entry.occurredAt)}
          </time>
        </div>
        <h3>{presentation.title}</h3>
        <p>{presentation.description}</p>
        <div className="history-entry-footer">
          <span className={`history-outcome history-outcome-${entry.outcome}`}>
            {presentation.outcomeLabel}
          </span>
          {presentation.duration === null ? null : <span>{presentation.duration}</span>}
          <span>Открыть →</span>
        </div>
      </div>
    </button>
  );
}

function historyEntryPresentation(entry: HistoryEntry): {
  readonly entityLabel: string;
  readonly title: string;
  readonly description: string;
  readonly outcomeLabel: string;
  readonly duration: string | null;
} {
  if (entry.kind === 'decision') {
    return {
      entityLabel: decisionKindLabel(entry.decision.kind),
      title: entry.decision.title.toString(),
      description:
        entry.decision.actualResultSummary?.toString() ??
        entry.decision.cancelReason?.toString() ??
        entry.decision.expectedResult?.toString() ??
        'Итог решения не указан',
      outcomeLabel: decisionStatusLabel(entry.decision.status),
      duration: null,
    };
  }

  if (entry.kind === 'action') {
    return {
      entityLabel:
        entry.lifeAction.decisionId === null ? 'Самостоятельное действие' : 'Действие по решению',
      title: entry.lifeAction.title.toString(),
      description:
        entry.lifeAction.actualResult?.toString() ??
        entry.lifeAction.cancelReason?.toString() ??
        entry.lifeAction.expectedResult?.toString() ??
        'Итог действия не указан',
      outcomeLabel: lifeActionStatusLabel(entry.lifeAction.status),
      duration: null,
    };
  }

  return {
    entityLabel: 'Рабочая сессия',
    title: entry.lifeAction.title.toString(),
    description: entry.session.resultNote?.toString() ?? 'Комментарий к сессии не указан',
    outcomeLabel:
      entry.session.completionKind === SESSION_COMPLETION_KIND.interrupted
        ? 'Прервана'
        : 'Завершена',
    duration: formatHistoryDuration(entry.session.workedDurationAt(entry.occurredAt)),
  };
}

function formatHistoryDateTime(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function rangeLength(range: HistoryRange): number {
  switch (range) {
    case HISTORY_RANGE.day:
      return 1;
    case HISTORY_RANGE.week:
      return 7;
    case HISTORY_RANGE.month:
      return 30;
  }
}

const RANGE_OPTIONS: readonly FilterOption<HistoryRange>[] = [
  { value: HISTORY_RANGE.day, label: 'День' },
  { value: HISTORY_RANGE.week, label: '7 дней' },
  { value: HISTORY_RANGE.month, label: '30 дней' },
];

const ENTITY_FILTER_OPTIONS: readonly FilterOption<HistoryEntityFilter>[] = [
  { value: HISTORY_ENTITY_FILTER.all, label: 'Все' },
  { value: HISTORY_ENTITY_FILTER.decisions, label: 'Решения' },
  { value: HISTORY_ENTITY_FILTER.actions, label: 'Действия' },
  { value: HISTORY_ENTITY_FILTER.sessions, label: 'Сессии' },
];

const OUTCOME_FILTER_OPTIONS: readonly FilterOption<HistoryOutcomeFilter>[] = [
  { value: HISTORY_OUTCOME_FILTER.all, label: 'Все исходы' },
  { value: HISTORY_OUTCOME_FILTER.completed, label: 'Завершено' },
  { value: HISTORY_OUTCOME_FILTER.cancelled, label: 'Отменено' },
  { value: HISTORY_OUTCOME_FILTER.interrupted, label: 'Прервано' },
];
