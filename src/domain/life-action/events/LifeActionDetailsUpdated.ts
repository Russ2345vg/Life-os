import type { EntityId } from '../../shared/EntityId';
import type { ActionExpectedResult } from '../ActionExpectedResult';
import type { LifeActionTitle } from '../LifeActionTitle';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionDetailsUpdated extends LifeActionEvent<'action.details_updated'> {
  public readonly eventType = 'action.details_updated';
  public readonly title: LifeActionTitle;
  public readonly description: string | null;
  public readonly expectedResult: ActionExpectedResult;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    title: LifeActionTitle,
    description: string | null,
    expectedResult: ActionExpectedResult,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.title = title;
    this.description = description;
    this.expectedResult = expectedResult;
  }
}
