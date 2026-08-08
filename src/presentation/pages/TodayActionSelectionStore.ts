import type { DayDate } from '../../domain';

export interface TodayActionSelectionStore {
  load(date: DayDate): string | null;
  save(date: DayDate, lifeActionId: string): boolean;
  clear(date: DayDate): boolean;
}
