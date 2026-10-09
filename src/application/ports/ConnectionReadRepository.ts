import type { PlanningState } from './PlanningRepository';
import type { MemoryContext, MemoryDiarySource } from '../../domain/memory';

export interface ConnectionPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface ConnectionWalkRecord {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly sphereId: string | null;
  readonly linkedEntity: { readonly type: string; readonly id: string } | null;
  readonly deletedAt: string | null;
}

export interface ConnectionMemoryRecord {
  readonly id: string;
  readonly title: string;
  readonly occurredOn: string;
  readonly context: MemoryContext | null;
  readonly diarySource: MemoryDiarySource | null;
  readonly deletedAt: string | null;
}

export interface ConnectionRoutineRecord {
  readonly id: string;
  readonly title: string;
  readonly anchorDate: string;
  readonly assignment: string;
}

export interface ConnectionReadRepository {
  readPlanning(): Promise<
    Pick<PlanningState, 'goals' | 'actions' | 'links' | 'contributions' | 'rules'>
  >;
  getWalk(id: string): Promise<ConnectionWalkRecord | null>;
  getMemory(id: string): Promise<ConnectionMemoryRecord | null>;
  listWalksBySource(
    source: { readonly type: 'goal' | 'lifeAction'; readonly id: string },
    cursor?: string,
  ): Promise<ConnectionPage<ConnectionWalkRecord>>;
  listMemoriesByGoal(
    goalId: string,
    cursor?: string,
  ): Promise<ConnectionPage<ConnectionMemoryRecord>>;
  listRoutineAssignments(
    actionId: string,
    ruleId?: string,
  ): Promise<readonly ConnectionRoutineRecord[]>;
}
