import type { Day } from '../../domain';

export interface OpenDayConflictReader {
  findOpenDays(): Promise<readonly Day[]>;
}
