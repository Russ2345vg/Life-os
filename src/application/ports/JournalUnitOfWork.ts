import type {
  ActionSession,
  Day,
  Decision,
  Direction,
  JournalEntry,
  LifeAction,
  Project,
} from '../../domain';

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

export interface JournalDirectionChange {
  readonly direction: Direction;
  readonly expectedVersion: number;
}

export interface JournalProjectChange {
  readonly project: Project;
  readonly expectedVersion: number | null;
}

export interface CommitJournalStateInput {
  readonly days?: readonly JournalDayChange[];
  readonly decisions?: readonly JournalDecisionChange[];
  readonly lifeActions?: readonly JournalLifeActionChange[];
  readonly workSessions?: readonly JournalWorkSessionChange[];
  readonly directions?: readonly JournalDirectionChange[];
  readonly projects?: readonly JournalProjectChange[];
  readonly journalEntries: readonly JournalEntry[];
}

export interface JournalUnitOfWork {
  commit(input: CommitJournalStateInput): Promise<void>;
}
