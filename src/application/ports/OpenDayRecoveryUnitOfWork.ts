import type { Day, EntityId } from '../../domain';

export interface OpenDayVersionExpectation {
  readonly dayId: EntityId;
  readonly version: number;
}

export interface CommitOpenDayRecoveryInput {
  readonly expectedOpenDays: readonly OpenDayVersionExpectation[];
  readonly keepOpenDayId: EntityId | null;
  readonly completedDays: readonly Day[];
}

export interface OpenDayRecoveryUnitOfWork {
  commit(input: CommitOpenDayRecoveryInput): Promise<void>;
}
