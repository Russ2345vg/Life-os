import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_PHYSICAL_STATUS,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  type DayDate,
  type MorningCycle,
} from '../../domain';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import type {
  GetMorningMainActionOverview,
  MorningMainActionOverview,
} from './GetMorningMainActionOverview';

export const MORNING_COMPLETION_STATUS = {
  notReady: 'not_ready',
  ready: 'ready',
  partialAllowed: 'partial_allowed',
  workBlockStarted: 'work_block_started',
} as const;

export type MorningCompletionStatus =
  (typeof MORNING_COMPLETION_STATUS)[keyof typeof MORNING_COMPLETION_STATUS];

export interface MorningPhysicalResultSummary {
  readonly completed: boolean;
  readonly skipped: boolean;
  readonly exerciseCount: number;
  readonly completedSets: number;
  readonly totalRepetitions: number;
  readonly totalDurationSeconds: number;
  readonly sessionDurationMs: number | null;
}

export interface MorningCompletionOverview {
  readonly date: DayDate;
  readonly status: MorningCompletionStatus;
  readonly canStartWorkBlock: boolean;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly finishedAt: Date | null;
  readonly durationMs: number;
  readonly shortened: boolean;
  readonly quickStart: Readonly<{
    waterCompleted: boolean;
    coldShower: 'completed' | 'skipped' | 'pending';
  }>;
  readonly physical: MorningPhysicalResultSummary;
  readonly mainAction: Readonly<{
    title: string | null;
    scheduledTime: string | null;
    expectedResult: string | null;
    firstStepTitle: string | null;
    status: 'ready' | 'skipped' | 'not_ready';
  }>;
}

export class GetMorningCompletionOverview {
  public constructor(
    private readonly cycles: Pick<MorningCycleRepository, 'findByDateKey'>,
    private readonly mainActions: Pick<GetMorningMainActionOverview, 'execute'>,
  ) {}

  public async execute(date: DayDate): Promise<MorningCompletionOverview | null> {
    const [cycle, mainAction] = await Promise.all([
      this.cycles.findByDateKey(date),
      this.mainActions.execute(date),
    ]);
    return cycle === null ? null : resolveMorningCompletionOverview(cycle, mainAction);
  }
}

export function resolveMorningCompletionOverview(
  cycle: MorningCycle,
  mainAction: MorningMainActionOverview,
): MorningCompletionOverview | null {
  const startedAt = cycle.startedAt;
  const completedAt =
    cycle.finishedAt ?? (cycle.state === MORNING_CYCLE_STATE.readyToWork ? cycle.updatedAt : null);
  if (startedAt === null || completedAt === null) return null;

  const shower = cycle.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.coldShower);
  const coldShower =
    shower?.status === MORNING_STAGE_STATUS.completed
      ? 'completed'
      : shower?.status === MORNING_STAGE_STATUS.skipped
        ? 'skipped'
        : 'pending';
  const mainActionSkipped = cycle.stageStates.some(
    (stage) =>
      stage.stageId === MORNING_STAGE_ID.mainAction &&
      stage.status === MORNING_STAGE_STATUS.skipped,
  );
  const physical = summarizeMorningPhysicalResult(cycle);
  const execution = cycle.physicalExecution;
  const partialAllowed =
    coldShower === 'skipped' ||
    physical.skipped ||
    mainActionSkipped ||
    (execution?.sets.some((set) => set.status === MORNING_PHYSICAL_SET_STATUS.skipped) ?? false) ||
    (execution?.suppressedSetIndexes.length ?? 0) > 0;
  const status =
    cycle.state === MORNING_CYCLE_STATE.finished
      ? MORNING_COMPLETION_STATUS.workBlockStarted
      : cycle.state !== MORNING_CYCLE_STATE.readyToWork
        ? MORNING_COMPLETION_STATUS.notReady
        : partialAllowed
          ? MORNING_COMPLETION_STATUS.partialAllowed
          : MORNING_COMPLETION_STATUS.ready;

  return Object.freeze({
    date: cycle.dateKey,
    status,
    canStartWorkBlock: cycle.state === MORNING_CYCLE_STATE.readyToWork,
    startedAt,
    completedAt,
    finishedAt: cycle.finishedAt,
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    shortened: cycle.wasEverShortened,
    quickStart: Object.freeze({
      waterCompleted: cycle.waterCompletedAt !== null,
      coldShower,
    }),
    physical,
    mainAction: Object.freeze({
      title: mainActionSkipped ? null : mainAction.decisionTitle,
      scheduledTime: mainActionSkipped ? null : mainAction.scheduledTime,
      expectedResult: mainActionSkipped ? null : mainAction.expectedResult,
      firstStepTitle: mainActionSkipped ? null : mainAction.firstStepTitle,
      status: mainActionSkipped ? 'skipped' : mainAction.ready ? 'ready' : 'not_ready',
    }),
  });
}

export function summarizeMorningPhysicalResult(cycle: MorningCycle): MorningPhysicalResultSummary {
  const execution = cycle.physicalExecution;
  const eligibleSets =
    execution?.sets.filter((_set, index) => !execution.suppressedSetIndexes.includes(index)) ?? [];
  const completedSets = eligibleSets.filter(
    (set) => set.status === MORNING_PHYSICAL_SET_STATUS.completed,
  );
  const exerciseIds = new Set(eligibleSets.map((set) => set.exerciseDefinitionId.toString()));
  return Object.freeze({
    completed: cycle.physicalStatus === MORNING_PHYSICAL_STATUS.done,
    skipped: cycle.physicalStatus === MORNING_PHYSICAL_STATUS.skipped,
    exerciseCount: exerciseIds.size,
    completedSets: completedSets.length,
    totalRepetitions: completedSets.reduce(
      (total, set) =>
        total +
        (set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions ? set.actualReps : 0),
      0,
    ),
    totalDurationSeconds: completedSets.reduce(
      (total, set) =>
        total +
        (set.measurementType === EXERCISE_MEASUREMENT_TYPE.duration
          ? set.actualDurationSeconds
          : 0),
      0,
    ),
    sessionDurationMs:
      execution?.completedAt === null || execution === null
        ? null
        : execution.workedDurationAt(execution.completedAt),
  });
}
