import type { DayDate, Decision, EntityId, LifeAction } from '../../domain';

export interface DecisionRescheduleLifeActionChange {
  readonly expectedVersion: number;
  readonly lifeAction: LifeAction;
}

export interface CommitDecisionRescheduleInput {
  readonly decision: Decision;
  readonly expectedDecisionVersion: number;
  readonly previousDate: DayDate;
  readonly newDate: DayDate;
  readonly linkedLifeActionIds: readonly EntityId[];
  readonly movedLifeActions: readonly DecisionRescheduleLifeActionChange[];
}

export interface DecisionRescheduleUnitOfWork {
  commit(input: CommitDecisionRescheduleInput): Promise<void>;
}
