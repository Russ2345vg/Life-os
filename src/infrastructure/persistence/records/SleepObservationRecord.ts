import type { WakeObservationSource } from '../../../domain/sleep/SleepObservation';

export interface SleepObservationRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly cycleDate: string;
  readonly nightCycleId: string | null;
  readonly wentToBedAt: string | null;
  readonly wokeAt: string | null;
  readonly wakeSource: WakeObservationSource | null;
  readonly wakeOccurrenceId: string | null;
  readonly timeZone: string;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
