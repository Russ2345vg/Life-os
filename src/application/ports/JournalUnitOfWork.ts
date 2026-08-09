import type { ActionSession, Day, Decision, JournalEntry, LifeAction } from '../../domain';

export interface JournalDayChange {
  readonly day: Day;
  readonly expectedVersion: number | null;
}

export interface JournalDecisionChange {
  readonly decision: Decision;
  readonly expectedVersion: number | null;
}

export interface JournalLifeActionChange {
  readonly lifeAction: LifeAction;
  readonly expectedVersion: number | null;
}

export interface JournalWorkSessionChange {
  readonly workSession: ActionSession;
  readonly expectedVersion: number | null;
}

export interface CommitJournalStateInput {
  readonly days?: readonly JournalDayChange[];
  readonly decisions?: readonly JournalDecisionChange[];
  readonly lifeActions?: readonly JournalLifeActionChange[];
  readonly workSessions?: readonly JournalWorkSessionChange[];
  readonly journalEntries: readonly JournalEntry[];
}

export interface JournalUnitOfWork {
  commit(input: CommitJournalStateInput): Promise<void>;
}
