import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { useMemo, useState, type FormEvent } from 'react';
import type {
  CancelDecisionSafely,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  CorrectJournalData,
  ConfirmDecisionFromActions,
  CreateLifeActionForDecision,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionOverview,
  GetJournalTimeline,
  GetLifeActionsForDecision,
  GetSpheres,
  GetProjects,
  GetUnfinishedActionSession,
  HistoryDateRangeResult,
  IdGenerator,
  JournalTimelineItem,
  JournalTimelineResult,
  PauseActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
} from '../../application';
import {
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  SESSION_COMPLETION_KIND,
  type DayDate,
  type Decision,
  type JournalEntryType,
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
import { useSpheres } from '../components/sphereReferenceModel';
import { useProjects } from '../management/projectReferenceModel';
import {
  DEFAULT_JOURNAL_TIMELINE_FILTERS,
  JOURNAL_STATE_FILTER,
  JOURNAL_TYPE_FILTER,
  createJournalSphereFilterOptions,
  filterJournalTimelineItems,
  groupJournalItems,
  hasActiveJournalTimelineFilters,
  type JournalStateFilter,
  type JournalTimelineFilters,
  type JournalTypeFilter,
} from '../journalTimelineFilters';

const EMPTY_GET_SPHERES: Pick<GetSpheres, 'execute'> = {
  execute: async () => ({ active: [], archived: [] }),
};

interface HistoryPageProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly getJournalTimeline: Pick<GetJournalTimeline, 'execute'>;
  readonly correctJournalData: Pick<CorrectJournalData, 'execute'>;
  readonly idGenerator: Pick<IdGenerator, 'generate'>;
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getDecisionOverview: Pick<GetDecisionOverview, 'execute'>;
  readonly getLifeActionsForDecision: Pick<GetLifeActionsForDecision, 'execute'>;
  readonly getSpheres?: Pick<GetSpheres, 'execute'>;
  readonly getProjects?: Pick<GetProjects, 'execute'>;
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
  readonly onOpenProject?: (projectId: string) => void;
}

export function HistoryPage({
  currentDate,
  selectedDate,
  getJournalTimeline,
  correctJournalData,
  idGenerator,
  getDecisionById,
  getDecisionOverview,
  getLifeActionsForDecision,
  getSpheres,
  getProjects,
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
  onOpenProject = () => undefined,
}: HistoryPageProps) {
  const spheres = useSpheres(getSpheres ?? EMPTY_GET_SPHERES);
  const projects = useProjects(getProjects);
  const [range, setRange] = useState<HistoryRange>(HISTORY_RANGE.day);
  const [journalFilters, setJournalFilters] = useState<JournalTimelineFilters>(
    DEFAULT_JOURNAL_TIMELINE_FILTERS,
  );
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [selectedAction, setSelectedAction] = useState<LifeAction | null>(null);
  const [selectedCorrection, setSelectedCorrection] = useState<JournalTimelineItem | null>(null);
  const historyQuery = useMemo(
    () => ({
      execute: (endDate: DayDate) =>
        getJournalTimeline.execute({
          startDate: addDays(endDate, -(rangeLength(range) - 1)),
          endDate,
        }),
    }),
    [getJournalTimeline, range],
  );
  const { state, reload } = useDateQuery(selectedDate, historyQuery);

  function closeDetails(): void {
    setSelectedDecision(null);
    setSelectedAction(null);
    setSelectedCorrection(null);
  }

  function handleDateChange(date: DayDate): void {
    closeDetails();
    setJournalFilters(DEFAULT_JOURNAL_TIMELINE_FILTERS);
    onDateChange(date);
  }

  function handleRangeChange(nextRange: HistoryRange): void {
    closeDetails();
    setJournalFilters(DEFAULT_JOURNAL_TIMELINE_FILTERS);
    setRange(nextRange);
  }

  function handleJournalFiltersChange(filters: JournalTimelineFilters): void {
    closeDetails();
    setJournalFilters(filters);
  }

  return (
    <main className="section-page history-page">
      <SectionPageHeader
        eyebrow="Хронология LifeOS"
        title="История"
        description="Значимые события дня в порядке их фактического совершения. Ошибочные данные исправляются отдельными аудируемыми событиями."
      />

      <SectionDateNavigator
        currentDate={currentDate}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
      />

      <HistoryRangeSelector range={range} onChange={handleRangeChange} />

      {state.status === 'loading' ? <SectionMessage>Загружаем журнал…</SectionMessage> : null}
      {state.status === 'error' ? (
        <SectionError message="Не удалось загрузить журнал" onRetry={() => void reload()} />
      ) : null}
      {state.status === 'ready' ? (
        <JournalTimelineContent
          data={state.value}
          filters={journalFilters}
          onFiltersChange={handleJournalFiltersChange}
          onOpenDecision={(decision) => {
            setSelectedAction(null);
            setSelectedDecision(decision);
          }}
          onOpenAction={(lifeAction) => {
            setSelectedDecision(null);
            setSelectedAction(lifeAction);
          }}
          onCorrect={(item) => {
            setSelectedDecision(null);
            setSelectedAction(null);
            setSelectedCorrection(item);
          }}
          onNavigateToSource={(date) => handleDateChange(date)}
        />
      ) : null}

      <DecisionDetailsController
        spheres={spheres}
        projects={projects}
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
        onOpenProject={onOpenProject}
      />

      <LifeActionDetailsController
        spheres={spheres}
        lifeAction={selectedAction}
        currentDate={currentDate}
        readOnly
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
        backLabel="Назад к истории"
        onClose={() => setSelectedAction(null)}
        onActionChanged={() => undefined}
        onOpenProject={onOpenProject}
      />

      <JournalCorrectionDialog
        item={selectedCorrection}
        correctJournalData={correctJournalData}
        idGenerator={idGenerator}
        onClose={() => setSelectedCorrection(null)}
        onSaved={() => {
          setSelectedCorrection(null);
          void reload();
        }}
      />
    </main>
  );
}

interface JournalTimelineContentProps {
  readonly data: JournalTimelineResult;
  readonly filters?: JournalTimelineFilters;
  readonly onFiltersChange?: (filters: JournalTimelineFilters) => void;
  readonly onOpenDecision?: (decision: Decision) => void;
  readonly onOpenAction?: (lifeAction: LifeAction) => void;
  readonly onCorrect?: (item: JournalTimelineItem) => void;
  readonly onNavigateToSource?: (date: DayDate) => void;
}

export function JournalTimelineContent({
  data,
  filters = DEFAULT_JOURNAL_TIMELINE_FILTERS,
  onFiltersChange = () => undefined,
  onOpenDecision = () => undefined,
  onOpenAction = () => undefined,
  onCorrect = () => undefined,
  onNavigateToSource = () => undefined,
}: JournalTimelineContentProps) {
  const filteredItems = filterJournalTimelineItems(data.items, filters);
  const groups = groupJournalItems(filteredItems);
  const filtersAreActive = hasActiveJournalTimelineFilters(filters);

  return (
    <>
      <JournalTimelineFilterPanel data={data} filters={filters} onChange={onFiltersChange} />
      {data.items.length === 0 ? (
        <SectionMessage>В выбранном диапазоне событий журнала пока нет</SectionMessage>
      ) : groups.length === 0 ? (
        <section className="journal-filter-empty" aria-live="polite">
          <strong>По заданным условиям событий нет</strong>
          <p>Измените поиск или сбросьте фильтры, чтобы снова увидеть хронологию.</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onFiltersChange(DEFAULT_JOURNAL_TIMELINE_FILTERS)}
          >
            Сбросить фильтры
          </button>
        </section>
      ) : (
        <section className="journal-timeline" aria-label="Хронология событий">
          <div className="journal-result-count" aria-live="polite">
            {filtersAreActive
              ? `Показано ${filteredItems.length} из ${data.items.length} событий`
              : `Всего событий: ${data.items.length}`}
          </div>
          {groups.map((group) => (
            <section className="journal-day" key={group.date}>
              <h2>{formatJournalDate(group.date)}</h2>
              <ol className="journal-event-list">
                {group.items.map((item) => (
                  <JournalTimelineRow
                    item={item}
                    key={item.entry.id.toString()}
                    onOpenDecision={onOpenDecision}
                    onOpenAction={onOpenAction}
                    onCorrect={onCorrect}
                    onNavigateToSource={onNavigateToSource}
                  />
                ))}
              </ol>
            </section>
          ))}
        </section>
      )}
    </>
  );
}

function JournalTimelineFilterPanel({
  data,
  filters,
  onChange,
}: {
  readonly data: JournalTimelineResult;
  readonly filters: JournalTimelineFilters;
  readonly onChange: (filters: JournalTimelineFilters) => void;
}) {
  const sphereOptions = createJournalSphereFilterOptions(data.items);
  const filtersAreActive = hasActiveJournalTimelineFilters(filters);

  return (
    <section className="journal-filter-panel" aria-labelledby="journal-filter-title">
      <div className="journal-filter-heading">
        <div>
          <p className="section-page-eyebrow">Поиск и фильтры</p>
          <h2 id="journal-filter-title">Найти событие</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={!filtersAreActive}
          onClick={() => onChange(DEFAULT_JOURNAL_TIMELINE_FILTERS)}
        >
          Сбросить
        </button>
      </div>

      <div className="journal-filter-fields">
        <VoiceField className="journal-filter-search">
          <span>Название</span>
          <VoiceTextInput
            type="search"
            value={filters.query}
            placeholder="Название решения или действия"
            onValueChange={(value) => onChange({ ...filters, query: value })}
          />
        </VoiceField>
        <label>
          <span>Дата</span>
          <input
            type="date"
            min={data.startDate.toString()}
            max={data.endDate.toString()}
            value={filters.date}
            onChange={(event) => onChange({ ...filters, date: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>Сфера</span>
          <select
            value={filters.sphere}
            onChange={(event) => onChange({ ...filters, sphere: event.currentTarget.value })}
          >
            {sphereOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Тип</span>
          <select
            value={filters.type}
            onChange={(event) =>
              onChange({ ...filters, type: event.currentTarget.value as JournalTypeFilter })
            }
          >
            {JOURNAL_TYPE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Состояние</span>
          <select
            value={filters.state}
            onChange={(event) =>
              onChange({ ...filters, state: event.currentTarget.value as JournalStateFilter })
            }
          >
            {JOURNAL_STATE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

const JOURNAL_TYPE_OPTIONS: readonly FilterOption<JournalTypeFilter>[] = [
  { value: JOURNAL_TYPE_FILTER.all, label: 'Все типы' },
  { value: JOURNAL_TYPE_FILTER.day, label: 'День' },
  { value: JOURNAL_TYPE_FILTER.decision, label: 'Решение' },
  { value: JOURNAL_TYPE_FILTER.lifeAction, label: 'Действие' },
  { value: JOURNAL_TYPE_FILTER.workSession, label: 'Рабочая сессия' },
  { value: JOURNAL_TYPE_FILTER.correction, label: 'Исправление данных' },
];

const JOURNAL_STATE_OPTIONS: readonly FilterOption<JournalStateFilter>[] = [
  { value: JOURNAL_STATE_FILTER.all, label: 'Все состояния' },
  { value: JOURNAL_STATE_FILTER.created, label: 'Создано' },
  { value: JOURNAL_STATE_FILTER.started, label: 'Начато' },
  { value: JOURNAL_STATE_FILTER.paused, label: 'На паузе' },
  { value: JOURNAL_STATE_FILTER.resumed, label: 'Продолжено' },
  { value: JOURNAL_STATE_FILTER.completed, label: 'Завершено' },
  { value: JOURNAL_STATE_FILTER.interrupted, label: 'Прервано' },
  { value: JOURNAL_STATE_FILTER.rescheduled, label: 'Перенесено' },
  { value: JOURNAL_STATE_FILTER.cancelled, label: 'Отменено' },
  { value: JOURNAL_STATE_FILTER.corrected, label: 'Исправлено' },
];

function JournalTimelineRow({
  item,
  onOpenDecision,
  onOpenAction,
  onCorrect,
  onNavigateToSource,
}: {
  readonly item: JournalTimelineItem;
  readonly onOpenDecision: (decision: Decision) => void;
  readonly onOpenAction: (lifeAction: LifeAction) => void;
  readonly onCorrect: (item: JournalTimelineItem) => void;
  readonly onNavigateToSource: (date: DayDate) => void;
}) {
  const context = journalContext(item);
  return (
    <li className="journal-event" id={`journal-entry-${item.entry.id.toString()}`}>
      <time dateTime={item.entry.occurredAt.toISOString()}>
        {formatJournalTime(item.entry.occurredAt)}
      </time>
      <span className="journal-event-marker" aria-hidden="true" />
      <div className="journal-event-content">
        <strong>{JOURNAL_EVENT_LABELS[item.entry.type]}</strong>
        {item.entry.labelAtEvent === null ? null : item.decision !== null ? (
          <button type="button" onClick={() => onOpenDecision(item.decision!)}>
            «{item.entry.labelAtEvent}»
          </button>
        ) : item.lifeAction !== null ? (
          <button type="button" onClick={() => onOpenAction(item.lifeAction!)}>
            «{item.entry.labelAtEvent}»
          </button>
        ) : (
          <span className="journal-subject-label">«{item.entry.labelAtEvent}»</span>
        )}
        {item.entry.sphereId === null ? null : (
          <span className="journal-sphere">{item.sphereName ?? 'Сфера недоступна'}</span>
        )}
        {relatedEntityUnavailable(item) ? (
          <span className="journal-unavailable">Связанная сущность недоступна</span>
        ) : null}
        {context === null ? null : <p>{context}</p>}
        {item.entry.correction === null ? null : (
          <JournalCorrectionSummary item={item} onNavigateToSource={onNavigateToSource} />
        )}
        {item.correctionTarget === null ? null : (
          <button
            type="button"
            className="secondary-button journal-correction-action"
            onClick={() => onCorrect(item)}
          >
            Исправить данные
          </button>
        )}
      </div>
    </li>
  );
}

function JournalCorrectionSummary({
  item,
  onNavigateToSource,
}: {
  readonly item: JournalTimelineItem;
  readonly onNavigateToSource: (date: DayDate) => void;
}) {
  const correction = item.entry.correction;
  if (correction === null) return null;

  return (
    <section className="journal-correction-summary" aria-label="Сведения об исправлении">
      <dl>
        <div>
          <dt>Прежнее значение</dt>
          <dd>{correction.previousValue ?? 'Не указано'}</dd>
        </div>
        <div>
          <dt>Новое значение</dt>
          <dd>{correction.newValue}</dd>
        </div>
        <div>
          <dt>Причина</dt>
          <dd>{correction.reason}</dd>
        </div>
      </dl>
      {correction.previousCorrectionId === null ? null : (
        <span>Продолжение цепочки исправлений</span>
      )}
      {item.sourceEntry === null ? (
        <span>Исходное событие недоступно, историческая запись сохранена.</span>
      ) : (
        <a
          href={`#journal-entry-${item.sourceEntry.id.toString()}`}
          onClick={() => onNavigateToSource(item.sourceEntry!.effectiveDate)}
        >
          Перейти к исходному событию
        </a>
      )}
    </section>
  );
}

export function JournalCorrectionDialog({
  item,
  correctJournalData,
  idGenerator,
  onClose,
  onSaved,
}: {
  readonly item: JournalTimelineItem | null;
  readonly correctJournalData: Pick<CorrectJournalData, 'execute'>;
  readonly idGenerator: Pick<IdGenerator, 'generate'>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  if (item?.correctionTarget === null || item === null) return null;
  return (
    <JournalCorrectionForm
      key={item.entry.id.toString()}
      item={item}
      target={item.correctionTarget}
      correctJournalData={correctJournalData}
      idGenerator={idGenerator}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function JournalCorrectionForm({
  item,
  target,
  correctJournalData,
  idGenerator,
  onClose,
  onSaved,
}: {
  readonly item: JournalTimelineItem;
  readonly target: NonNullable<JournalTimelineItem['correctionTarget']>;
  readonly correctJournalData: Pick<CorrectJournalData, 'execute'>;
  readonly idGenerator: Pick<IdGenerator, 'generate'>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [commandId] = useState(() => idGenerator.generate());
  const [newValue, setNewValue] = useState(target.currentValue ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedValue = newValue.trim();
  const canSubmit =
    !submitting &&
    normalizedValue.length > 0 &&
    normalizedValue !== target.currentValue &&
    reason.trim().length > 0;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await correctJournalData.execute({
        commandId,
        sourceEntryId: item.entry.id,
        newValue,
        reason,
      });
      if (result.ok) {
        onSaved();
        return;
      }
      setError(result.error.message);
    } catch {
      setError('Исправление не сохранено. Исходные данные не изменились.');
    }
    setSubmitting(false);
  }

  return (
    <div className="decision-details-backdrop journal-correction-backdrop">
      <section
        className="journal-correction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-correction-title"
      >
        <button
          type="button"
          className="decision-details-close"
          aria-label="Закрыть исправление"
          disabled={submitting}
          onClick={onClose}
        >
          ×
        </button>
        <p className="section-page-eyebrow">Безопасное исправление</p>
        <h2 id="journal-correction-title">Исправить данные</h2>
        <form className="journal-correction-form" onSubmit={(event) => void submit(event)}>
          <dl className="journal-correction-target">
            <div>
              <dt>Сущность</dt>
              <dd>{target.entityLabel}</dd>
            </div>
            <div>
              <dt>Поле</dt>
              <dd>{target.fieldLabel}</dd>
            </div>
            <div>
              <dt>Прежнее значение</dt>
              <dd>{target.currentValue ?? 'Не указано'}</dd>
            </div>
          </dl>
          <VoiceField>
            <span>Новое значение</span>
            <VoiceTextArea
              required
              maxLength={target.field === 'lifeAction.actualResult' ? 2_000 : 1_000}
              value={newValue}
              onValueChange={(value) => setNewValue(value)}
            />
          </VoiceField>
          <VoiceField>
            <span>Причина исправления</span>
            <VoiceTextArea
              required
              maxLength={2_000}
              value={reason}
              onValueChange={(value) => setReason(value)}
            />
          </VoiceField>
          <p className="journal-correction-confirmation">
            Исходная запись останется в истории. Исправление будет добавлено как новое событие.
          </p>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={!canSubmit}>
              {submitting ? 'Сохраняем…' : 'Сохранить исправление'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={submitting}
              onClick={onClose}
            >
              Отмена
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function relatedEntityUnavailable(item: JournalTimelineItem): boolean {
  if (item.entry.subjectType === JOURNAL_SUBJECT_TYPE.decision) return item.decision === null;
  if (
    item.entry.subjectType === JOURNAL_SUBJECT_TYPE.lifeAction ||
    item.entry.subjectType === JOURNAL_SUBJECT_TYPE.workSession
  ) {
    return item.lifeAction === null;
  }
  return false;
}

const JOURNAL_EVENT_LABELS: Readonly<Record<JournalEntryType, string>> = {
  [JOURNAL_ENTRY_TYPE.dayStarted]: 'Начало дня',
  [JOURNAL_ENTRY_TYPE.decisionCreated]: 'Решение создано',
  [JOURNAL_ENTRY_TYPE.workSessionStarted]: 'Действие начато',
  [JOURNAL_ENTRY_TYPE.workSessionPaused]: 'Пауза',
  [JOURNAL_ENTRY_TYPE.workSessionResumed]: 'Работа продолжена',
  [JOURNAL_ENTRY_TYPE.workSessionCompleted]: 'Рабочая сессия завершена',
  [JOURNAL_ENTRY_TYPE.decisionRescheduled]: 'Решение перенесено',
  [JOURNAL_ENTRY_TYPE.decisionCancelled]: 'Решение отменено',
  [JOURNAL_ENTRY_TYPE.actionRescheduled]: 'Действие перенесено',
  [JOURNAL_ENTRY_TYPE.actionCompleted]: 'Действие завершено',
  [JOURNAL_ENTRY_TYPE.actionCancelled]: 'Действие отменено',
  [JOURNAL_ENTRY_TYPE.dayCompleted]: 'Вечерний контроль завершён',
  [JOURNAL_ENTRY_TYPE.dataCorrected]: 'Исправление данных',
  [JOURNAL_ENTRY_TYPE.directionStrategicReviewed]: 'Стратегический обзор направления',
};

function journalContext(item: JournalTimelineItem): string | null {
  if (item.entry.correction !== null) return null;
  const metadata = item.entry.metadata;
  if (metadata === null) return null;
  if (
    (item.entry.type === JOURNAL_ENTRY_TYPE.decisionRescheduled ||
      item.entry.type === JOURNAL_ENTRY_TYPE.actionRescheduled) &&
    typeof metadata.previousDate === 'string' &&
    typeof metadata.newDate === 'string'
  ) {
    return `${formatJournalDate(metadata.previousDate)} → ${formatJournalDate(metadata.newDate)}`;
  }
  if (typeof metadata.reason === 'string') return metadata.reason;
  if (typeof metadata.resultNote === 'string') return metadata.resultNote;
  if (typeof metadata.summary === 'string') return metadata.summary;
  return null;
}

function formatJournalTime(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function formatJournalDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year!, month! - 1, day));
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
