import { useEffect, useRef, useState } from 'react';
import type {
  CancelDecisionSafely,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteCurrentDay,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  CreateLifeActionForDecision,
  CreateRoutineBlock,
  DeleteRoutineBlock,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionOverview,
  GetDecisionsForDate,
  GetEveningReview,
  GetLifeActionsForDecision,
  GetRoutineActionDetails,
  GetRoutineActionOptions,
  GetRoutineBlocksForDate,
  GetUnfinishedActionSession,
  PauseActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  RoutineActionDetails,
  RoutineActionOption,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
  UpdateRoutineBlock,
  DelayRoutineOccurrence,
  SkipRoutineOccurrence,
  RescheduleRoutineOccurrence,
  ShortenRoutineOccurrence,
  ReplaceRoutineOccurrenceAction,
  ClearRoutineOccurrenceOverride,
  GetRoutinePlanFactForDate,
  GetRunningRoutineOccurrence,
  GetSpheres,
  GetProjects,
  RunningRoutineOccurrence,
  StartRoutineOccurrence,
  CompleteRoutineOccurrence,
  AbandonRoutineOccurrence,
  RoutinePlanFactPresentation,
  ResolveOpenLoop,
  ReflectionApplicationService,
  TomorrowPlanService,
  PreparationService,
  EveningCycleApplicationService,
} from '../../application';
import {
  DECISION_STATUS,
  DayDate,
  EntityId,
  EVENING_CYCLE_STATE,
  LIFE_ACTION_STATUS,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  ROUTINE_EXECUTION_STATUS,
  type Day,
  type Decision,
  type LifeAction,
  type RoutineBlock,
  type RoutineBlockAssignmentKind,
  type EffectiveRoutineOccurrence,
  type EveningCycleState,
  type RoutineOccurrenceOverrideType,
} from '../../domain';
import { DecisionDetailsController } from '../components/DecisionDetailsController';
import { LifeActionDetailsController } from '../components/LifeActionDetailsController';
import { SectionDateNavigator } from '../components/SectionDateNavigator';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { RoutineBlockForm } from '../routine/RoutineBlockForm';
import {
  deviationLabel,
  deviationTitle,
  formatOccurrenceDate,
} from '../routine/RoutineDeviationPresentation';
import {
  ROUTINE_ASSIGNMENT_LABELS,
  ROUTINE_CATEGORY_LABELS,
  ROUTINE_RECURRENCE_LABELS,
} from '../routine/RoutineBlockLabels';
import {
  createEmptyRoutineBlockForm,
  createRoutineBlockEditForm,
  hasRoutineBlockFormErrors,
  validateRoutineBlockForm,
  type RoutineBlockFormErrors,
  type RoutineBlockFormState,
} from '../routine/RoutineBlockFormState';
import { RoutineSubmissionGuard } from '../routine/RoutineSubmissionGuard';
import { openRoutineAssignmentSection } from '../routine/RoutineAssignmentNavigation';
import { findRoutineBlockOverlaps } from '../routine/RoutineBlockOverlaps';
import {
  eveningBlockStatus,
  eveningBlockStatusLabel,
  type EveningBlockStatus,
} from '../routine/RoutineEveningPresentation';
import { ROUTINE_SECTION, type RoutineSection } from '../routine/RoutineNavigation';
import { EveningReviewPanel } from './EveningReviewPanel';
import { useSpheres } from '../components/sphereReferenceModel';
import { useProjects } from '../management/projectReferenceModel';

const EMPTY_GET_SPHERES: Pick<GetSpheres, 'execute'> = {
  execute: async () => ({ active: [], archived: [] }),
};

interface RoutinePageProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly onDateChange: (date: DayDate) => void;
  readonly activeSection?: RoutineSection;
  readonly onSectionChange?: (section: RoutineSection) => void;
  readonly onCurrentDayChange?: (day: Day) => void;
  readonly createRoutineBlock: CreateRoutineBlock;
  readonly updateRoutineBlock: UpdateRoutineBlock;
  readonly deleteRoutineBlock: DeleteRoutineBlock;
  readonly getRoutineBlocksForDate: GetRoutineBlocksForDate;
  readonly delayRoutineOccurrence?: DelayRoutineOccurrence;
  readonly skipRoutineOccurrence?: SkipRoutineOccurrence;
  readonly rescheduleRoutineOccurrence?: RescheduleRoutineOccurrence;
  readonly shortenRoutineOccurrence?: ShortenRoutineOccurrence;
  readonly replaceRoutineOccurrenceAction?: ReplaceRoutineOccurrenceAction;
  readonly clearRoutineOccurrenceOverride?: ClearRoutineOccurrenceOverride;
  readonly getRoutinePlanFactForDate?: GetRoutinePlanFactForDate;
  readonly getRunningRoutineOccurrence?: Pick<GetRunningRoutineOccurrence, 'execute'>;
  readonly startRoutineOccurrence?: StartRoutineOccurrence;
  readonly completeRoutineOccurrence?: CompleteRoutineOccurrence;
  readonly abandonRoutineOccurrence?: AbandonRoutineOccurrence;
  readonly onOpenWalks?: () => void;
  readonly workflow?: RoutinePageWorkflowServices;
}

export interface RoutinePageWorkflowServices {
  readonly getRoutineActionOptions: GetRoutineActionOptions;
  readonly getRoutineActionDetails: GetRoutineActionDetails;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
  readonly getEveningReview: Pick<GetEveningReview, 'execute'>;
  readonly completeCurrentDay: Pick<CompleteCurrentDay, 'execute'>;
  readonly eveningCycle?: Pick<
    EveningCycleApplicationService,
    'get' | 'start' | 'selectMode' | 'skipPreparation'
  >;
  readonly resolveOpenLoop?: Pick<ResolveOpenLoop, 'execute'>;
  readonly reflection?: Pick<
    ReflectionApplicationService,
    'getSession' | 'answer' | 'skip' | 'createCorrection'
  >;
  readonly tomorrowPlan?: Pick<
    TomorrowPlanService,
    | 'getByTargetDate'
    | 'getOrCreate'
    | 'setVector'
    | 'assignPrimaryDecision'
    | 'createPrimaryDecision'
    | 'setOutcomes'
    | 'setFirstAttentionItem'
    | 'assignFirstAction'
    | 'createFirstAction'
    | 'setSupportingDecisions'
    | 'createSupportingDecision'
    | 'complete'
  >;
  readonly preparation?: Pick<
    PreparationService,
    'getOrGenerate' | 'completeItem' | 'skipItem' | 'continueToShutdown'
  >;
  readonly getSpheres?: Pick<GetSpheres, 'execute'>;
  readonly getProjects?: Pick<GetProjects, 'execute'>;
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
  readonly onOpenProject?: (projectId: string) => void;
}

interface PendingActionLink {
  readonly block: RoutineBlock;
  readonly lifeAction: LifeAction;
}

type RunningRoutineState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly item: RunningRoutineOccurrence | null }
  | { readonly status: 'error'; readonly message: string };

export function RoutinePage(props: RoutinePageProps) {
  const spheres = useSpheres(props.workflow?.getSpheres ?? EMPTY_GET_SPHERES);
  const projects = useProjects(props.workflow?.getProjects);
  const workflow = props.workflow;
  const [localSection, setLocalSection] = useState<RoutineSection>(ROUTINE_SECTION.day);
  const activeSection = props.activeSection ?? localSection;
  const [blocks, setBlocks] = useState<readonly EffectiveRoutineOccurrence[]>([]);
  const [planFacts, setPlanFacts] = useState<ReadonlyMap<string, RoutinePlanFactPresentation>>(
    new Map(),
  );
  const [actionOptions, setActionOptions] = useState<readonly RoutineActionOption[]>([]);
  const [actionDetails, setActionDetails] = useState<
    ReadonlyMap<string, RoutineActionDetails | null>
  >(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<RoutineBlockFormState | null>(null);
  const [editing, setEditing] = useState<RoutineBlock | null>(null);
  const [errors, setErrors] = useState<RoutineBlockFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoutineBlock | null>(null);
  const [reminderBlock, setReminderBlock] = useState<RoutineBlock | null>(null);
  const [selectedAction, setSelectedAction] = useState<LifeAction | null>(null);
  const [eveningReviewDate, setEveningReviewDate] = useState<DayDate | null>(null);
  const [eveningCycleState, setEveningCycleState] = useState<EveningCycleState | null>(null);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isFinishingExecution, setIsFinishingExecution] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState<RunningRoutineState>(
    props.getRunningRoutineOccurrence === undefined
      ? { status: 'ready', item: null }
      : { status: 'loading' },
  );
  const [createTarget, setCreateTarget] = useState<RoutineBlock | null>(null);
  const [creationDecisions, setCreationDecisions] = useState<readonly Decision[]>([]);
  const [creationDecision, setCreationDecision] = useState<Decision | null>(null);
  const [pendingLink, setPendingLink] = useState<PendingActionLink | null>(null);
  const [deviationTarget, setDeviationTarget] = useState<EffectiveRoutineOccurrence | null>(null);
  const [deviationType, setDeviationType] = useState<RoutineOccurrenceOverrideType | null>(null);
  const [deviationTime, setDeviationTime] = useState('');
  const [deviationDate, setDeviationDate] = useState('');
  const [replacementActionId, setReplacementActionId] = useState('');
  const [deviationError, setDeviationError] = useState<string | null>(null);
  const savingGuard = useRef(new RoutineSubmissionGuard());
  const activationGuard = useRef(new RoutineSubmissionGuard());

  useEffect(() => {
    let active = true;
    void Promise.all([
      props.getRoutineBlocksForDate.execute(props.selectedDate),
      workflow?.getRoutineActionOptions.execute() ?? Promise.resolve([]),
      props.getRoutinePlanFactForDate?.execute(props.selectedDate) ?? Promise.resolve([]),
    ]).then(
      async ([nextBlocks, nextOptions, nextPlanFacts]) => {
        const nextDetails =
          workflow === undefined
            ? new Map<string, RoutineActionDetails | null>()
            : await resolveActionDetails(nextBlocks, workflow.getRoutineActionDetails);
        if (!active) return;
        setBlocks(nextBlocks);
        setPlanFacts(new Map(nextPlanFacts.map((item) => [planFactKey(item.occurrence), item])));
        setActionOptions(nextOptions);
        setActionDetails(nextDetails);
        setLoadError(null);
      },
      () => {
        if (active) setLoadError('Не удалось загрузить распорядок.');
      },
    );
    return () => {
      active = false;
    };
  }, [
    workflow,
    props.getRoutineBlocksForDate,
    props.getRoutinePlanFactForDate,
    props.selectedDate,
  ]);

  useEffect(() => {
    let active = true;
    if (props.getRunningRoutineOccurrence === undefined) {
      return () => {
        active = false;
      };
    }
    void props.getRunningRoutineOccurrence.execute().then(
      (item) => {
        if (active) setRunningRoutine({ status: 'ready', item });
      },
      (error: unknown) => {
        if (active) {
          setRunningRoutine({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Не удалось восстановить выполняющийся блок.',
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [props.getRunningRoutineOccurrence]);

  useEffect(() => {
    let active = true;
    const cycles = workflow?.eveningCycle;
    if (cycles === undefined) {
      return () => {
        active = false;
      };
    }

    void cycles.get(props.selectedDate).then(
      (cycle) => {
        if (active) setEveningCycleState(cycle?.state ?? null);
      },
      () => {
        if (active) setEveningCycleState(null);
      },
    );
    return () => {
      active = false;
    };
  }, [props.selectedDate, workflow?.eveningCycle]);

  function selectSection(section: RoutineSection): void {
    if (props.onSectionChange === undefined) setLocalSection(section);
    props.onSectionChange?.(section);
  }

  function closeEveningCenter(): void {
    setEveningReviewDate(null);
    if (activeSection === ROUTINE_SECTION.evening) selectSection(ROUTINE_SECTION.day);
    void workflow?.eveningCycle?.get(props.selectedDate).then(
      (cycle) => {
        setEveningCycleState(cycle?.state ?? null);
      },
      () => undefined,
    );
  }

  async function reload(): Promise<void> {
    const [nextBlocks, nextOptions] = await Promise.all([
      props.getRoutineBlocksForDate.execute(props.selectedDate),
      workflow?.getRoutineActionOptions.execute() ?? Promise.resolve([]),
    ]);
    const nextPlanFacts =
      (await props.getRoutinePlanFactForDate?.execute(props.selectedDate)) ?? [];
    setBlocks(nextBlocks);
    setPlanFacts(new Map(nextPlanFacts.map((item) => [planFactKey(item.occurrence), item])));
    setActionOptions(nextOptions);
    setActionDetails(
      workflow === undefined
        ? new Map()
        : await resolveActionDetails(nextBlocks, workflow.getRoutineActionDetails),
    );
    setLoadError(null);
  }

  async function reloadRunningRoutine(): Promise<void> {
    if (props.getRunningRoutineOccurrence === undefined) {
      setRunningRoutine({ status: 'ready', item: null });
      return;
    }
    try {
      const item = await props.getRunningRoutineOccurrence.execute();
      setRunningRoutine({ status: 'ready', item });
    } catch (error: unknown) {
      setRunningRoutine({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Не удалось восстановить выполняющийся блок.',
      });
    }
  }

  function openCreate(): void {
    setEditing(null);
    setForm(createEmptyRoutineBlockForm(props.selectedDate));
    setErrors({});
    setSubmitError(null);
  }

  function openEdit(block: RoutineBlock): void {
    setEditing(block);
    setForm(createRoutineBlockEditForm(block));
    setErrors({});
    setSubmitError(null);
  }

  function openDeviation(occurrence: EffectiveRoutineOccurrence): void {
    setDeviationTarget(occurrence);
    setDeviationType(null);
    setDeviationTime(occurrence.effectiveStartTime);
    setDeviationDate(props.selectedDate.toString());
    setReplacementActionId('');
    setDeviationError(null);
  }

  function chooseDeviation(type: RoutineOccurrenceOverrideType): void {
    if (deviationTarget === null) return;
    setDeviationType(type);
    setDeviationError(null);
    if (type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed) {
      setDeviationTime(deviationTarget.originalStartTime);
    } else if (type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened) {
      setDeviationTime(deviationTarget.originalEndTime);
    } else if (type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled) {
      setDeviationTime(deviationTarget.originalStartTime);
      setDeviationDate(props.selectedDate.toString());
    }
  }

  async function saveDeviation(): Promise<void> {
    if (deviationTarget === null || deviationType === null || !savingGuard.current.tryAcquire())
      return;
    setIsSaving(true);
    setDeviationError(null);
    if (
      props.delayRoutineOccurrence === undefined ||
      props.skipRoutineOccurrence === undefined ||
      props.rescheduleRoutineOccurrence === undefined ||
      props.shortenRoutineOccurrence === undefined ||
      props.replaceRoutineOccurrenceAction === undefined
    ) {
      savingGuard.current.release();
      setIsSaving(false);
      setDeviationError('Изменение плана недоступно.');
      return;
    }
    const base = {
      routineBlockId: deviationTarget.sourceBlockId,
      occurrenceDate: deviationTarget.occurrenceDate,
      ...(deviationTarget.override === null
        ? {}
        : { expectedVersion: deviationTarget.override.version }),
    };
    try {
      const result =
        deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed
          ? await props.delayRoutineOccurrence.execute({ ...base, newStartTime: deviationTime })
          : deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped
            ? await props.skipRoutineOccurrence.execute(base)
            : deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled
              ? await props.rescheduleRoutineOccurrence.execute({
                  ...base,
                  targetDate: DayDate.create(deviationDate),
                  targetStartTime: deviationTime,
                })
              : deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened
                ? await props.shortenRoutineOccurrence.execute({
                    ...base,
                    newEndTime: deviationTime,
                  })
                : await props.replaceRoutineOccurrenceAction.execute({
                    ...base,
                    replacementActionId: EntityId.create(replacementActionId),
                  });
      if (!result.ok) {
        setDeviationError(result.error.message);
        return;
      }
      setDeviationTarget(null);
      setDeviationType(null);
      await reload();
    } catch (error: unknown) {
      setDeviationError(error instanceof Error ? error.message : 'Не удалось изменить план.');
    } finally {
      savingGuard.current.release();
      setIsSaving(false);
    }
  }

  async function clearDeviation(): Promise<void> {
    if (
      deviationTarget?.override === null ||
      deviationTarget === null ||
      props.clearRoutineOccurrenceOverride === undefined ||
      !savingGuard.current.tryAcquire()
    )
      return;
    setIsSaving(true);
    const result = await props.clearRoutineOccurrenceOverride.execute({
      routineBlockId: deviationTarget.sourceBlockId,
      occurrenceDate: deviationTarget.occurrenceDate,
      expectedVersion: deviationTarget.override.version,
    });
    savingGuard.current.release();
    setIsSaving(false);
    if (!result.ok) {
      setDeviationError(result.error.message);
      return;
    }
    setDeviationTarget(null);
    setDeviationType(null);
    await reload();
  }

  async function save(): Promise<void> {
    if (form === null) return;
    const nextErrors = validateRoutineBlockForm(form);
    setErrors(nextErrors);
    if (hasRoutineBlockFormErrors(nextErrors)) return;
    if (!savingGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setSubmitError(null);
    try {
      const details = formToCommandInput(form);
      const result =
        editing === null
          ? await props.createRoutineBlock.execute(details)
          : await props.updateRoutineBlock.execute({
              ...details,
              id: editing.id,
              expectedVersion: editing.version,
            });
      if (!result.ok) {
        setSubmitError(result.error.message);
        return;
      }
      setForm(null);
      setEditing(null);
      await reload();
    } catch {
      setSubmitError('Не удалось сохранить блок. Проверьте введённые значения.');
    } finally {
      savingGuard.current.release();
      setIsSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (deleteTarget === null || !savingGuard.current.tryAcquire()) return;
    setIsSaving(true);
    const result = await props.deleteRoutineBlock.execute({
      id: deleteTarget.id,
      expectedVersion: deleteTarget.version,
    });
    savingGuard.current.release();
    setIsSaving(false);
    if (!result.ok) {
      setSubmitError(result.error.message);
      setEditing(deleteTarget);
      setForm(createRoutineBlockEditForm(deleteTarget));
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    await reload();
  }

  async function activate(block: EffectiveRoutineOccurrence): Promise<void> {
    if (!activationGuard.current.tryAcquire()) return;
    try {
      switch (block.assignment.kind) {
        case ROUTINE_BLOCK_ASSIGNMENT.reminder:
          setReminderBlock(block.sourceBlock);
          return;
        case ROUTINE_BLOCK_ASSIGNMENT.existingAction: {
          if (workflow === undefined) {
            openEdit(block.sourceBlock);
            return;
          }
          const details =
            actionDetails.get(block.assignment.actionId.toString()) ??
            (await workflow.getRoutineActionDetails.execute(block.assignment.actionId));
          if (details === null) {
            setActivationMessage(
              'Связанное действие больше недоступно. Измените назначение блока или выберите другое действие.',
            );
            openEdit(block.sourceBlock);
            return;
          }
          setSelectedAction(details.lifeAction);
          return;
        }
        case ROUTINE_BLOCK_ASSIGNMENT.createAction: {
          if (workflow === undefined) return;
          if (props.selectedDate.isBefore(props.currentDate)) {
            setActivationMessage('Создание действия для прошедшей даты недоступно.');
            return;
          }
          const decisions = (await workflow.getDecisionsForDate.execute(props.selectedDate)).filter(
            canCreateActionForDecision,
          );
          setCreateTarget(block.sourceBlock);
          setCreationDecisions(decisions);
          return;
        }
        case ROUTINE_BLOCK_ASSIGNMENT.eveningReview: {
          if (workflow === undefined) return;
          setEveningReviewDate(props.selectedDate);
          return;
        }
        case ROUTINE_BLOCK_ASSIGNMENT.walk:
          if (!openRoutineAssignmentSection(block.assignment, props.onOpenWalks)) {
            setActivationMessage('Раздел «Прогулки» сейчас недоступен.');
          }
          return;
      }
    } finally {
      activationGuard.current.release();
    }
  }

  async function startExecution(block: EffectiveRoutineOccurrence): Promise<void> {
    if (props.startRoutineOccurrence === undefined || !activationGuard.current.tryAcquire()) return;
    if (runningRoutine.status !== 'ready' || runningRoutine.item !== null) {
      activationGuard.current.release();
      setExecutionError('Сначала завершите или прервите текущий блок распорядка.');
      return;
    }
    setExecutionError(null);
    try {
      const result = await props.startRoutineOccurrence.execute({
        routineBlockId: block.sourceBlockId,
        occurrenceDate: block.occurrenceDate,
        effectiveDate: block.effectiveDate,
      });
      if (!result.ok) {
        setExecutionError(result.error.message);
        return;
      }
      await Promise.all([reload(), reloadRunningRoutine()]);
    } finally {
      activationGuard.current.release();
    }
  }

  async function finishExecution(
    item: RunningRoutineOccurrence,
    kind: 'complete' | 'abandon',
  ): Promise<void> {
    const { execution, occurrence } = item;
    const command =
      kind === 'complete' ? props.completeRoutineOccurrence : props.abandonRoutineOccurrence;
    if (command === undefined || !activationGuard.current.tryAcquire()) return;
    setIsFinishingExecution(true);
    setExecutionError(null);
    try {
      const result = await command.execute({
        routineBlockId: occurrence.sourceBlockId,
        occurrenceDate: occurrence.occurrenceDate,
        effectiveDate: occurrence.effectiveDate,
        expectedVersion: execution.version,
      });
      if (!result.ok) {
        setExecutionError(result.error.message);
        return;
      }
      await Promise.all([reload(), reloadRunningRoutine()]);
    } finally {
      setIsFinishingExecution(false);
      activationGuard.current.release();
    }
  }

  async function confirmCreatedActionLink(): Promise<void> {
    if (pendingLink === null || !savingGuard.current.tryAcquire()) return;
    setIsSaving(true);
    const result = await props.updateRoutineBlock.execute({
      ...blockToCommandInput(pendingLink.block),
      assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      actionId: pendingLink.lifeAction.id,
      id: pendingLink.block.id,
      expectedVersion: pendingLink.block.version,
    });
    savingGuard.current.release();
    setIsSaving(false);
    if (!result.ok) {
      setActivationMessage(result.error.message);
      return;
    }
    setPendingLink(null);
    await reload();
  }

  const visibleBlocks =
    activeSection === ROUTINE_SECTION.morning
      ? blocks.filter((block) => block.category === ROUTINE_BLOCK_CATEGORY.morning)
      : blocks;
  const overlaps = findRoutineBlockOverlaps(visibleBlocks);
  const unavailableActionLabel =
    editing?.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
      ? describeUnavailableAction(actionDetails.get(editing.assignment.actionId.toString()) ?? null)
      : undefined;
  const recoveredRunning =
    runningRoutine.status === 'ready' &&
    runningRoutine.item !== null &&
    runningRoutine.item.occurrence.effectiveDate.isBefore(props.currentDate)
      ? runningRoutine.item
      : null;
  const startBlocked = runningRoutine.status !== 'ready' || runningRoutine.item !== null;
  const activeEveningReviewDate =
    eveningReviewDate ?? (activeSection === ROUTINE_SECTION.evening ? props.selectedDate : null);

  if (activeEveningReviewDate !== null && workflow !== undefined) {
    return (
      <main className="section-page routine-page routine-evening-command-page">
        <EveningReviewPanel
          getEveningReview={workflow.getEveningReview}
          {...(workflow.getSpheres === undefined ? {} : { getSpheres: workflow.getSpheres })}
          completeCurrentDay={workflow.completeCurrentDay}
          {...(workflow.eveningCycle === undefined ? {} : { eveningCycle: workflow.eveningCycle })}
          {...(workflow.resolveOpenLoop === undefined
            ? {}
            : { resolveOpenLoop: workflow.resolveOpenLoop })}
          {...(workflow.reflection === undefined ? {} : { reflection: workflow.reflection })}
          {...(workflow.tomorrowPlan === undefined ? {} : { tomorrowPlan: workflow.tomorrowPlan })}
          {...(workflow.preparation === undefined ? {} : { preparation: workflow.preparation })}
          reviewDate={activeEveningReviewDate}
          onClose={closeEveningCenter}
          onCompleted={(result) => {
            setEveningCycleState(EVENING_CYCLE_STATE.completed);
            if (result.day.date.equals(props.currentDate)) props.onCurrentDayChange?.(result.day);
          }}
        />
      </main>
    );
  }

  return (
    <main className="section-page routine-page">
      <SectionPageHeader
        eyebrow="Этап 13.4"
        title="Распорядок"
        description="Плановые блоки дня, фактическое выполнение и связь с реальными действиями."
        action={
          <button className="primary-button" type="button" onClick={openCreate}>
            Создать блок
          </button>
        }
      />
      <RoutineSectionNavigation activeSection={activeSection} onSelect={selectSection} />
      <SectionDateNavigator
        currentDate={props.currentDate}
        selectedDate={props.selectedDate}
        onDateChange={props.onDateChange}
      />
      {activeSection === ROUTINE_SECTION.day || activeSection === ROUTINE_SECTION.evening ? (
        <EveningBlockCard
          status={eveningBlockStatus(eveningCycleState)}
          onOpen={() => selectSection(ROUTINE_SECTION.evening)}
        />
      ) : null}
      {loadError === null ? null : (
        <p className="routine-message error" role="alert">
          {loadError}
        </p>
      )}
      {executionError === null ? null : (
        <p className="routine-message error" role="alert">
          {executionError}
        </p>
      )}
      {runningRoutine.status === 'error' ? (
        <section className="routine-recovery routine-recovery-error" role="alert">
          <h2>Ошибка целостности выполнения</h2>
          <p>{runningRoutine.message}</p>
          <p>Запуск новых блоков заблокирован; данные не изменены.</p>
        </section>
      ) : null}
      {recoveredRunning === null ? null : (
        <RoutineRecoveryPanel
          item={recoveredRunning}
          isResolving={isFinishingExecution}
          onComplete={() => void finishExecution(recoveredRunning, 'complete')}
          onAbandon={() => void finishExecution(recoveredRunning, 'abandon')}
        />
      )}
      {activeSection === ROUTINE_SECTION.evening || overlaps.length === 0 ? null : (
        <aside className="routine-overlap-warning" role="status">
          <strong>В распорядке есть пересечения</strong>
          <ul>
            {overlaps.map((overlap) => (
              <li key={overlap}>{overlap}</li>
            ))}
          </ul>
          <p>Сохранение разрешено: скорректируйте интервалы вручную, если это необходимо.</p>
        </aside>
      )}
      {activeSection === ROUTINE_SECTION.evening ? null : visibleBlocks.length === 0 &&
        loadError === null ? (
        <section className="routine-empty">
          <h2>
            {activeSection === ROUTINE_SECTION.morning
              ? 'На этот день утренние блоки пока не составлены.'
              : 'На этот день распорядок пока не составлен.'}
          </h2>
          <button className="primary-button" type="button" onClick={openCreate}>
            Создать блок
          </button>
        </section>
      ) : (
        <section className="routine-list" aria-label="Блоки распорядка">
          {visibleBlocks.map((block) => {
            const details = actionDetailsForBlock(block, actionDetails);
            const planFact = planFacts.get(planFactKey(block));
            const executionStatus =
              planFact?.executionStatus ?? ROUTINE_EXECUTION_STATUS.notStarted;
            const runningExecution =
              executionStatus === ROUTINE_EXECUTION_STATUS.running
                ? (planFact?.execution ?? null)
                : null;
            const canChangeFact = props.selectedDate.equals(props.currentDate);
            return (
              <article
                className={`routine-card routine-category-${block.category}${block.isSkipped ? ' routine-card-skipped' : ''}${planFact === undefined ? '' : ` routine-temporal-${planFact.temporalState}`}`}
                key={`${block.id.toString()}-${block.occurrenceDate.toString()}-${block.effectiveDate.toString()}`}
              >
                <div className="routine-card-time">
                  <strong>{block.startTime}</strong>
                  <span>—</span>
                  <strong>{block.endTime}</strong>
                </div>
                <div className="routine-card-copy">
                  <p className="routine-card-purpose">{assignmentTitle(block, details)}</p>
                  <h2>{block.title}</h2>
                  <RoutinePlanFact item={planFact} occurrence={block} />
                  {block.deviationType === null ? null : (
                    <p className="routine-deviation-label">{deviationLabel(block)}</p>
                  )}
                  {details?.decision == null ? null : (
                    <p className="routine-card-context">
                      Решение: {details.decision.title.toString()}
                    </p>
                  )}
                  {block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction ? (
                    <p className="routine-card-context">
                      {details == null
                        ? 'Связанное действие недоступно'
                        : `Состояние: ${lifeActionStatusLabel(details.lifeAction)}`}
                    </p>
                  ) : null}
                  <div className="routine-card-badges">
                    <span>{ROUTINE_CATEGORY_LABELS[block.category]}</span>
                    <span>{block.required ? 'Обязательный' : 'Необязательный'}</span>
                    <span>{ROUTINE_RECURRENCE_LABELS[block.recurrence.kind]}</span>
                  </div>
                </div>
                <div className="routine-card-actions">
                  {executionStatus === ROUTINE_EXECUTION_STATUS.notStarted &&
                  !block.isSkipped &&
                  canChangeFact &&
                  props.startRoutineOccurrence !== undefined ? (
                    <button
                      className="primary-button routine-primary-command"
                      type="button"
                      disabled={startBlocked}
                      title={
                        startBlocked ? 'Сначала завершите или прервите текущий блок' : undefined
                      }
                      onClick={() => void startExecution(block)}
                    >
                      Начать блок
                    </button>
                  ) : null}
                  {runningExecution !== null && planFact !== undefined && canChangeFact ? (
                    <>
                      <button
                        className="primary-button routine-primary-command"
                        type="button"
                        disabled={isFinishingExecution}
                        onClick={() =>
                          void finishExecution(
                            { execution: runningExecution, occurrence: planFact.occurrence },
                            'complete',
                          )
                        }
                      >
                        Завершить блок
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isFinishingExecution}
                        onClick={() =>
                          void finishExecution(
                            { execution: runningExecution, occurrence: planFact.occurrence },
                            'abandon',
                          )
                        }
                      >
                        Прервать
                      </button>
                    </>
                  ) : null}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      details === null &&
                      block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
                        ? openEdit(block.sourceBlock)
                        : void activate(block)
                    }
                  >
                    {primaryCommandLabel(block, details)}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openEdit(block.sourceBlock)}
                  >
                    Изменить
                  </button>
                  <button
                    className="routine-delete-button"
                    type="button"
                    onClick={() => setDeleteTarget(block.sourceBlock)}
                  >
                    Удалить
                  </button>
                  {props.delayRoutineOccurrence === undefined ||
                  (planFact?.execution !== null && planFact?.execution !== undefined) ? null : (
                    <button
                      className="secondary-button routine-deviation-button"
                      type="button"
                      onClick={() => openDeviation(block)}
                    >
                      {block.override === null ? 'Изменить план' : 'Отклонение'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
      {deviationTarget === null ? null : (
        <RoutineDialog
          title={deviationType === null ? 'Изменить план' : deviationTitle(deviationType)}
          onClose={() => {
            if (!isSaving) {
              setDeviationTarget(null);
              setDeviationType(null);
            }
          }}
        >
          <p>
            {deviationTarget.title} · {deviationTarget.originalStartTime}–
            {deviationTarget.originalEndTime} ·{' '}
            {formatOccurrenceDate(deviationTarget.occurrenceDate)}
          </p>
          {deviationType === null ? (
            <div className="routine-deviation-menu">
              <button
                type="button"
                className="secondary-button"
                onClick={() => chooseDeviation(ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed)}
              >
                Начать позже
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => chooseDeviation(ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped)}
              >
                Пропустить
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => chooseDeviation(ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled)}
              >
                Перенести
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => chooseDeviation(ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened)}
              >
                Сократить
              </button>
              {deviationTarget.sourceBlock.assignment.kind ===
              ROUTINE_BLOCK_ASSIGNMENT.existingAction ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    chooseDeviation(ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction)
                  }
                >
                  Заменить другим действием
                </button>
              ) : null}
            </div>
          ) : (
            <div className="routine-deviation-form">
              {deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed ? (
                <label className="routine-field">
                  <span>Новое время начала</span>
                  <input
                    type="time"
                    value={deviationTime}
                    onChange={(event) => setDeviationTime(event.target.value)}
                  />
                </label>
              ) : null}
              {deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled ? (
                <>
                  <label className="routine-field">
                    <span>Новая дата</span>
                    <input
                      type="date"
                      min={deviationTarget.occurrenceDate.toString()}
                      value={deviationDate}
                      onChange={(event) => setDeviationDate(event.target.value)}
                    />
                  </label>
                  <label className="routine-field">
                    <span>Время начала</span>
                    <input
                      type="time"
                      value={deviationTime}
                      onChange={(event) => setDeviationTime(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened ? (
                <label className="routine-field">
                  <span>Новое время окончания</span>
                  <input
                    type="time"
                    value={deviationTime}
                    onChange={(event) => setDeviationTime(event.target.value)}
                  />
                </label>
              ) : null}
              {deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction ? (
                <label className="routine-field">
                  <span>Действие на это появление</span>
                  <select
                    value={replacementActionId}
                    onChange={(event) => setReplacementActionId(event.target.value)}
                  >
                    <option value="">Выберите действие</option>
                    {actionOptions.map((option) => (
                      <option
                        key={option.lifeAction.id.toString()}
                        value={option.lifeAction.id.toString()}
                      >
                        {option.lifeAction.title.toString()}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {deviationType === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped ? (
                <p>
                  Это появление останется видимым компактно как пропущенное. Правило повторения не
                  изменится.
                </p>
              ) : null}
              {deviationError === null ? null : (
                <p className="routine-message error" role="alert">
                  {deviationError}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSaving}
                  onClick={() => setDeviationType(null)}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={isSaving}
                  onClick={() => void saveDeviation()}
                >
                  {isSaving ? 'Сохраняем…' : 'Сохранить отклонение'}
                </button>
              </div>
            </div>
          )}
          {deviationTarget.override === null || deviationType !== null ? null : (
            <button
              type="button"
              className="secondary-button routine-reset-deviation"
              disabled={isSaving}
              onClick={() => void clearDeviation()}
            >
              Вернуть исходный план
            </button>
          )}
          {deviationError === null || deviationType !== null ? null : (
            <p className="routine-message error" role="alert">
              {deviationError}
            </p>
          )}
        </RoutineDialog>
      )}
      {form === null ? null : (
        <RoutineBlockForm
          form={form}
          errors={errors}
          submitError={submitError}
          isEditing={editing !== null}
          isSaving={isSaving}
          actionOptions={actionOptions}
          {...(unavailableActionLabel === undefined ? {} : { unavailableActionLabel })}
          onChange={setForm}
          onCancel={() => {
            if (!isSaving) setForm(null);
          }}
          onSubmit={() => void save()}
        />
      )}
      {deleteTarget === null ? null : (
        <RoutineDialog
          title={`Удалить блок «${deleteTarget.title}»?`}
          onClose={() => setDeleteTarget(null)}
        >
          <p>Правило будет удалено целиком. Решения, действия и рабочие сессии не изменятся.</p>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSaving}
              onClick={() => setDeleteTarget(null)}
            >
              Отмена
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={isSaving}
              onClick={() => void remove()}
            >
              {isSaving ? 'Удаляем…' : 'Удалить блок'}
            </button>
          </div>
        </RoutineDialog>
      )}
      {reminderBlock === null ? null : (
        <RoutineDialog
          title={`Напоминание · ${reminderBlock.title}`}
          onClose={() => setReminderBlock(null)}
        >
          <p>
            {reminderBlock.startTime}–{reminderBlock.endTime}
          </p>
          <p>Нажатие открыло только сведения о блоке. Предметные данные не изменены.</p>
        </RoutineDialog>
      )}
      {activationMessage === null ? null : (
        <RoutineDialog title="Назначение блока" onClose={() => setActivationMessage(null)}>
          <p>{activationMessage}</p>
        </RoutineDialog>
      )}
      {createTarget === null || creationDecision !== null ? null : (
        <RoutineDialog title="Создать действие" onClose={() => setCreateTarget(null)}>
          <p>Выберите решение. Откроется существующая форма создания действия для даты блока.</p>
          {creationDecisions.length === 0 ? (
            <p className="routine-message">
              На эту дату нет решения, для которого можно создать действие.
            </p>
          ) : (
            <div className="routine-decision-options">
              {creationDecisions.map((decision) => (
                <button
                  className="secondary-button"
                  type="button"
                  key={decision.id.toString()}
                  onClick={() => setCreationDecision(decision)}
                >
                  <strong>{decision.title.toString()}</strong>
                  <span>
                    {decision.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </RoutineDialog>
      )}
      {workflow === undefined ? null : (
        <DecisionDetailsController
          spheres={spheres}
          projects={projects}
          decision={creationDecision}
          currentDate={props.currentDate}
          selectedDate={props.selectedDate}
          readOnly={false}
          getDecisionById={workflow.getDecisionById}
          getDecisionOverview={workflow.getDecisionOverview}
          getLifeActionsForDecision={workflow.getLifeActionsForDecision}
          createLifeActionForDecision={workflow.createLifeActionForDecision}
          confirmDecisionFromActions={workflow.confirmDecisionFromActions}
          updateDecisionDetails={workflow.updateDecisionDetails}
          cancelDecisionSafely={workflow.cancelDecisionSafely}
          rescheduleDecisionSafely={workflow.rescheduleDecisionSafely}
          getActionSessionsForLifeAction={workflow.getActionSessionsForLifeAction}
          getUnfinishedActionSession={workflow.getUnfinishedActionSession}
          startLifeActionSession={workflow.startLifeActionSession}
          pauseActionSession={workflow.pauseActionSession}
          resumeActionSession={workflow.resumeActionSession}
          completeActionSession={workflow.completeActionSession}
          completeLifeAction={workflow.completeLifeAction}
          updateLifeActionDetails={workflow.updateLifeActionDetails}
          cancelLifeActionSafely={workflow.cancelLifeActionSafely}
          rescheduleLifeActionSafely={workflow.rescheduleLifeActionSafely}
          clock={workflow.clock}
          initialLifeActionFormOpen
          onClose={() => {
            setCreationDecision(null);
            setCreateTarget(null);
          }}
          onDecisionChanged={setCreationDecision}
          onOpenProject={workflow.onOpenProject ?? (() => undefined)}
          onLifeActionCreated={(lifeAction) => {
            if (createTarget !== null) setPendingLink({ block: createTarget, lifeAction });
            setCreationDecision(null);
            setCreateTarget(null);
          }}
        />
      )}
      {pendingLink === null ? null : (
        <RoutineDialog title="Действие создано" onClose={() => setPendingLink(null)}>
          <p>
            Связать созданное действие «{pendingLink.lifeAction.title.toString()}» с этим блоком?
          </p>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSaving}
              onClick={() => setPendingLink(null)}
            >
              Не связывать
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={isSaving}
              onClick={() => void confirmCreatedActionLink()}
            >
              {isSaving ? 'Связываем…' : 'Связать действие'}
            </button>
          </div>
        </RoutineDialog>
      )}
      {selectedAction === null || workflow === undefined ? null : (
        <LifeActionDetailsController
          spheres={spheres}
          lifeAction={selectedAction}
          currentDate={props.currentDate}
          readOnly={selectedAction.plannedDate?.isBefore(props.currentDate) ?? false}
          clock={workflow.clock}
          getDecisionById={workflow.getDecisionById}
          projects={projects}
          getActionSessionsForLifeAction={workflow.getActionSessionsForLifeAction}
          getUnfinishedActionSession={workflow.getUnfinishedActionSession}
          startLifeActionSession={workflow.startLifeActionSession}
          pauseActionSession={workflow.pauseActionSession}
          resumeActionSession={workflow.resumeActionSession}
          completeActionSession={workflow.completeActionSession}
          completeLifeAction={workflow.completeLifeAction}
          updateLifeActionDetails={workflow.updateLifeActionDetails}
          cancelLifeActionSafely={workflow.cancelLifeActionSafely}
          rescheduleLifeActionSafely={workflow.rescheduleLifeActionSafely}
          backLabel="Назад к распорядку"
          onClose={() => setSelectedAction(null)}
          onActionChanged={(lifeAction) => {
            setSelectedAction(lifeAction);
            void reload();
          }}
          onOpenProject={workflow.onOpenProject ?? (() => undefined)}
        />
      )}
    </main>
  );
}

export function RoutineSectionNavigation({
  activeSection,
  onSelect,
}: {
  readonly activeSection: RoutineSection;
  readonly onSelect: (section: RoutineSection) => void;
}) {
  return (
    <nav className="routine-section-navigation" aria-label="Подразделы распорядка">
      <div role="tablist">
        {ROUTINE_SECTION_OPTIONS.map((item) => (
          <button
            className="routine-section-tab"
            type="button"
            role="tab"
            key={item.section}
            aria-selected={activeSection === item.section}
            onClick={() => onSelect(item.section)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function EveningBlockCard({
  status,
  onOpen,
}: {
  readonly status: EveningBlockStatus;
  readonly onOpen: () => void;
}) {
  return (
    <section className="routine-evening-card" aria-labelledby="routine-evening-card-title">
      <div>
        <p className="section-kicker gold">Завершение дня</p>
        <h2 id="routine-evening-card-title">Вечерний блок</h2>
        <p className={`routine-evening-status is-${status}`}>{eveningBlockStatusLabel(status)}</p>
      </div>
      <button className="secondary-button" type="button" onClick={onOpen}>
        Открыть вечер →
      </button>
    </section>
  );
}

const ROUTINE_SECTION_OPTIONS: readonly {
  readonly section: RoutineSection;
  readonly label: string;
}[] = Object.freeze([
  { section: ROUTINE_SECTION.morning, label: 'Утро' },
  { section: ROUTINE_SECTION.day, label: 'День' },
  { section: ROUTINE_SECTION.evening, label: 'Вечер' },
]);

export function RoutineRecoveryPanel({
  item,
  isResolving,
  onComplete,
  onAbandon,
}: {
  readonly item: RunningRoutineOccurrence;
  readonly isResolving: boolean;
  readonly onComplete: () => void;
  readonly onAbandon: () => void;
}) {
  const { execution, occurrence } = item;
  return (
    <section className="routine-recovery" aria-labelledby="routine-recovery-title">
      <div>
        <p className="routine-card-purpose">Восстановление выполнения</p>
        <h2 id="routine-recovery-title">Блок прошлого дня всё ещё выполняется</h2>
        <dl className="routine-recovery-details">
          <div>
            <dt>Дата</dt>
            <dd>{formatOccurrenceDate(occurrence.effectiveDate)}</dd>
          </div>
          <div>
            <dt>Блок</dt>
            <dd>{occurrence.title}</dd>
          </div>
          <div>
            <dt>План</dt>
            <dd>
              {occurrence.effectiveStartTime}–{occurrence.effectiveEndTime}
            </dd>
          </div>
          <div>
            <dt>actualStartedAt</dt>
            <dd>
              {execution.actualStartedAt === null
                ? 'Не указано'
                : formatActualDateTime(execution.actualStartedAt)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="routine-recovery-actions">
        <button
          className="primary-button"
          type="button"
          disabled={isResolving}
          onClick={onComplete}
        >
          {isResolving ? 'Сохраняем…' : 'Завершить'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={isResolving}
          onClick={onAbandon}
        >
          Прервать
        </button>
      </div>
    </section>
  );
}

export function RoutinePlanFact({
  item,
  occurrence,
}: {
  readonly item: RoutinePlanFactPresentation | undefined;
  readonly occurrence: EffectiveRoutineOccurrence;
}) {
  const executionStatus = item?.executionStatus ?? ROUTINE_EXECUTION_STATUS.notStarted;
  const actualLabel = occurrence.isSkipped
    ? 'Не создаётся для пропущенного плана'
    : (item?.actualTimeLabel ?? 'Фактическое выполнение не зафиксировано');
  return (
    <div className="routine-plan-fact" aria-label="План и факт блока распорядка">
      <div className="routine-plan-fact-column">
        <span>План</span>
        <strong>
          {item?.plannedTimeLabel ??
            `${occurrence.effectiveStartTime}–${occurrence.effectiveEndTime}`}
        </strong>
      </div>
      <div className="routine-plan-fact-column">
        <span>Факт</span>
        <strong>{actualLabel}</strong>
      </div>
      {item === undefined || item.execution === null ? null : (
        <div className="routine-fact-details">
          <span>{routineExecutionStatusLabel(executionStatus)}</span>
          {item.startDeviationMinutes === null ? null : (
            <span>{startDeviationLabel(item.startDeviationMinutes)}</span>
          )}
          {item.endDeviationMinutes === null ? null : (
            <span>{endDeviationLabel(item.endDeviationMinutes)}</span>
          )}
          {item.actualDurationMinutes === null ? null : (
            <span>Фактическая длительность {item.actualDurationMinutes} мин</span>
          )}
          {item.durationDeviationMinutes === null ? null : (
            <span>{durationDeviationLabel(item.durationDeviationMinutes)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function planFactKey(occurrence: EffectiveRoutineOccurrence): string {
  return `${occurrence.sourceBlockId.toString()}\u0000${occurrence.occurrenceDate.toString()}\u0000${occurrence.effectiveDate.toString()}`;
}

function routineExecutionStatusLabel(
  status: RoutinePlanFactPresentation['executionStatus'],
): string {
  switch (status) {
    case ROUTINE_EXECUTION_STATUS.notStarted:
      return 'Не начато';
    case ROUTINE_EXECUTION_STATUS.running:
      return 'Выполняется';
    case ROUTINE_EXECUTION_STATUS.completed:
      return 'Завершено';
    case ROUTINE_EXECUTION_STATUS.abandoned:
      return 'Прервано';
  }
}

function startDeviationLabel(minutes: number): string {
  if (minutes === 0) return 'Начато по плану';
  return minutes > 0
    ? `Начато на ${minutes} мин позже`
    : `Начато на ${Math.abs(minutes)} мин раньше`;
}

function endDeviationLabel(minutes: number): string {
  if (minutes === 0) return 'Завершено по плану';
  return minutes > 0
    ? `Завершено на ${minutes} мин позже`
    : `Завершено на ${Math.abs(minutes)} мин раньше`;
}

function durationDeviationLabel(minutes: number): string {
  if (minutes === 0) return 'Длительность совпала с планом';
  return minutes > 0
    ? `На ${minutes} мин дольше плана`
    : `На ${Math.abs(minutes)} мин короче плана`;
}

function formatActualDateTime(value: Date): string {
  const date = `${value.getDate().toString().padStart(2, '0')}.${(value.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${value.getFullYear()}`;
  const time = `${value.getHours().toString().padStart(2, '0')}:${value
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  return `${date}, ${time}`;
}

async function resolveActionDetails(
  blocks: readonly EffectiveRoutineOccurrence[],
  query: Pick<GetRoutineActionDetails, 'execute'>,
): Promise<ReadonlyMap<string, RoutineActionDetails | null>> {
  const ids = [
    ...new Set(
      blocks.flatMap((block) =>
        block.effectiveAssignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
          ? [block.effectiveAssignment.actionId.toString()]
          : [],
      ),
    ),
  ];
  const entries = await Promise.all(
    ids.map(async (id) => [id, await query.execute(EntityId.create(id))] as const),
  );
  return new Map(entries);
}

function actionDetailsForBlock(
  block: EffectiveRoutineOccurrence,
  details: ReadonlyMap<string, RoutineActionDetails | null>,
): RoutineActionDetails | null | undefined {
  return block.effectiveAssignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
    ? details.get(block.effectiveAssignment.actionId.toString())
    : undefined;
}

function assignmentTitle(
  block: EffectiveRoutineOccurrence,
  details: RoutineActionDetails | null | undefined,
): string {
  if (block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction) {
    return details === null || details === undefined
      ? 'Действие · недоступно'
      : `Действие · ${details.lifeAction.title.toString()}`;
  }
  return ROUTINE_ASSIGNMENT_LABELS[block.assignment.kind];
}

function primaryCommandLabel(
  block: EffectiveRoutineOccurrence,
  details: RoutineActionDetails | null | undefined,
): string {
  switch (block.assignment.kind) {
    case ROUTINE_BLOCK_ASSIGNMENT.reminder:
      return 'Открыть';
    case ROUTINE_BLOCK_ASSIGNMENT.existingAction:
      return details === null || details === undefined ? 'Изменить назначение' : 'Открыть действие';
    case ROUTINE_BLOCK_ASSIGNMENT.createAction:
      return 'Создать действие';
    case ROUTINE_BLOCK_ASSIGNMENT.eveningReview:
      return 'Открыть вечерний контроль';
    case ROUTINE_BLOCK_ASSIGNMENT.walk:
      return 'Открыть прогулки';
  }
}

function lifeActionStatusLabel(action: LifeAction): string {
  switch (action.status) {
    case LIFE_ACTION_STATUS.draft:
      return 'черновик';
    case LIFE_ACTION_STATUS.ready:
      return 'готово';
    case LIFE_ACTION_STATUS.inProgress:
      return 'выполняется';
    case LIFE_ACTION_STATUS.completed:
      return 'завершено';
    case LIFE_ACTION_STATUS.cancelled:
      return 'отменено';
  }
}

function canCreateActionForDecision(decision: Decision): boolean {
  return (
    !decision.isArchived() &&
    !decision.isDeleted() &&
    (decision.status === DECISION_STATUS.draft ||
      decision.status === DECISION_STATUS.planned ||
      decision.status === DECISION_STATUS.inProgress)
  );
}

function formToCommandInput(form: RoutineBlockFormState) {
  return {
    anchorDate: DayDate.create(form.anchorDate),
    title: form.title,
    startTime: form.startTime,
    endTime: form.endTime,
    category: form.category,
    recurrence: form.recurrence,
    selectedWeekdays: form.selectedWeekdays,
    required: form.required,
    assignmentKind: form.assignmentKind,
    ...(form.assignmentKind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
      ? { actionId: EntityId.create(form.actionId) }
      : {}),
  };
}

function blockToCommandInput(block: RoutineBlock) {
  return {
    anchorDate: block.anchorDate,
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    category: block.category,
    recurrence: block.recurrence.kind,
    selectedWeekdays: block.recurrence.selectedWeekdays,
    required: block.required,
    assignmentKind: block.assignment.kind as RoutineBlockAssignmentKind,
    ...(block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
      ? { actionId: block.assignment.actionId }
      : {}),
  };
}

function describeUnavailableAction(details: RoutineActionDetails | null): string {
  return details === null
    ? 'Ранее связанное действие недоступно'
    : `${details.lifeAction.title.toString()} · ${lifeActionStatusLabel(details.lifeAction)}`;
}

interface RoutineDialogProps {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly onClose: () => void;
}

function RoutineDialog({ title, children, onClose }: RoutineDialogProps) {
  return (
    <div className="routine-form-backdrop" role="presentation">
      <section className="routine-delete-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <button className="secondary-button routine-dialog-close" type="button" onClick={onClose}>
          Закрыть
        </button>
      </section>
    </div>
  );
}
