import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  PREPARATION_PLAN_STATUS,
} from '../../domain';
import {
  EVENING_HISTORY_PREPARATION_STATE,
  type EveningHistoryRange,
  type EveningHistoryResolutionCounts,
  type EveningHistoryResult,
  type GetEveningHistory,
  type ResolvedEveningHistoryRange,
} from './GetEveningHistory';

export interface EveningHistorySummary {
  readonly range: ResolvedEveningHistoryRange;
  readonly cycleCount: number;
  readonly completedCount: number;
  readonly skippedCount: number;
  readonly unfinishedCount: number;
  readonly modeCounts: Readonly<{ NORMAL: number; QUICK: number; EMERGENCY: number }>;
  readonly totalDurationMs: number;
  readonly averageDurationMs: number | null;
  readonly resolutionCounts: EveningHistoryResolutionCounts;
  readonly reflectionAnswerCount: number;
  readonly signalCount: number;
  readonly tomorrowPlanCount: number;
  readonly primaryDecisionCount: number;
  readonly firstActionCount: number;
  readonly preparationCounts: Readonly<{
    NOT_CREATED: number;
    IN_PROGRESS: number;
    COMPLETED: number;
  }>;
  readonly skippedStageCount: number;
}

export class GetEveningHistorySummary {
  public constructor(private readonly history: Pick<GetEveningHistory, 'execute'>) {}

  public async execute(range: EveningHistoryRange): Promise<EveningHistorySummary> {
    return summarizeEveningHistory(await this.history.execute(range));
  }
}

export function summarizeEveningHistory(history: EveningHistoryResult): EveningHistorySummary {
  const durations = history.items
    .map((item) => item.durationMs)
    .filter((duration): duration is number => duration !== null);
  const totalDurationMs = durations.reduce((sum, duration) => sum + duration, 0);
  const resolutionCounts = history.items.reduce(
    (counts, item) => ({
      COMPLETE: counts.COMPLETE + item.resolutionCounts.COMPLETE,
      CARRY_FORWARD: counts.CARRY_FORWARD + item.resolutionCounts.CARRY_FORWARD,
      REVISE: counts.REVISE + item.resolutionCounts.REVISE,
      DROP: counts.DROP + item.resolutionCounts.DROP,
    }),
    { COMPLETE: 0, CARRY_FORWARD: 0, REVISE: 0, DROP: 0 },
  );

  return Object.freeze({
    range: history.range,
    cycleCount: history.items.length,
    completedCount: history.items.filter(
      (item) => item.completion === EVENING_CYCLE_COMPLETION.completed,
    ).length,
    skippedCount: history.items.filter(
      (item) => item.completion === EVENING_CYCLE_COMPLETION.skipped,
    ).length,
    unfinishedCount: history.items.filter((item) => item.state !== EVENING_CYCLE_STATE.completed)
      .length,
    modeCounts: Object.freeze({
      NORMAL: history.items.filter((item) => item.mode === EVENING_CYCLE_MODE.normal).length,
      QUICK: history.items.filter((item) => item.mode === EVENING_CYCLE_MODE.quick).length,
      EMERGENCY: history.items.filter((item) => item.mode === EVENING_CYCLE_MODE.emergency).length,
    }),
    totalDurationMs,
    averageDurationMs: durations.length === 0 ? null : totalDurationMs / durations.length,
    resolutionCounts: Object.freeze(resolutionCounts),
    reflectionAnswerCount: history.items.reduce((sum, item) => sum + item.reflectionAnswerCount, 0),
    signalCount: history.items.reduce((sum, item) => sum + item.signals.length, 0),
    tomorrowPlanCount: history.items.filter((item) => item.hasTomorrowPlan).length,
    primaryDecisionCount: history.items.filter((item) => item.primaryDecision !== null).length,
    firstActionCount: history.items.filter((item) => item.hasFirstAction).length,
    preparationCounts: Object.freeze({
      NOT_CREATED: history.items.filter(
        (item) => item.preparationState === EVENING_HISTORY_PREPARATION_STATE.notCreated,
      ).length,
      IN_PROGRESS: history.items.filter(
        (item) => item.preparationState === PREPARATION_PLAN_STATUS.inProgress,
      ).length,
      COMPLETED: history.items.filter(
        (item) => item.preparationState === PREPARATION_PLAN_STATUS.completed,
      ).length,
    }),
    skippedStageCount: history.items.reduce((sum, item) => sum + item.skippedStages.length, 0),
  });
}
