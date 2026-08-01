import type { DayDate } from '../../domain';

export interface CurrentDateProvider {
  getCurrentDate(): DayDate;
}
