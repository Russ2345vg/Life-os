import {
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_PHYSICAL_STATUS,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  summarizeMorningPhysicalPlan,
  type DayDate,
  type MorningCycle,
  type MorningCycleState,
  type MorningPhysicalPlanSummary,
  type MorningStartState,
  type MorningShortenedConfiguration,
  type MorningShortenedModeState,
} from '../../domain';
import {
  calculateMorningForecast,
  type MorningForecastStageStatus,
} from '../morning-cycle/MorningForecastPolicy';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import type {
  GetMorningMainActionOverview,
  MorningMainActionOverview,
} from './GetMorningMainActionOverview';

export const MORNING_WATER_PRESENTATION_STATUS = {
  pending: 'pending',
  completed: 'completed',
} as const;

export type MorningWaterPresentationStatus =
  (typeof MORNING_WATER_PRESENTATION_STATUS)[keyof typeof MORNING_WATER_PRESENTATION_STATUS];

export const MORNING_COLD_SHOWER_PRESENTATION_STATUS = {
  pending: 'pending',
  completed: 'completed',
  skipped: 'skipped',
} as const;

export type MorningColdShowerPresentationStatus =
  (typeof MORNING_COLD_SHOWER_PRESENTATION_STATUS)[keyof typeof MORNING_COLD_SHOWER_PRESENTATION_STATUS];

export const MORNING_MIRROR_PRESENTATION_STATUS = {
  pending: 'pending',
  completed: 'completed',
  skipped: 'skipped',
} as const;

export type MorningMirrorPresentationStatus =
  (typeof MORNING_MIRROR_PRESENTATION_STATUS)[keyof typeof MORNING_MIRROR_PRESENTATION_STATUS];

export const MORNING_CENTER_STAGE_ID = {
  quickStart: 'quick-start',
  physicalActivation: 'physical-activation',
  mirror: 'mirror',
  mainAction: 'main-action',
  workBlock: 'work-block',
} as const;

export type MorningCenterStageId =
  (typeof MORNING_CENTER_STAGE_ID)[keyof typeof MORNING_CENTER_STAGE_ID];

export const MORNING_CENTER_STAGE_STATUS = {
  completed: 'completed',
  current: 'current',
  upcoming: 'upcoming',
  optional: 'optional',
} as const;

export type MorningCenterStageStatus =
  (typeof MORNING_CENTER_STAGE_STATUS)[keyof typeof MORNING_CENTER_STAGE_STATUS];

export interface MorningCenterStageOverview {
  readonly id: MorningCenterStageId;
  readonly status: MorningCenterStageStatus;
  readonly estimatedMinutes: number;
  readonly scenarioStatus: MorningForecastStageStatus;
}

export interface MorningQuickStartOverview {
  readonly water: MorningWaterPresentationStatus;
  readonly coldShower: MorningColdShowerPresentationStatus;
  readonly resolvedCount: number;
  readonly total: 2;
  readonly completed: boolean;
}

export interface MorningMirrorOverview {
  readonly status: MorningMirrorPresentationStatus;
  readonly completedAt: Date | null;
  readonly canOpen: boolean;
  readonly canComplete: boolean;
}

export interface PreviousUnfinishedMorningOverview {
  readonly date: DayDate;
  readonly startedAt: Date;
}

export interface MorningCenterOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly cycleState: MorningCycleState | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly canStart: boolean;
  readonly canUseQuickStart: boolean;
  readonly canShorten: boolean;
  readonly canRevertShortened: boolean;
  readonly canAbandonPrevious: boolean;
  readonly canRecordStartState: boolean;
  readonly shortenedMode: boolean;
  readonly shortenedModeState: MorningShortenedModeState | null;
  readonly shortenedConfiguration: MorningShortenedConfiguration | null;
  readonly overallProgressPercent: number;
  readonly remainingMinutes: number;
  readonly currentStageId: MorningCenterStageId;
  readonly stages: readonly MorningCenterStageOverview[];
  readonly previousUnfinished: PreviousUnfinishedMorningOverview | null;
  readonly startState: MorningStartState | null;
  readonly quickStart: MorningQuickStartOverview;
  readonly physicalPlan: MorningPhysicalPlanSummary;
  readonly physicalExecution: MorningCenterPhysicalExecutionOverview;
  readonly mirror: MorningMirrorOverview;
  readonly mainAction: MorningMainActionOverview;
}

export interface MorningCenterPhysicalExecutionOverview {
  readonly statusText: string | null;
  readonly resolvedSets: number;
  readonly totalSets: number;
  readonly canContinue: boolean;
}

export interface MorningCenterOverviewSource {
  readonly date: DayDate;
  readonly currentDate: DayDate;
  readonly cycle: MorningCycle | null;
  readonly previousUnfinished: MorningCycle | null;
  readonly mainAction?: MorningMainActionOverview;
}

export class GetMorningCenterOverview {
  public constructor(
    private readonly cycles: MorningCycleRepository,
    private readonly currentDate: CurrentDateProvider,
    private readonly mainActions: Pick<GetMorningMainActionOverview, 'execute'>,
  ) {}

  public async execute(date: DayDate): Promise<MorningCenterOverview> {
    const currentDate = this.currentDate.getCurrentDate();
    const [cycle, previousUnfinished, mainAction] = await Promise.all([
      this.cycles.findByDateKey(date),
      date.equals(currentDate)
        ? this.cycles.findLatestUnfinishedBefore(currentDate)
        : Promise.resolve(null),
      this.mainActions.execute(date),
    ]);
    return resolveMorningCenterOverview({
      date,
      currentDate,
      cycle,
      previousUnfinished,
      mainAction,
    });
  }
}

export function resolveMorningCenterOverview(
  source: MorningCenterOverviewSource,
): MorningCenterOverview {
  const mutable = source.date.equals(source.currentDate);
  const previous = mutable ? source.previousUnfinished : null;
  const active = source.cycle?.isActive() === true;
  const showerStage = source.cycle?.stageStates.find(
    (stage) => stage.stageId === MORNING_STAGE_ID.coldShower,
  );
  const water =
    source.cycle?.waterCompletedAt === null || source.cycle === null
      ? MORNING_WATER_PRESENTATION_STATUS.pending
      : MORNING_WATER_PRESENTATION_STATUS.completed;
  const coldShower =
    showerStage?.status === MORNING_STAGE_STATUS.completed
      ? MORNING_COLD_SHOWER_PRESENTATION_STATUS.completed
      : showerStage?.status === MORNING_STAGE_STATUS.skipped
        ? MORNING_COLD_SHOWER_PRESENTATION_STATUS.skipped
        : MORNING_COLD_SHOWER_PRESENTATION_STATUS.pending;
  const resolvedCount =
    Number(water === MORNING_WATER_PRESENTATION_STATUS.completed) +
    Number(coldShower !== MORNING_COLD_SHOWER_PRESENTATION_STATUS.pending);
  const canStart =
    mutable &&
    previous === null &&
    (source.cycle === null || source.cycle.state === MORNING_CYCLE_STATE.notStarted);
  const quickStart = Object.freeze({
    water,
    coldShower,
    resolvedCount,
    total: 2 as const,
    completed: resolvedCount === 2,
  });
  const physicalCompleted =
    source.cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.done ||
    source.cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.skipped;
  const shortenedMode = source.cycle?.shortenedMode === true;
  const physicalPlan = summarizeMorningPhysicalPlan(source.cycle?.physicalPlanItems ?? []);
  const detailedExecution = source.cycle?.physicalExecution ?? null;
  const detailedResolvedSets =
    detailedExecution?.sets.filter(
      (set, index) =>
        !detailedExecution.suppressedSetIndexes.includes(index) &&
        set.status !== MORNING_PHYSICAL_SET_STATUS.pending,
    ).length ?? 0;
  const detailedTotalSets =
    detailedExecution?.sets.filter(
      (_set, index) => !detailedExecution.suppressedSetIndexes.includes(index),
    ).length ?? physicalPlan.totalSets;
  const physicalExecution = Object.freeze({
    statusText:
      source.cycle?.physicalStatus !== MORNING_PHYSICAL_STATUS.inProgress
        ? null
        : detailedExecution !== null
          ? `Выполняется · ${detailedResolvedSets} из ${detailedTotalSets} подходов`
          : physicalPlan.totalSets > 0
            ? 'Требуется восстановить выполнение'
            : 'Выполнение нельзя восстановить',
    resolvedSets: detailedResolvedSets,
    totalSets: detailedTotalSets,
    canContinue:
      mutable &&
      active &&
      source.cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.inProgress &&
      (detailedExecution !== null || physicalPlan.totalSets > 0),
  });
  const mirrorStage = source.cycle?.stageStates.find(
    (stage) => stage.stageId === MORNING_STAGE_ID.mirror,
  );
  const mirrorCompleted = mirrorStage?.status === MORNING_STAGE_STATUS.completed;
  const mirrorSkipped =
    mirrorStage?.status === MORNING_STAGE_STATUS.skipped ||
    (shortenedMode && source.cycle?.shortenedConfiguration?.mirror === 'skip');
  const mirrorResolved = mirrorCompleted || mirrorSkipped;
  const mirror = Object.freeze({
    status: mirrorCompleted
      ? MORNING_MIRROR_PRESENTATION_STATUS.completed
      : mirrorSkipped
        ? MORNING_MIRROR_PRESENTATION_STATUS.skipped
        : MORNING_MIRROR_PRESENTATION_STATUS.pending,
    completedAt:
      mirrorCompleted && mirrorStage.updatedAt !== null
        ? new Date(mirrorStage.updatedAt.getTime())
        : null,
    canOpen:
      !mirrorSkipped &&
      (mirrorCompleted || (mutable && active && quickStart.completed && physicalCompleted)),
    canComplete: !mirrorResolved && mutable && active && quickStart.completed && physicalCompleted,
  });
  const mainAction = source.mainAction ?? EMPTY_MAIN_ACTION_OVERVIEW;
  const mainActionSkipped =
    source.cycle?.stageStates.some(
      (stage) =>
        stage.stageId === MORNING_STAGE_ID.mainAction &&
        stage.status === MORNING_STAGE_STATUS.skipped,
    ) === true;
  const mainActionResolved = mainAction.ready || mainActionSkipped;
  const forecast = calculateMorningForecast({
    cycle: source.cycle,
    physicalEstimatedMinutes: physicalPlan.selectedCount > 0 ? physicalPlan.estimatedMinutes : 10,
    mainActionReady: mainActionResolved,
  });
  const estimates: readonly [number, number, number, number, number] = [
    forecast.stages.quickStart.estimatedMinutes,
    forecast.stages.physical.estimatedMinutes,
    forecast.stages.mirror.estimatedMinutes,
    forecast.stages.mainAction.estimatedMinutes,
    forecast.stages.workBlock.estimatedMinutes,
  ];
  const currentStageId =
    source.cycle?.state === MORNING_CYCLE_STATE.readyToWork ||
    source.cycle?.state === MORNING_CYCLE_STATE.finished
      ? MORNING_CENTER_STAGE_ID.workBlock
      : !quickStart.completed
        ? MORNING_CENTER_STAGE_ID.quickStart
        : !physicalCompleted
          ? MORNING_CENTER_STAGE_ID.physicalActivation
          : !mainActionResolved
            ? MORNING_CENTER_STAGE_ID.mainAction
            : MORNING_CENTER_STAGE_ID.workBlock;
  const stageIds = [
    MORNING_CENTER_STAGE_ID.quickStart,
    MORNING_CENTER_STAGE_ID.physicalActivation,
    MORNING_CENTER_STAGE_ID.mirror,
    MORNING_CENTER_STAGE_ID.mainAction,
    MORNING_CENTER_STAGE_ID.workBlock,
  ] as const;
  const scenarioStatuses = [
    forecast.stages.quickStart.status,
    forecast.stages.physical.status,
    forecast.stages.mirror.status,
    forecast.stages.mainAction.status,
    forecast.stages.workBlock.status,
  ] as const;
  const stageStatuses = [
    quickStart.completed
      ? MORNING_CENTER_STAGE_STATUS.completed
      : currentStageId === MORNING_CENTER_STAGE_ID.quickStart
        ? MORNING_CENTER_STAGE_STATUS.current
        : MORNING_CENTER_STAGE_STATUS.upcoming,
    physicalCompleted
      ? MORNING_CENTER_STAGE_STATUS.completed
      : currentStageId === MORNING_CENTER_STAGE_ID.physicalActivation
        ? MORNING_CENTER_STAGE_STATUS.current
        : MORNING_CENTER_STAGE_STATUS.upcoming,
    mirrorResolved
      ? MORNING_CENTER_STAGE_STATUS.completed
      : quickStart.completed && physicalCompleted
        ? MORNING_CENTER_STAGE_STATUS.optional
        : MORNING_CENTER_STAGE_STATUS.upcoming,
    mainActionResolved
      ? MORNING_CENTER_STAGE_STATUS.completed
      : currentStageId === MORNING_CENTER_STAGE_ID.mainAction
        ? MORNING_CENTER_STAGE_STATUS.current
        : MORNING_CENTER_STAGE_STATUS.upcoming,
    source.cycle?.state === MORNING_CYCLE_STATE.finished
      ? MORNING_CENTER_STAGE_STATUS.completed
      : currentStageId === MORNING_CENTER_STAGE_ID.workBlock
        ? MORNING_CENTER_STAGE_STATUS.current
        : MORNING_CENTER_STAGE_STATUS.upcoming,
  ] as const;
  const stages = Object.freeze(
    stageIds.map((id, index) =>
      Object.freeze({
        id,
        status: stageStatuses[index]!,
        estimatedMinutes: estimates[index]!,
        scenarioStatus: scenarioStatuses[index]!,
      }),
    ),
  );
  return Object.freeze({
    date: source.date,
    mutable,
    cycleState: source.cycle?.state ?? null,
    startedAt: source.cycle?.startedAt ?? null,
    finishedAt: source.cycle?.finishedAt ?? null,
    canStart,
    canUseQuickStart: mutable && source.cycle?.state === MORNING_CYCLE_STATE.inProgress,
    canShorten: mutable && source.cycle?.state === MORNING_CYCLE_STATE.inProgress && !shortenedMode,
    canRevertShortened:
      mutable && source.cycle?.state === MORNING_CYCLE_STATE.inProgress && shortenedMode,
    canAbandonPrevious: mutable && previous !== null,
    canRecordStartState:
      mutable &&
      previous === null &&
      !quickStart.completed &&
      (source.cycle === null ||
        source.cycle.state === MORNING_CYCLE_STATE.notStarted ||
        source.cycle.state === MORNING_CYCLE_STATE.inProgress),
    shortenedMode,
    shortenedModeState: source.cycle?.shortenedModeState ?? null,
    shortenedConfiguration: source.cycle?.shortenedConfiguration ?? null,
    overallProgressPercent: forecast.progressPercent,
    remainingMinutes: forecast.remainingMinutes,
    currentStageId,
    stages,
    previousUnfinished:
      previous?.startedAt == null
        ? null
        : Object.freeze({
            date: previous.dateKey,
            startedAt: new Date(previous.startedAt.getTime()),
          }),
    startState: source.cycle?.startState ?? null,
    quickStart,
    physicalPlan,
    physicalExecution,
    mirror,
    mainAction,
  });
}

const EMPTY_MAIN_ACTION_OVERVIEW: MorningMainActionOverview = Object.freeze({
  decisionId: null,
  decisionTitle: null,
  expectedResult: null,
  firstStepId: null,
  firstStepTitle: null,
  scheduledTime: null,
  completed: false,
  ready: false,
  candidates: Object.freeze([]),
});
