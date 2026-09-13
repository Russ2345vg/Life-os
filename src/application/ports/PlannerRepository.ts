import type { Goal, LifeAction } from '../../domain';
import type { InboxIdea } from '../../domain/planner/InboxIdea';
import type { FocusPeriod } from '../../domain/planner/FocusPeriod';

export interface InboxChange {
  readonly idea: InboxIdea;
  readonly goal?: Goal;
  readonly action?: LifeAction;
}
export interface PlannerRepository {
  listInbox(): Promise<readonly InboxIdea[]>;
  createInbox(idea: InboxIdea): Promise<void>;
  changeInbox(id: string, change: (current: InboxIdea) => InboxChange): Promise<InboxIdea>;
  getFocus(id: string): Promise<FocusPeriod | null>;
  changeFocus(
    id: string,
    change: (current: FocusPeriod | null) => FocusPeriod,
  ): Promise<FocusPeriod>;
}
