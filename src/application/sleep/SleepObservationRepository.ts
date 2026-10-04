import type { SleepObservation } from '../../domain/sleep/SleepObservation';

export interface SleepObservationPeriod {
  readonly from: string;
  readonly to: string;
}

export interface SleepObservationRepository {
  getByCycleDate(cycleDate: string): Promise<SleepObservation | null>;
  list(period: SleepObservationPeriod): Promise<readonly SleepObservation[]>;
  save(observation: SleepObservation): Promise<void>;
  subscribe(listener: () => void): () => void;
}
