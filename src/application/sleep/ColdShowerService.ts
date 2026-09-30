import { DayDate } from '../../domain/day/DayDate';
import {
  recordColdShower,
  type ColdShowerEntry,
  type ColdShowerInput,
} from '../../domain/sleep/ColdShower';
import { createEmptySleepSchedule } from '../../domain/sleep/SleepSchedule';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { SleepScheduleRepository } from './SleepScheduleRepository';

export class ColdShowerService {
  public constructor(
    private readonly repository: SleepScheduleRepository,
    private readonly clock: Clock,
    private readonly dates: CurrentDateProvider,
  ) {}

  public async getEntries(): Promise<readonly ColdShowerEntry[]> {
    return (await this.repository.load())?.coldShowerEntries ?? [];
  }

  public async record(input: ColdShowerInput): Promise<readonly ColdShowerEntry[]> {
    this.assertDate(input.date);
    const now = this.clock.now();
    const state = await this.repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      const entries = state.coldShowerEntries ?? [];
      const next = recordColdShower(entries, input, now);
      return next === entries
        ? state
        : { ...state, version: state.version + 1, coldShowerEntries: next };
    });
    return state.coldShowerEntries ?? [];
  }

  public async remove(date: string): Promise<readonly ColdShowerEntry[]> {
    this.assertDate(date);
    const state = await this.repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      const entries = state.coldShowerEntries ?? [];
      const next = entries.filter((entry) => entry.date !== date);
      return next.length === entries.length
        ? state
        : { ...state, version: state.version + 1, coldShowerEntries: next };
    });
    return state.coldShowerEntries ?? [];
  }

  private assertDate(date: string): void {
    DayDate.create(date);
    if (date > this.dates.getCurrentDate().toString())
      throw new TypeError('Будущий день пока нельзя отметить.');
  }
}
