import {
  WALK_STATUS,
  type RoutineOccurrenceExecution,
  type Walk,
  type WalkRoutineOccurrenceReference,
} from '../../domain';

export interface RoutineWalkPlanExpectation {
  readonly source: WalkRoutineOccurrenceReference;
  readonly expectedRoutineBlockVersion: number;
  readonly expectedOverrideVersion: number | null;
}

export interface StartRoutineWalkCommitInput {
  readonly walk: Walk;
  readonly execution: RoutineOccurrenceExecution;
  readonly expectedExecutionVersion: number | null;
  readonly plan: RoutineWalkPlanExpectation;
}

export interface FinishRoutineWalkCommitInput {
  readonly walk: Walk;
  readonly expectedWalkVersion: number;
  readonly execution: RoutineOccurrenceExecution;
  readonly expectedExecutionVersion: number;
  readonly terminalStatus: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned;
}

export interface RoutineWalkUnitOfWork {
  start(input: StartRoutineWalkCommitInput): Promise<Walk>;
  finish(input: FinishRoutineWalkCommitInput): Promise<void>;
}
