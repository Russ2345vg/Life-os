import { DAY_STATUS, EVENING_CYCLE_STATE, DayDate } from '../../domain';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';

export const APPLICATION_MODE = {
  activeDay: 'ACTIVE_DAY',
  evening: 'EVENING',
  recovery: 'RECOVERY',
} as const;

export type ApplicationMode = (typeof APPLICATION_MODE)[keyof typeof APPLICATION_MODE];

export interface ApplicationModeSnapshot {
  readonly mode: ApplicationMode;
  readonly cycleDate: DayDate | null;
}

export class GetApplicationMode {
  public constructor(
    private readonly days: DayRepository,
    private readonly cycles: EveningCycleRepository,
    private readonly currentDate: CurrentDateProvider,
  ) {}

  public async execute(): Promise<ApplicationModeSnapshot> {
    const today = this.currentDate.getCurrentDate();
    const previousDate = addDays(today, -1);
    const [day, currentCycle, previousCycle, latestUnfinishedCycle] = await Promise.all([
      this.days.findByDate(today),
      this.cycles.findByDateKey(today),
      this.cycles.findByDateKey(previousDate),
      this.cycles.findLatestUnfinishedOnOrBefore?.(today) ?? Promise.resolve(null),
    ]);

    if (
      currentCycle !== null &&
      currentCycle.state !== EVENING_CYCLE_STATE.notStarted &&
      currentCycle.state !== EVENING_CYCLE_STATE.completed
    ) {
      return snapshot(APPLICATION_MODE.evening, currentCycle.dateKey);
    }
    if (currentCycle?.state === EVENING_CYCLE_STATE.completed) {
      return snapshot(APPLICATION_MODE.recovery, currentCycle.dateKey);
    }
    if (latestUnfinishedCycle !== null) {
      return snapshot(APPLICATION_MODE.evening, latestUnfinishedCycle.dateKey);
    }
    if (
      previousCycle !== null &&
      previousCycle.state !== EVENING_CYCLE_STATE.notStarted &&
      previousCycle.state !== EVENING_CYCLE_STATE.completed
    ) {
      return snapshot(APPLICATION_MODE.evening, previousCycle.dateKey);
    }
    if (day?.status !== DAY_STATUS.open && previousCycle?.state === EVENING_CYCLE_STATE.completed) {
      return snapshot(APPLICATION_MODE.recovery, previousCycle.dateKey);
    }
    if (day?.status === DAY_STATUS.completed) {
      return snapshot(APPLICATION_MODE.recovery, today);
    }
    return snapshot(APPLICATION_MODE.activeDay, null);
  }
}

function snapshot(mode: ApplicationMode, cycleDate: DayDate | null): ApplicationModeSnapshot {
  return Object.freeze({ mode, cycleDate });
}

function addDays(date: DayDate, amount: number): DayDate {
  const [year, month, day] = date.toString().split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day! + amount));
  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}
