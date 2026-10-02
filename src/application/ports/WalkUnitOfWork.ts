import type { Walk } from '../../domain/walk/Walk';

export interface WalkRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly inputHash: string;
}
export interface WalkTransaction {
  getAction(id: string): Promise<import('../../domain/life-action/LifeAction').LifeAction | null>;
  hasGoal(id: string): Promise<boolean>;
  getWalk(id: string): Promise<Walk | null>;
  getActive(): Promise<readonly Walk[]>;
  saveWalk(walk: Walk, expectedVersion: number | null): Promise<void>;
}
export interface WalkUnitOfWork {
  /** Callback may await only transaction reads/writes. Replay returns the current saved entity. */
  run(request: WalkRequest, change: (transaction: WalkTransaction) => Promise<Walk>): Promise<Walk>;
}
