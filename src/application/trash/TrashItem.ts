import type { Goal, LifeAction } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';

export type TrashItemType = 'goal' | 'action' | 'series';
export type TrashFilter = 'all' | 'goals' | 'actions' | 'series';

interface TrashItemDetails {
  readonly id: string;
  readonly title: string;
  readonly deletedAt: Date;
  readonly purgeAt: string;
}

export type TrashItem =
  | (TrashItemDetails & { readonly type: 'goal' })
  | (TrashItemDetails & { readonly type: 'action' })
  | (TrashItemDetails & { readonly type: 'series' });

/** A committed intent reference; undo reloads the record rather than retaining a snapshot. */
export interface TrashReceipt {
  readonly type: TrashItemType;
  readonly id: string;
}

export type RestoredTrashItem =
  | { readonly type: 'goal'; readonly id: string; readonly entity: Goal }
  | { readonly type: 'action'; readonly id: string; readonly entity: LifeAction }
  | { readonly type: 'series'; readonly id: string; readonly entity: RecurrenceRule };
