import type {
  Day,
  Decision,
  EveningCycle,
  JournalEntry,
  LifeAction,
  TomorrowPlan,
} from '../../domain';
import type {
  RecommendationApplication,
  RecommendationApplicationStatus,
} from '../recommendations/RecommendationApplication';

export interface RecommendationApplicationCommit {
  readonly application: RecommendationApplication;
  readonly expectedStatus: RecommendationApplicationStatus;
}

export interface CommitTomorrowPlanInput {
  readonly plan: TomorrowPlan;
  readonly expectedPlanVersion: number | null;
  readonly targetDay?: Day;
  readonly newDecision?: Decision;
  readonly newLifeAction?: LifeAction;
  readonly eveningCycle?: EveningCycle;
  readonly expectedEveningCycleVersion?: number;
  readonly journalEntries?: readonly JournalEntry[];
  readonly recommendationApplication?: RecommendationApplicationCommit;
}

export interface TomorrowPlanUnitOfWork {
  commit(input: CommitTomorrowPlanInput): Promise<void>;
}
