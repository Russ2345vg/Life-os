import {
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_PHYSICAL_STATUS,
  MORNING_SHORTENED_ACTION,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  type MorningCycle,
} from '../../domain';

export type MorningForecastStageStatus = 'normal' | 'shortened' | 'skipped';

export interface MorningTypicalDurationProfile {
  readonly quickStartMinutes?: number;
  readonly physicalMinutes?: number;
  readonly mirrorMinutes?: number;
  readonly mainActionMinutes?: number;
  readonly workTransitionMinutes?: number;
}

export interface MorningForecastInput {
  readonly cycle: MorningCycle | null;
  readonly physicalEstimatedMinutes: number;
  readonly mainActionReady: boolean;
  readonly typicalDurations?: MorningTypicalDurationProfile;
}

export interface MorningForecastStageResult {
  readonly estimatedMinutes: number;
  readonly status: MorningForecastStageStatus;
}

export interface MorningForecastResult {
  readonly remainingMinutes: number;
  readonly progressPercent: number;
  readonly stages: Readonly<{
    quickStart: MorningForecastStageResult;
    physical: MorningForecastStageResult;
    mirror: MorningForecastStageResult;
    mainAction: MorningForecastStageResult;
    workBlock: MorningForecastStageResult;
  }>;
}

const SIGNIFICANCE = {
  quickStart: 1,
  physical: 1.5,
  mirror: 0.5,
  mainAction: 1.5,
  workBlock: 0.5,
} as const;

export function calculateMorningForecast(input: MorningForecastInput): MorningForecastResult {
  const profile = input.typicalDurations;
  const cycle = input.cycle;
  const activeConfiguration = cycle?.shortenedMode ? cycle.shortenedConfiguration : null;
  const quickMinutes = profile?.quickStartMinutes ?? 5;
  const normalPhysicalMinutes = Math.max(
    1,
    Math.round(profile?.physicalMinutes ?? (input.physicalEstimatedMinutes || 10)),
  );
  const mirrorMinutes = profile?.mirrorMinutes ?? 5;
  const mainActionMinutes = profile?.mainActionMinutes ?? 5;
  const workTransitionMinutes = profile?.workTransitionMinutes ?? 2;

  const physicalStatus: MorningForecastStageStatus =
    cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.skipped ||
    activeConfiguration?.physical === MORNING_SHORTENED_ACTION.skip
      ? 'skipped'
      : activeConfiguration?.physical === MORNING_SHORTENED_ACTION.shorten
        ? 'shortened'
        : 'normal';
  const mirrorStatus: MorningForecastStageStatus =
    cycle?.stageStates.some(
      (stage) =>
        stage.stageId === MORNING_STAGE_ID.mirror && stage.status === MORNING_STAGE_STATUS.skipped,
    ) === true || activeConfiguration?.mirror === MORNING_SHORTENED_ACTION.skip
      ? 'skipped'
      : 'normal';
  const physicalMinutes =
    physicalStatus === 'skipped'
      ? 0
      : physicalStatus === 'shortened'
        ? Math.max(1, Math.ceil(normalPhysicalMinutes / 2))
        : normalPhysicalMinutes;

  const waterDone = cycle?.waterCompletedAt !== null && cycle !== null;
  const showerStage = cycle?.stageStates.find(
    (stage) => stage.stageId === MORNING_STAGE_ID.coldShower,
  );
  const showerDone =
    showerStage?.status === MORNING_STAGE_STATUS.completed ||
    showerStage?.status === MORNING_STAGE_STATUS.skipped;
  const quickFraction = (Number(waterDone) + Number(showerDone)) / 2;
  const quickRemaining = Number(!waterDone) + Number(!showerDone) * 4;

  const physicalDone =
    cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.done ||
    cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.skipped ||
    physicalStatus === 'skipped';
  const execution = cycle?.physicalExecution ?? null;
  const eligibleIndexes = execution?.sets
    .map((_set, index) => index)
    .filter((index) => !execution.suppressedSetIndexes.includes(index));
  const resolvedEligible =
    execution?.sets.filter(
      (set, index) =>
        !execution.suppressedSetIndexes.includes(index) &&
        set.status !== MORNING_PHYSICAL_SET_STATUS.pending,
    ).length ?? 0;
  const physicalFraction = physicalDone
    ? 1
    : eligibleIndexes !== undefined && eligibleIndexes.length > 0
      ? resolvedEligible / eligibleIndexes.length
      : 0;
  const physicalRemaining = physicalDone ? 0 : Math.ceil(physicalMinutes * (1 - physicalFraction));

  const mirrorDone =
    mirrorStatus === 'skipped' ||
    cycle?.stageStates.some(
      (stage) =>
        stage.stageId === MORNING_STAGE_ID.mirror &&
        (stage.status === MORNING_STAGE_STATUS.completed ||
          stage.status === MORNING_STAGE_STATUS.skipped),
    ) === true;
  const mirrorResolvedForProgress = mirrorDone || physicalDone;
  const readyToWork =
    cycle?.state === MORNING_CYCLE_STATE.readyToWork ||
    cycle?.state === MORNING_CYCLE_STATE.finished;

  const stageDefinitions = [
    { minutes: quickMinutes, fraction: quickFraction, significance: SIGNIFICANCE.quickStart },
    {
      minutes: physicalMinutes,
      fraction: physicalFraction,
      significance: SIGNIFICANCE.physical,
    },
    {
      minutes: mirrorStatus === 'skipped' ? 0 : mirrorMinutes,
      fraction: mirrorResolvedForProgress ? 1 : 0,
      significance: SIGNIFICANCE.mirror,
    },
    {
      minutes: mainActionMinutes,
      fraction: readyToWork ? 1 : 0,
      significance: SIGNIFICANCE.mainAction,
    },
    {
      minutes: workTransitionMinutes,
      fraction: input.mainActionReady ? 1 : 0,
      significance: SIGNIFICANCE.workBlock,
    },
  ] as const;
  const totalWeightedWork = stageDefinitions.reduce(
    (total, stage) => total + stage.minutes * stage.significance,
    0,
  );
  const completedWeightedWork = stageDefinitions.reduce(
    (total, stage) => total + stage.minutes * stage.significance * stage.fraction,
    0,
  );

  return Object.freeze({
    remainingMinutes:
      quickRemaining +
      physicalRemaining +
      (mirrorResolvedForProgress ? 0 : mirrorMinutes) +
      (input.mainActionReady ? 0 : mainActionMinutes) +
      (readyToWork ? 0 : workTransitionMinutes),
    progressPercent:
      totalWeightedWork === 0
        ? 100
        : Math.min(100, Math.round((completedWeightedWork / totalWeightedWork) * 100)),
    stages: Object.freeze({
      quickStart: Object.freeze({ estimatedMinutes: quickMinutes, status: 'normal' as const }),
      physical: Object.freeze({ estimatedMinutes: physicalMinutes, status: physicalStatus }),
      mirror: Object.freeze({
        estimatedMinutes: mirrorStatus === 'skipped' ? 0 : mirrorMinutes,
        status: mirrorStatus,
      }),
      mainAction: Object.freeze({ estimatedMinutes: mainActionMinutes, status: 'normal' as const }),
      workBlock: Object.freeze({
        estimatedMinutes: workTransitionMinutes,
        status: 'normal' as const,
      }),
    }),
  });
}
