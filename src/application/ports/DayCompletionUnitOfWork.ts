import type { Day, DayDate, Decision, JournalEntry, LifeAction } from '../../domain';

export interface DayCompletionLifeActionChange {
  readonly expectedVersion: number;
  readonly lifeAction: LifeAction;
}

export interface CommitDayCompletionInput {
  readonly day: Day;
  readonly expectedDayVersion: number;
  readonly lifeActions: readonly DayCompletionLifeActionChange[];
  readonly tomorrowDate: DayDate;
  readonly newTomorrowDecisions: readonly Decision[];
  readonly journalEntries?: readonly JournalEntry[];
}

export interface DayCompletionUnitOfWork {
  commit(input: CommitDayCompletionInput): Promise<void>;
}
