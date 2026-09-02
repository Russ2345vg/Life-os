import {
  MORNING_CYCLE_STATE,
  type DayDate,
  type MorningCycle,
  DayDate as DayDateValue,
} from '../../domain';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import type { GetMorningMainActionOverview } from './GetMorningMainActionOverview';
import {
  resolveMorningCompletionOverview,
  type MorningPhysicalResultSummary,
} from './GetMorningCompletionOverview';

export interface MorningHistoryItem {
  readonly date: DayDate;
  readonly lifecycleState: MorningCycle['state'];
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly shortened: boolean;
  readonly waterCompleted: boolean;
  readonly coldShower: 'completed' | 'skipped' | 'pending';
  readonly physical: MorningPhysicalResultSummary;
  readonly mainActionTitle: string | null;
  readonly mainActionSkipped: boolean;
}

export interface MorningHistoryPeriodSummary {
  readonly completedMornings: number;
  readonly averageNormalMorningDurationMs: number | null;
  readonly waterCompletedMornings: number;
  readonly coldShowerCompletedMornings: number;
  readonly physicallyActiveMornings: number;
  readonly averagePhysicalSessionDurationMs: number | null;
}

export interface MorningHistoryOverview {
  readonly items: readonly MorningHistoryItem[];
  readonly periods: Readonly<{
    sevenDays: MorningHistoryPeriodSummary;
    thirtyDays: MorningHistoryPeriodSummary;
  }>;
}

export class GetMorningHistory {
  public constructor(
    private readonly cycles: Pick<MorningCycleRepository, 'findBetween'>,
    private readonly mainActions: Pick<GetMorningMainActionOverview, 'execute'>,
  ) {}

  public async execute(endDate: DayDate): Promise<MorningHistoryOverview> {
    const startDate = shiftDayDate(endDate, -29);
    const cycles = await this.cycles.findBetween(startDate, endDate);
    const items = (
      await Promise.all(
        cycles.map(async (cycle): Promise<MorningHistoryItem | null> => {
          const mainAction = await this.mainActions.execute(cycle.dateKey);
          const completion = resolveMorningCompletionOverview(cycle, mainAction);
          if (completion === null || cycle.finishedAt === null) return null;
          return Object.freeze({
            date: cycle.dateKey,
            lifecycleState: cycle.state,
            startedAt: completion.startedAt,
            finishedAt: cycle.finishedAt,
            durationMs: cycle.finishedAt.getTime() - completion.startedAt.getTime(),
            shortened: cycle.wasEverShortened,
            waterCompleted: completion.quickStart.waterCompleted,
            coldShower: completion.quickStart.coldShower,
            physical: completion.physical,
            mainActionTitle: completion.mainAction.title,
            mainActionSkipped: completion.mainAction.status === 'skipped',
          });
        }),
      )
    ).filter((item): item is MorningHistoryItem => item !== null);
    const sevenStart = shiftDayDate(endDate, -6);
    return Object.freeze({
      items: Object.freeze(items),
      periods: Object.freeze({
        sevenDays: summarizePeriod(items.filter((item) => !item.date.isBefore(sevenStart))),
        thirtyDays: summarizePeriod(items),
      }),
    });
  }
}

function summarizePeriod(items: readonly MorningHistoryItem[]): MorningHistoryPeriodSummary {
  const completed = items.filter((item) => item.lifecycleState === MORNING_CYCLE_STATE.finished);
  const normalDurations = completed
    .filter((item) => !item.shortened)
    .map((item) => item.durationMs);
  const physicalDurations = completed
    .map((item) => item.physical.sessionDurationMs)
    .filter((duration): duration is number => duration !== null);
  return Object.freeze({
    completedMornings: completed.length,
    averageNormalMorningDurationMs: average(normalDurations),
    waterCompletedMornings: completed.filter((item) => item.waterCompleted).length,
    coldShowerCompletedMornings: completed.filter((item) => item.coldShower === 'completed').length,
    physicallyActiveMornings: completed.filter((item) => item.physical.completed).length,
    averagePhysicalSessionDurationMs: average(physicalDurations),
  });
}

function average(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function shiftDayDate(date: DayDate, deltaDays: number): DayDate {
  const value = new Date(`${date.toString()}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + deltaDays);
  return DayDateValue.create(value.toISOString().slice(0, 10));
}
