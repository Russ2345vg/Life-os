import type {
  Day,
  DayDate,
  Decision,
  EveningCycle,
  JournalEntry,
  LifeAction,
  PreparationPlan,
  TomorrowPlan,
} from '../../domain';

export interface DayCompletionLifeActionChange {
  readonly expectedVersion: number;
  readonly lifeAction: LifeAction;
}

export interface CommitDayCompletionInput {
  readonly eveningCycle: EveningCycle;
  readonly expectedEveningCycleVersion: number;
  readonly day: Day;
  readonly expectedDayVersion: number;
  readonly lifeActions: readonly DayCompletionLifeActionChange[];
  readonly tomorrowDate: DayDate;
  readonly newTomorrowDecisions: readonly Decision[];
  readonly journalEntries?: readonly JournalEntry[];
  readonly tomorrowPlan?: TomorrowPlan;
  readonly expectedTomorrowPlanVersion?: number;
  readonly preparationPlan?: PreparationPlan;
  readonly expectedPreparationPlanVersion?: number;
}

export interface DayCompletionUnitOfWork {
  commit(input: CommitDayCompletionInput): Promise<void>;
}
