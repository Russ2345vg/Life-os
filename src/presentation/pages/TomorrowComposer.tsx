import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { TomorrowPlanService, TomorrowPlanSnapshot } from '../../application';
import {
  DECISION_KIND,
  EntityId,
  EVENING_CYCLE_MODE,
  TOMORROW_PLAN_STATUS,
  type DayDate,
  type Decision,
  type EveningCycleMode,
} from '../../domain';
import { EveningVisualIcon } from '../components/EveningVisualIcon';
import '../styles/evening-tomorrow-saved.css';
import '../styles/evening-tomorrow-form-v3.css';
import {
  buildTomorrowWorkingFormPresentation,
  getTomorrowSceneEditorValues,
  getTomorrowSceneVisualState,
  type TomorrowOutcomeLevel,
} from './TomorrowScenePresentation';

interface TomorrowComposerProps {
  readonly cycleDate: DayDate;
  readonly service: Pick<
    TomorrowPlanService,
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
  readonly onPrepared: () => void;
  readonly onSaved?: () => void;
  readonly onClose: () => void;
  readonly embedded?: boolean;
  readonly mode?: EveningCycleMode;
  readonly completedActionLabel?: string;
  readonly historyView?: boolean;
  readonly initialEditingBlock?: EditableBlock | null;
}

export type EditableBlock = 'all' | 'primary' | 'outcomes' | 'first-action' | 'supporting';

export function TomorrowComposer({
  cycleDate,
  service,
  onPrepared,
  onSaved,
  onClose,
  embedded = false,
  mode = EVENING_CYCLE_MODE.normal,
  completedActionLabel = 'Закрыть',
  historyView = false,
  initialEditingBlock = null,
}: TomorrowComposerProps) {
  const [snapshot, setSnapshot] = useState<TomorrowPlanSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [primaryId, setPrimaryId] = useState('');
  const [vector, setVector] = useState('');
  const [newPrimaryTitle, setNewPrimaryTitle] = useState('');
  const [newPrimaryResult, setNewPrimaryResult] = useState('');
  const [minimum, setMinimum] = useState('');
  const [target, setTarget] = useState('');
  const [stretch, setStretch] = useState('');
  const [selectedOutcomeLevel, setSelectedOutcomeLevel] = useState<TomorrowOutcomeLevel>(
    mode === EVENING_CYCLE_MODE.quick ? 'minimum' : 'target',
  );
  const [firstActionId, setFirstActionId] = useState('');
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionResult, setNewActionResult] = useState('');
  const [supportingIds, setSupportingIds] = useState<readonly string[]>([]);
  const [newSupportingTitle1, setNewSupportingTitle1] = useState('');
  const [newSupportingTitle2, setNewSupportingTitle2] = useState('');
  const [continueOverloaded, setContinueOverloaded] = useState(false);
  const [editingBlock, setEditingBlock] = useState<EditableBlock | null>(initialEditingBlock);
  const [isCreatingPrimary, setIsCreatingPrimary] = useState(false);
  const [primaryChooserOpen, setPrimaryChooserOpen] = useState(false);
  const [creatingSupportingSlots, setCreatingSupportingSlots] = useState<
    readonly [boolean, boolean]
  >([false, false]);
  const primarySectionRef = useRef<HTMLElement>(null);
  const firstActionSectionRef = useRef<HTMLElement>(null);

  const applySnapshotToEditor = useCallback((loaded: TomorrowPlanSnapshot): void => {
    const values = getTomorrowSceneEditorValues(loaded.plan);
    setSnapshot(loaded);
    setPrimaryId(values.primaryId);
    setVector(values.vector);
    setMinimum(values.minimum);
    setTarget(values.target);
    setStretch(values.stretch);
    setFirstActionId(values.firstActionId);
    setSupportingIds(values.supportingIds);
    setNewPrimaryTitle(values.newPrimaryTitle);
    setNewPrimaryResult(values.newPrimaryResult);
    setNewActionTitle(values.newActionTitle);
    setNewActionResult(values.newActionResult);
    setNewSupportingTitle1(values.newSupportingTitle1);
    setNewSupportingTitle2(values.newSupportingTitle2);
    setIsCreatingPrimary(values.isCreatingPrimary);
    setPrimaryChooserOpen(values.primaryChooserOpen);
    setCreatingSupportingSlots(values.creatingSupportingSlots);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void service
      .getOrCreate(cycleDate)
      .then((loaded) => {
        if (cancelled) return;
        applySnapshotToEditor(loaded);
        if (loaded.plan.status === TOMORROW_PLAN_STATUS.completed) onSaved?.();
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [applySnapshotToEditor, cycleDate, onSaved, service]);

  useEffect(() => {
    if (snapshot === null || initialEditingBlock !== 'first-action') return;
    requestAnimationFrame(() => {
      const section = firstActionSectionRef.current;
      section?.scrollIntoView({ behavior: 'auto', block: 'center' });
      section
        ?.querySelector<HTMLElement>(
          'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        )
        ?.focus();
    });
  }, [initialEditingBlock, snapshot]);

  const decisions = useMemo(() => sortDecisionCandidates(snapshot), [snapshot]);
  const primaryCandidates = decisions.filter((decision) => decision.kind === DECISION_KIND.main);
  const selectedPrimary = primaryCandidates.find(
    (decision) => decision.id.toString() === primaryId,
  );
  const actionCandidates =
    snapshot?.targetLifeActions.filter(
      (action) => primaryId.length > 0 && action.decisionId?.toString() === primaryId,
    ) ?? [];
  const selectedFirstAction = actionCandidates.find(
    (action) => action.id.toString() === firstActionId,
  );
  const availableSupportingDecisions = decisions.filter(
    (decision) =>
      decision.id.toString() !== primaryId && !supportingIds.includes(decision.id.toString()),
  );
  const supportingCapacityUsed =
    supportingIds.length +
    [newSupportingTitle1, newSupportingTitle2].filter((title) => title.trim().length > 0).length;
  const isQuick = mode === EVENING_CYCLE_MODE.quick;
  const isCompleted = snapshot?.plan.status === TOMORROW_PLAN_STATUS.completed;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving || snapshot === null) return;
    setSaving(true);
    setError(null);
    try {
      let current = snapshot;
      if (!isQuick) current = await service.setVector(cycleDate, vector);
      if (primaryId.length > 0) {
        current = await service.assignPrimaryDecision(cycleDate, EntityId.create(primaryId));
      } else {
        current = await service.createPrimaryDecision(cycleDate, {
          title: newPrimaryTitle,
          expectedResult: newPrimaryResult,
        });
        setPrimaryId(current.plan.primaryDecisionId?.toString() ?? '');
      }
      current = await service.setOutcomes(
        cycleDate,
        minimum,
        isQuick ? current.plan.targetOutcome : target,
        isQuick ? current.plan.stretchOutcome : stretch,
      );
      if (firstActionId.length > 0) {
        current = await service.assignFirstAction(cycleDate, EntityId.create(firstActionId));
      } else {
        current = await service.createFirstAction(cycleDate, {
          title: newActionTitle,
          expectedResult: newActionResult,
        });
        setFirstActionId(current.plan.firstActionId?.toString() ?? '');
      }
      if (!isQuick) {
        current = await service.setSupportingDecisions(
          cycleDate,
          supportingIds.map(EntityId.create),
        );
        for (const title of [newSupportingTitle1, newSupportingTitle2]) {
          if (title.trim().length > 0) {
            current = await service.createSupportingDecision(cycleDate, { title });
          }
        }
      }
      current = await service.complete(cycleDate, continueOverloaded || isCompleted);
      applySnapshotToEditor(current);
      onSaved?.();
      setEditingBlock(null);
    } catch (cause: unknown) {
      setError(messageOf(cause));
      try {
        applySnapshotToEditor(await service.getOrCreate(cycleDate));
      } catch {
        // Исходная ошибка точнее описывает неудавшийся шаг.
      }
    } finally {
      setSaving(false);
    }
  }

  if (snapshot === null) {
    return (
      <ComposerFrame onClose={onClose} embedded={embedded}>
        <section
          className={`tomorrow-scene-state ${error === null ? 'is-loading' : 'is-error'}`}
          role={error === null ? 'status' : 'alert'}
          aria-live="polite"
        >
          <span className="tomorrow-scene-state-icon" aria-hidden="true">
            <EveningVisualIcon name={error === null ? 'calendar' : 'ban'} size={24} />
          </span>
          <div>
            <p className="section-kicker">Завтра</p>
            <strong>{error ?? 'Собираем архитектуру следующего дня…'}</strong>
          </div>
        </section>
      </ComposerFrame>
    );
  }

  if (isCompleted && editingBlock === null) {
    return (
      <ComposerFrame onClose={onClose} embedded={embedded}>
        <TomorrowCompleteSummary
          snapshot={snapshot}
          isQuick={isQuick}
          onEdit={setEditingBlock}
          onContinue={onPrepared}
          actionLabel={completedActionLabel}
          historyView={historyView}
        />
      </ComposerFrame>
    );
  }

  const primaryReady =
    primaryId.length > 0 ||
    (isCreatingPrimary && newPrimaryTitle.trim().length > 0 && newPrimaryResult.trim().length > 0);
  const actionReady =
    firstActionId.length > 0 ||
    (newActionTitle.trim().length > 0 && newActionResult.trim().length > 0);
  const selectedPrimaryIsCarried =
    selectedPrimary !== undefined &&
    snapshot.carriedDecisionCandidate?.id.equals(selectedPrimary.id) === true;
  const visualState = getTomorrowSceneVisualState({
    primaryReady,
    minimumOutcome: minimum,
    firstActionReady: actionReady,
  });
  const workingForm = buildTomorrowWorkingFormPresentation({
    selectedOutcomeLevel,
    minimum,
    target,
    stretch,
    primaryReady,
    firstActionReady: actionReady,
    overloaded: snapshot.overloaded,
    overloadAccepted: continueOverloaded,
  });
  const outcomeLevels: readonly TomorrowOutcomeLevel[] = isQuick
    ? ['minimum']
    : ['minimum', 'target', 'stretch'];
  const selectedPrimaryMetadata = uniqueNonEmpty([
    selectedPrimary?.projectReference,
    vector.trim().length > 0 ? vector : null,
  ]);
  const hasOpenSupportingDraft = creatingSupportingSlots.some((isCreating, index) => {
    if (!isCreating) return false;
    return (index === 0 ? newSupportingTitle1 : newSupportingTitle2).trim().length === 0;
  });
  const showBlock = (block: EditableBlock): boolean =>
    !isCompleted ||
    editingBlock === 'all' ||
    editingBlock === block ||
    (editingBlock === 'primary' && block === 'first-action');

  return (
    <ComposerFrame onClose={onClose} embedded={embedded}>
      <form
        className={`evening-tomorrow-scene${isQuick ? ' is-quick' : ''}${isCompleted ? ' is-completed-edit' : ''}`}
        data-plan-state={visualState}
        data-has-vector={vector.trim().length > 0 ? 'true' : 'false'}
        data-carried-primary={selectedPrimaryIsCarried ? 'true' : 'false'}
        data-overloaded={snapshot.overloaded ? 'true' : 'false'}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="tomorrow-working-form-scroll">
          <p className="tomorrow-working-date">
            Завтра <span aria-hidden="true">·</span>{' '}
            {formatTomorrowDate(snapshot.plan.targetDateKey)}
          </p>
          <div className="tomorrow-dashboard">
            {showBlock('primary') ? (
              <section
                className={`tomorrow-primary-card ${
                  selectedPrimary === undefined && !isCreatingPrimary ? 'is-empty' : 'is-selected'
                }`}
                aria-label="Главное решение"
                ref={primarySectionRef}
              >
                <div className="tomorrow-working-section-heading">
                  <span className="tomorrow-working-section-index" aria-hidden="true">
                    1
                  </span>
                  <p>Главное решение</p>
                </div>
                {selectedPrimary === undefined && !isCreatingPrimary ? (
                  <div className="tomorrow-primary-empty">
                    <button
                      className="tomorrow-primary-empty-cta"
                      type="button"
                      aria-expanded={primaryChooserOpen}
                      disabled={saving}
                      onClick={() => setPrimaryChooserOpen(!primaryChooserOpen)}
                    >
                      <span>Выбрать или создать решение</span>
                      <EveningVisualIcon name="arrow-right" size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="tomorrow-primary-layout">
                    <div className="tomorrow-primary-copy">
                      <h3 id="tomorrow-primary-title">
                        {isCreatingPrimary
                          ? newPrimaryTitle || 'Новое решение'
                          : (selectedPrimary?.title.toString() ?? 'Новое решение')}
                      </h3>
                      <div className="tomorrow-primary-meta">
                        {isCreatingPrimary ? (
                          <span>Будет добавлено на завтра</span>
                        ) : selectedPrimaryMetadata.length === 0 ? null : (
                          selectedPrimaryMetadata.map((item) => <span key={item}>{item}</span>)
                        )}
                        {selectedPrimaryIsCarried ? (
                          <span className="is-carried">
                            <EveningVisualIcon name="carry" size={13} />
                            Перенесено с сегодня
                          </span>
                        ) : null}
                      </div>
                      {selectedPrimary === undefined ||
                      selectedPrimary.expectedResult === null ||
                      isCreatingPrimary ? null : (
                        <p className="tomorrow-primary-context">
                          <span>Ожидаемый результат</span>
                          {selectedPrimary.expectedResult.toString()}
                        </p>
                      )}
                    </div>
                    <button
                      className="text-button tomorrow-primary-change"
                      type="button"
                      disabled={saving}
                      onClick={() => setPrimaryChooserOpen(!primaryChooserOpen)}
                    >
                      Изменить
                    </button>
                  </div>
                )}
                {primaryChooserOpen || isCreatingPrimary ? (
                  <div className="tomorrow-primary-controls">
                    {primaryCandidates.length > 0 ? (
                      <label className="tomorrow-compact-select">
                        <span>Выбрать существующее</span>
                        <select
                          value={isCreatingPrimary ? '' : primaryId}
                          disabled={saving}
                          onChange={(event) => {
                            const nextPrimaryId = event.target.value;
                            if (primaryId !== nextPrimaryId) setFirstActionId('');
                            setPrimaryId(nextPrimaryId);
                            setIsCreatingPrimary(false);
                            if (nextPrimaryId.length > 0) setPrimaryChooserOpen(false);
                          }}
                        >
                          <option value="">Выберите Решение</option>
                          {primaryCandidates.map((decision) => {
                            const carried =
                              snapshot.carriedDecisionCandidate?.id.equals(decision.id) === true;
                            return (
                              <option key={decision.id.toString()} value={decision.id.toString()}>
                                {decision.title.toString()}
                                {carried ? ' · перенесено с сегодня' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ) : null}
                    <button
                      className="tomorrow-create-decision"
                      type="button"
                      aria-pressed={isCreatingPrimary}
                      disabled={saving}
                      onClick={() => {
                        setPrimaryId('');
                        setFirstActionId('');
                        setIsCreatingPrimary(true);
                        setPrimaryChooserOpen(true);
                      }}
                    >
                      <span aria-hidden="true">+</span> Новое решение
                    </button>
                  </div>
                ) : null}
                {isCreatingPrimary ? (
                  <div className="tomorrow-inline-editor">
                    <VoiceField>
                      <span>Решение</span>
                      <VoiceTextInput
                        value={newPrimaryTitle}
                        disabled={saving}
                        onValueChange={(value) => setNewPrimaryTitle(value)}
                        placeholder="Что важно завершить?"
                      />
                    </VoiceField>
                    <VoiceField>
                      <span>Ожидаемый результат</span>
                      <VoiceTextArea
                        rows={2}
                        value={newPrimaryResult}
                        disabled={saving}
                        onValueChange={(value) => setNewPrimaryResult(value)}
                      />
                    </VoiceField>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showBlock('outcomes') ? (
              <section
                className="tomorrow-outcomes"
                aria-label="Граница результата"
                data-disabled={workingForm.followingBlocksDisabled ? 'true' : 'false'}
              >
                <div className="tomorrow-working-section-heading">
                  <span className="tomorrow-working-section-index" aria-hidden="true">
                    2
                  </span>
                  <p>Граница результата</p>
                </div>
                <div
                  className="tomorrow-outcome-levels"
                  role="radiogroup"
                  aria-label="Граница результата"
                >
                  {outcomeLevels.map((level) => (
                    <button
                      className={level === selectedOutcomeLevel ? 'is-selected' : undefined}
                      type="button"
                      role="radio"
                      aria-checked={level === selectedOutcomeLevel}
                      disabled={saving || workingForm.followingBlocksDisabled}
                      key={level}
                      onClick={() => setSelectedOutcomeLevel(level)}
                    >
                      <span aria-hidden="true" />
                      {outcomeLevelLabel(level, isQuick)}
                    </button>
                  ))}
                </div>
                <VoiceField className="tomorrow-active-outcome-field">
                  <span className="sr-only">
                    Граница результата — {workingForm.activeOutcome.label}
                  </span>
                  <VoiceTextArea
                    rows={1}
                    aria-label={`Граница результата — ${workingForm.activeOutcome.label}`}
                    value={workingForm.activeOutcome.value}
                    disabled={saving || workingForm.followingBlocksDisabled}
                    onValueChange={(value) => {
                      if (selectedOutcomeLevel === 'minimum') setMinimum(value);
                      else if (selectedOutcomeLevel === 'target') setTarget(value);
                      else setStretch(value);
                    }}
                    placeholder={outcomeLevelPlaceholder(selectedOutcomeLevel)}
                  />
                </VoiceField>
              </section>
            ) : null}

            {showBlock('first-action') ? (
              <section
                ref={firstActionSectionRef}
                className="tomorrow-first-action-card"
                aria-label="Первый шаг"
                data-disabled={workingForm.followingBlocksDisabled ? 'true' : 'false'}
              >
                <div className="tomorrow-working-section-heading">
                  <span className="tomorrow-working-section-index" aria-hidden="true">
                    3
                  </span>
                  <p>Первый шаг</p>
                </div>
                {actionCandidates.length > 0 ? (
                  <label className="tomorrow-compact-select">
                    <span>Существующее Действие</span>
                    <select
                      value={firstActionId}
                      disabled={saving || primaryId.length === 0}
                      onChange={(event) => setFirstActionId(event.target.value)}
                    >
                      <option value="">Создать новый первый шаг</option>
                      {actionCandidates.map((action) => (
                        <option key={action.id.toString()} value={action.id.toString()}>
                          {action.title.toString()}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {firstActionId.length === 0 ? (
                  <div className="tomorrow-inline-editor tomorrow-action-editor">
                    <VoiceField className="tomorrow-action-main-field">
                      <span>Конкретное первое действие</span>
                      <VoiceTextInput
                        value={newActionTitle}
                        disabled={saving || !primaryReady}
                        onValueChange={(value) => setNewActionTitle(value)}
                        placeholder="Конкретное действие для старта завтра"
                      />
                    </VoiceField>
                    <VoiceField className="tomorrow-action-result-field">
                      <span>Ожидаемый результат</span>
                      <VoiceTextArea
                        rows={1}
                        value={newActionResult}
                        disabled={saving || !primaryReady}
                        onValueChange={(value) => setNewActionResult(value)}
                        placeholder="Что должно измениться после первого шага?"
                      />
                    </VoiceField>
                  </div>
                ) : (
                  <div className="tomorrow-first-action-selected">
                    <strong>{selectedFirstAction?.title.toString()}</strong>
                    {selectedFirstAction?.expectedResult === null ||
                    selectedFirstAction?.expectedResult === undefined ? null : (
                      <span>{selectedFirstAction.expectedResult.toString()}</span>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {!isQuick && showBlock('supporting') ? (
              <section
                className="tomorrow-supporting"
                aria-label="Дополнительные решения"
                data-disabled={workingForm.followingBlocksDisabled ? 'true' : 'false'}
              >
                <div className="tomorrow-working-section-heading">
                  <span className="tomorrow-working-section-index" aria-hidden="true">
                    4
                  </span>
                  <p>Дополнительные решения</p>
                </div>
                <div className="tomorrow-supporting-list">
                  {supportingIds.slice(0, 2).map((id) => {
                    const decision = decisions.find((candidate) => candidate.id.toString() === id);
                    return decision === undefined ? null : (
                      <div className="tomorrow-supporting-row" key={id}>
                        <strong>{decision.title.toString()}</strong>
                        <button
                          className="text-button"
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setSupportingIds(supportingIds.filter((item) => item !== id));
                            setCreatingSupportingSlots([false, false]);
                          }}
                        >
                          Убрать
                        </button>
                      </div>
                    );
                  })}
                  {[0, 1].map((index) => {
                    const title = index === 0 ? newSupportingTitle1 : newSupportingTitle2;
                    const setTitle = index === 0 ? setNewSupportingTitle1 : setNewSupportingTitle2;
                    const isCreating = creatingSupportingSlots[index] === true;
                    return isCreating ? (
                      <div className="tomorrow-supporting-row is-empty" key={`draft-${index}`}>
                        <VoiceTextInput
                          aria-label={
                            index === 0
                              ? 'Новое дополнительное решение'
                              : 'Второе дополнительное решение'
                          }
                          value={title}
                          disabled={saving || workingForm.followingBlocksDisabled}
                          onValueChange={(value) => setTitle(value)}
                          placeholder="Название решения"
                        />
                        <button
                          className="text-button"
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setTitle('');
                            setCreatingSupportingSlots(
                              index === 0
                                ? [false, creatingSupportingSlots[1]]
                                : [creatingSupportingSlots[0], false],
                            );
                          }}
                        >
                          Убрать
                        </button>
                      </div>
                    ) : null;
                  })}
                  {supportingCapacityUsed >= 2 || hasOpenSupportingDraft ? null : (
                    <div className="tomorrow-supporting-add">
                      {availableSupportingDecisions.length === 0 ? null : (
                        <select
                          aria-label="Добавить существующее решение"
                          value=""
                          disabled={saving || workingForm.followingBlocksDisabled}
                          onChange={(event) => {
                            if (event.target.value.length === 0) return;
                            setSupportingIds([...supportingIds, event.target.value]);
                          }}
                        >
                          <option value="">Выбрать существующее</option>
                          {availableSupportingDecisions.map((decision) => (
                            <option key={decision.id.toString()} value={decision.id.toString()}>
                              {decision.title.toString()}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="text-button tomorrow-supporting-add-button"
                        type="button"
                        disabled={saving || workingForm.followingBlocksDisabled}
                        onClick={() => {
                          setCreatingSupportingSlots(
                            !creatingSupportingSlots[0]
                              ? [true, creatingSupportingSlots[1]]
                              : [creatingSupportingSlots[0], true],
                          );
                        }}
                      >
                        <span aria-hidden="true">+</span> Добавить решение
                      </button>
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {snapshot.scopeTooLargeWarning && !isCompleted ? (
              <aside className="tomorrow-guidance" aria-label="Вывод на завтра">
                <span className="tomorrow-context-symbol" aria-hidden="true">
                  <EveningVisualIcon name="lightbulb" size={20} />
                </span>
                <div>
                  <p className="section-kicker">Контекстный вывод</p>
                  <strong>Сегодня объём главного Решения оказался слишком большим.</strong>
                  <span>Значения сохранены без автоматических изменений.</span>
                </div>
              </aside>
            ) : null}

            {snapshot.overloaded && !isCompleted ? (
              <aside className="tomorrow-overload-note" role="status">
                <span className="tomorrow-context-symbol" aria-hidden="true">
                  <EveningVisualIcon name="carry" size={20} />
                </span>
                <div className="tomorrow-overload-copy">
                  <p className="section-kicker gold">Завтра уже насыщенно</p>
                  <strong>
                    {snapshot.targetDecisionCount} Решений · {snapshot.targetLifeActionCount}{' '}
                    Действий
                  </strong>
                  <span>Проверьте объём прежде, чем добавлять новое.</span>
                </div>
                <div className="tomorrow-overload-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setContinueOverloaded(false);
                      primarySectionRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }}
                  >
                    Пересмотреть
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    aria-pressed={continueOverloaded}
                    onClick={() => setContinueOverloaded(true)}
                  >
                    Оставить как есть
                  </button>
                </div>
              </aside>
            ) : null}

            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <footer className="tomorrow-scene-footer">
          {isCompleted ? (
            <button className="text-button" type="button" onClick={() => setEditingBlock(null)}>
              Отмена
            </button>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={saving || !workingForm.continueReady}
          >
            <span>
              {saving ? 'Сохраняем…' : isCompleted ? 'Сохранить изменения' : 'Продолжить →'}
            </span>
          </button>
        </footer>
      </form>
    </ComposerFrame>
  );
}

export function TomorrowCompleteSummary({
  snapshot,
  isQuick,
  onEdit,
  onContinue,
  actionLabel,
  historyView = false,
}: {
  readonly snapshot: TomorrowPlanSnapshot;
  readonly isQuick: boolean;
  readonly onEdit: (block: EditableBlock) => void;
  readonly onContinue: () => void;
  readonly actionLabel: string;
  readonly historyView?: boolean;
}) {
  if (!historyView) {
    const selectedOutcome = savedOutcome(snapshot, isQuick);
    const primaryMetadata = uniqueNonEmpty([
      snapshot.primaryDecision?.projectReference,
      snapshot.plan.vector,
    ]).join(' · ');

    return (
      <section
        className="tomorrow-complete-summary tomorrow-saved-summary is-current"
        aria-labelledby="tomorrow-complete-title"
        data-plan-state="completed"
      >
        <header className="tomorrow-saved-heading">
          <span className="tomorrow-saved-status-icon" aria-hidden="true">
            <EveningVisualIcon name="check" size={24} />
          </span>
          <div>
            <h3 id="tomorrow-complete-title">Завтра подготовлено</h3>
            <p>У вас есть главное, граница результата и конкретный первый шаг.</p>
          </div>
        </header>

        <div className="tomorrow-saved-content">
          <section className="tomorrow-saved-row" aria-labelledby="tomorrow-summary-primary">
            <span className="tomorrow-saved-row-icon" aria-hidden="true">
              <EveningVisualIcon name="target" size={20} />
            </span>
            <div>
              <p className="tomorrow-saved-label" id="tomorrow-summary-primary">
                Главное решение
              </p>
              <strong>
                {snapshot.primaryDecision?.title.toString() ?? 'Главное решение не определено'}
              </strong>
              {primaryMetadata.length === 0 ? null : (
                <p className="tomorrow-saved-meta">{primaryMetadata}</p>
              )}
            </div>
          </section>

          <section className="tomorrow-saved-row" aria-labelledby="tomorrow-summary-outcome">
            <span className="tomorrow-saved-row-icon" aria-hidden="true">
              <EveningVisualIcon name="choice" size={20} />
            </span>
            <div>
              <p className="tomorrow-saved-label" id="tomorrow-summary-outcome">
                Граница результата
              </p>
              <p className="tomorrow-saved-outcome-level">
                <span aria-hidden="true" />
                <strong>{selectedOutcome.label}</strong>
              </p>
              <p className="tomorrow-saved-outcome-value">{selectedOutcome.value}</p>
            </div>
          </section>

          <section className="tomorrow-saved-row" aria-labelledby="tomorrow-summary-first-step">
            <span className="tomorrow-saved-row-icon" aria-hidden="true">
              <EveningVisualIcon name="arrow-right" size={20} />
            </span>
            <div>
              <p className="tomorrow-saved-label" id="tomorrow-summary-first-step">
                Первый шаг
              </p>
              <strong>{snapshot.firstAction?.title.toString() ?? 'Первый шаг не определён'}</strong>
            </div>
          </section>

          {isQuick || snapshot.supportingDecisions.length === 0 ? null : (
            <section
              className="tomorrow-saved-additional"
              aria-labelledby="tomorrow-summary-supporting"
            >
              <p className="tomorrow-saved-label" id="tomorrow-summary-supporting">
                Дополнительно
              </p>
              <ul>
                {snapshot.supportingDecisions.slice(0, 2).map((decision) => (
                  <li key={decision.id.toString()}>{decision.title.toString()}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="tomorrow-saved-actions">
          <button className="secondary-button" type="button" onClick={() => onEdit('all')}>
            <EveningVisualIcon name="pencil" size={15} />
            Изменить план
          </button>
          <button className="primary-button" type="button" onClick={onContinue}>
            {actionLabel}
          </button>
        </footer>
      </section>
    );
  }

  const primaryIsCarried =
    snapshot.primaryDecision !== null &&
    snapshot.carriedDecisionCandidate?.id.equals(snapshot.primaryDecision.id) === true;

  return (
    <section
      className={`tomorrow-complete-summary${historyView === true ? ' is-history' : ' is-current'}`}
      aria-labelledby="tomorrow-complete-title"
      data-plan-state="completed"
    >
      <header className="tomorrow-complete-heading">
        <span className="tomorrow-complete-status-icon" aria-hidden="true">
          <EveningVisualIcon name="check" size={24} />
        </span>
        <div>
          <p className="section-kicker green">
            Завтра определено · {formatTomorrowDate(snapshot.plan.targetDateKey)}
          </p>
          <h3 id="tomorrow-complete-title">Архитектура дня сохранена</h3>
        </div>
      </header>

      {snapshot.plan.vector?.trim() ? (
        <section className="tomorrow-complete-vector" aria-label="Вектор дня">
          <span className="tomorrow-context-symbol" aria-hidden="true">
            <EveningVisualIcon name="spark" size={18} />
          </span>
          <p>
            <span>Вектор дня</span>
            <strong>{snapshot.plan.vector}</strong>
          </p>
        </section>
      ) : null}

      <div className="tomorrow-complete-plan">
        <section className="tomorrow-complete-primary" aria-labelledby="tomorrow-summary-primary">
          <span className="tomorrow-primary-symbol" aria-hidden="true">
            <EveningVisualIcon name="target" size={30} />
          </span>
          <div className="tomorrow-complete-primary-copy">
            <h4 id="tomorrow-summary-primary">Главное Решение</h4>
            <strong>
              {snapshot.primaryDecision?.title.toString() ?? 'Главное Решение не определено'}
            </strong>
            <div className="tomorrow-primary-meta">
              {snapshot.primaryDecision?.projectReference === null ||
              snapshot.primaryDecision?.projectReference === undefined ? null : (
                <span>{snapshot.primaryDecision.projectReference}</span>
              )}
              {primaryIsCarried ? (
                <span className="is-carried">
                  <EveningVisualIcon name="carry" size={13} />
                  Перенесено с сегодня
                </span>
              ) : null}
            </div>
            {snapshot.primaryDecision?.expectedResult === null ||
            snapshot.primaryDecision?.expectedResult === undefined ? null : (
              <p className="tomorrow-primary-context">
                <span>Ожидаемый результат</span>
                {snapshot.primaryDecision.expectedResult.toString()}
              </p>
            )}
          </div>
          <button type="button" className="secondary-button" onClick={() => onEdit('primary')}>
            <EveningVisualIcon name="pencil" size={14} />
            Изменить
          </button>
        </section>

        <section className="tomorrow-complete-outcomes" aria-labelledby="tomorrow-summary-outcomes">
          <div className="tomorrow-scene-section-heading">
            <span className="tomorrow-section-symbol" aria-hidden="true">
              <EveningVisualIcon name="choice" size={19} />
            </span>
            <div>
              <p className="section-kicker">Границы результата</p>
              <h4 id="tomorrow-summary-outcomes">Что будет означать хороший день</h4>
            </div>
          </div>
          <div className={`tomorrow-outcome-boundaries is-readonly${isQuick ? ' is-quick' : ''}`}>
            {isQuick ? null : (
              <ReadonlyOutcomeSegment
                kind="target"
                label="Норма"
                value={snapshot.plan.targetOutcome}
                icon="target"
              />
            )}
            <ReadonlyOutcomeSegment
              kind="minimum"
              label={isQuick ? 'Минимальный результат' : 'Минимум'}
              value={snapshot.plan.minimumOutcome}
              icon="list"
            />
            {isQuick ? null : (
              <ReadonlyOutcomeSegment
                kind="stretch"
                label="Максимум"
                value={snapshot.plan.stretchOutcome}
                icon="spark"
                hint="Если останется ресурс"
              />
            )}
          </div>
        </section>

        <div className="tomorrow-complete-lower-grid">
          <section
            className="tomorrow-complete-first"
            aria-labelledby="tomorrow-summary-first-step"
          >
            <span className="tomorrow-primary-symbol" aria-hidden="true">
              <EveningVisualIcon name="arrow-right" size={24} />
            </span>
            <div className="tomorrow-complete-first-copy">
              <h4 id="tomorrow-summary-first-step">Первый шаг</h4>
              <strong>{snapshot.firstAction?.title.toString() ?? 'Первый шаг не определён'}</strong>
              {snapshot.firstAction?.expectedResult === null ||
              snapshot.firstAction?.expectedResult === undefined ? null : (
                <p>{snapshot.firstAction.expectedResult.toString()}</p>
              )}
            </div>
          </section>
          {isQuick ? null : (
            <section
              className="tomorrow-complete-supporting"
              aria-labelledby="tomorrow-summary-supporting"
            >
              <p className="section-kicker" id="tomorrow-summary-supporting">
                Дополнительно
              </p>
              {snapshot.supportingDecisions.length === 0 ? (
                <p className="tomorrow-complete-supporting-empty">
                  Дополнительные Решения не добавлены
                </p>
              ) : (
                <ul>
                  {snapshot.supportingDecisions.slice(0, 2).map((decision, index) => (
                    <li key={decision.id.toString()}>
                      <span>{String(index + 2).padStart(2, '0')}</span>
                      <strong>{decision.title.toString()}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {snapshot.scopeTooLargeWarning || snapshot.overloaded ? (
          <aside className="tomorrow-complete-context" aria-label="Контекстный вывод">
            <span className="tomorrow-context-symbol" aria-hidden="true">
              <EveningVisualIcon name="lightbulb" size={18} />
            </span>
            <div>
              <p className="section-kicker">Контекстный вывод</p>
              {snapshot.scopeTooLargeWarning ? (
                <strong>Сегодня объём главного Решения оказался слишком большим.</strong>
              ) : (
                <strong>Завтра уже насыщенно.</strong>
              )}
              {snapshot.overloaded ? (
                <span>
                  {snapshot.targetDecisionCount} Решений · {snapshot.targetLifeActionCount} Действий
                </span>
              ) : null}
            </div>
          </aside>
        ) : null}

        <footer className="tomorrow-complete-actions">
          <button className="secondary-button" type="button" onClick={() => onEdit('all')}>
            <EveningVisualIcon name="pencil" size={15} />
            Изменить план
          </button>
          <button
            className={historyView === true ? 'secondary-button is-ghost' : 'primary-button'}
            type="button"
            onClick={onContinue}
          >
            {actionLabel}
          </button>
        </footer>
      </div>
    </section>
  );
}

function savedOutcome(
  snapshot: TomorrowPlanSnapshot,
  isQuick: boolean,
): { readonly label: string; readonly value: string } {
  if (!isQuick && snapshot.plan.targetOutcome?.trim()) {
    return { label: 'Норма', value: snapshot.plan.targetOutcome };
  }
  return {
    label: isQuick ? 'Минимальный результат' : 'Минимум',
    value: snapshot.plan.minimumOutcome ?? 'Граница результата не определена',
  };
}

function uniqueNonEmpty(values: readonly (string | null | undefined)[]): readonly string[] {
  return [...new Set(values.flatMap((value) => (value?.trim() ? [value.trim()] : [])))];
}

function outcomeLevelLabel(level: TomorrowOutcomeLevel, isQuick: boolean): string {
  if (level === 'minimum') return isQuick ? 'Минимальный результат' : 'Минимум';
  if (level === 'target') return 'Норма';
  return 'Максимум';
}

function outcomeLevelPlaceholder(level: TomorrowOutcomeLevel): string {
  if (level === 'minimum') return 'Какой результат уже будет достаточным?';
  if (level === 'target') return 'Как выглядит нормальный результат?';
  return 'Что возможно, если останется ресурс?';
}

function ReadonlyOutcomeSegment({
  kind,
  label,
  value,
  icon,
  hint,
}: {
  readonly kind: 'minimum' | 'target' | 'stretch';
  readonly label: string;
  readonly value: string | null;
  readonly icon: 'list' | 'target' | 'spark';
  readonly hint?: string;
}) {
  return (
    <article className={`tomorrow-outcome-segment is-${kind}`}>
      <span className="tomorrow-outcome-label">
        <span>
          <EveningVisualIcon name={icon} size={16} />
          {label}
        </span>
        {hint === undefined ? null : <small>{hint}</small>}
      </span>
      <p className={value === null ? 'is-empty' : undefined}>{value ?? 'Не задано'}</p>
    </article>
  );
}

function ComposerFrame({
  onClose,
  children,
  embedded,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly embedded: boolean;
}) {
  if (embedded) {
    return <div className="evening-command-center-scene-content">{children}</div>;
  }
  return (
    <div className="details-backdrop evening-review-backdrop" role="presentation">
      <section
        className="details-panel evening-review-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tomorrow-composer-title"
      >
        <header className="details-panel-header">
          <div>
            <p className="section-kicker gold">Завтра</p>
            <h2 id="tomorrow-composer-title">Архитектура следующего дня</h2>
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

function sortDecisionCandidates(snapshot: TomorrowPlanSnapshot | null): readonly Decision[] {
  if (snapshot === null) return [];
  const carriedId = snapshot.carriedDecisionCandidate?.id.toString();
  return [...snapshot.targetDecisions].sort((left, right) => {
    if (left.id.toString() === carriedId) return -1;
    if (right.id.toString() === carriedId) return 1;
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

function formatTomorrowDate(date: DayDate): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date.toString()}T12:00:00`));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить план завтра.';
}
