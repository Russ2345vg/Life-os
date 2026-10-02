import type { Walk } from '../../domain/walk/Walk';
import type { WalkIntent } from '../../domain/walk/WalkIntent';
import type { WalkStatus } from '../../domain/walk/WalkStatus';

export interface WalkHistoryQuery {
  readonly deleted?: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly intent?: WalkIntent;
  readonly status?: WalkStatus;
  readonly sphereId?: string;
  readonly search?: string;
  readonly cursor?: string;
}
export interface WalkHistoryPage {
  /** List projections never carry photo bytes. Details use get. */
  readonly items: readonly Walk[];
  readonly nextCursor: string | null;
}
export interface WalkRepository {
  get(id: string): Promise<Walk | null>;
  getActive(): Promise<readonly Walk[]>;
  list(query?: WalkHistoryQuery): Promise<WalkHistoryPage>;
}
