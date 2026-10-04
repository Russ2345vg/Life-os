import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import type { ContributionLink } from '../../domain/planner/ProgressContribution';
import type { WalkCapture } from '../../domain/walk-capture/WalkCapture';
import type { WalkRequest } from './WalkUnitOfWork';
import type {
  ActionSession,
  Day,
  DayDate,
  Decision,
  Direction,
  JournalEntry,
  LifeAction,
  EntityId,
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
  readonly walkCaptureAction?: {
    readonly capture: WalkCapture;
    readonly expectedVersion: number;
    readonly request: WalkRequest;
  };
  /** Recheck the source action while atomically creating a work session. */
  readonly workSessionActionGuard?: { readonly id: EntityId; readonly expectedVersion: number };
  /** Reject a batch when one of its actions has a running or paused work session. */
  readonly inactiveSessionActionIds?: readonly EntityId[];
  readonly planningSetup?: {
    readonly rules: readonly RecurrenceRule[];
    readonly links: readonly ContributionLink[];
  };
  /** Validate the final main-action selection inside the same write transaction. */
  readonly mainActionDate?: DayDate;
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
