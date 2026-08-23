import type { ActionSession, Decision, EveningCycle, JournalEntry, LifeAction } from '../../domain';

export interface OpenLoopDecisionChange {
  readonly decision: Decision;
  readonly expectedVersion: number;
}

export interface OpenLoopLifeActionChange {
  readonly lifeAction: LifeAction;
  readonly expectedVersion: number;
}

export interface OpenLoopSessionChange {
  readonly session: ActionSession;
  readonly expectedVersion: number;
}

export interface CommitOpenLoopResolutionInput {
  readonly eveningCycle: EveningCycle;
  readonly expectedEveningCycleVersion: number;
  readonly decisions: readonly OpenLoopDecisionChange[];
  readonly lifeActions: readonly OpenLoopLifeActionChange[];
  readonly sessions: readonly OpenLoopSessionChange[];
  readonly journalEntries?: readonly JournalEntry[];
}

export interface OpenLoopResolutionUnitOfWork {
  commit(input: CommitOpenLoopResolutionInput): Promise<void>;
}
