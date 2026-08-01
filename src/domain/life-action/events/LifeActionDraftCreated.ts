import type { EntityId } from '../../shared/EntityId';
import type { LifeActionTitle } from '../LifeActionTitle';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionDraftCreated extends LifeActionEvent<'action.draft_created'> {
  public readonly eventType = 'action.draft_created';
  public readonly title: LifeActionTitle;
  public readonly decisionId: EntityId | null;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    title: LifeActionTitle,
    decisionId: EntityId | null,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.title = title;
    this.decisionId = decisionId;
  }
}
