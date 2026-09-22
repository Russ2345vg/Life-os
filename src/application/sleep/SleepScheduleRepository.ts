import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';

export type SleepScheduleUpdate = (current: SleepScheduleState | null) => SleepScheduleState;

export interface SleepScheduleRepository {
  load(): Promise<SleepScheduleState | null>;
  save(state: SleepScheduleState): Promise<void>;
  update(transform: SleepScheduleUpdate): Promise<SleepScheduleState>;
}
