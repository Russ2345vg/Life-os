import type { ActionSession, DiaryEntry, Direction, Goal, LifeAction, Sphere } from '../../domain';
import type { BalanceMonthlySnapshot } from '../../domain/balance/BalanceMonthlySnapshot';
import type { MemoryEvent } from '../../domain/memory/MemoryEvent';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import type { Walk } from '../../domain/walk/Walk';

export interface AnalyticsSnapshot {
  readonly actions: readonly LifeAction[];
  readonly sessions: readonly ActionSession[];
  readonly goals: readonly Goal[];
  readonly contributions: readonly ProgressContribution[];
  readonly diary: readonly DiaryEntry[];
  readonly balance: readonly BalanceMonthlySnapshot[];
  readonly walks: readonly Walk[];
  readonly memory: readonly MemoryEvent[];
  readonly sleep: SleepScheduleState | null;
  readonly spheres: readonly Sphere[];
  readonly directions: readonly Direction[];
}

export interface AnalyticsSnapshotReader {
  read(): Promise<AnalyticsSnapshot>;
  subscribe(listener: () => void): () => void;
}
