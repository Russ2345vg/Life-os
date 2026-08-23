import type { EveningCycle, PreparationPlan } from '../../domain';

export interface CommitPreparationInput {
  readonly plan: PreparationPlan;
  readonly expectedPlanVersion: number | null;
  readonly eveningCycle?: EveningCycle;
  readonly expectedEveningCycleVersion?: number;
}

export interface PreparationUnitOfWork {
  commit(input: CommitPreparationInput): Promise<void>;
}
