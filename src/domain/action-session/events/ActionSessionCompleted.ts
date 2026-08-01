import type { EntityId } from '../../shared/EntityId';
import type { SessionCompletionKind } from '../SessionCompletionKind';
import type { SessionResultNote } from '../SessionResultNote';
import { ActionSessionEvent } from './ActionSessionEvent';

export class ActionSessionCompleted extends ActionSessionEvent<'session.completed'> {
  public readonly eventType = 'session.completed';
  public readonly completionKind: SessionCompletionKind;
  public readonly workedDurationMilliseconds: number;
  public readonly pausedDurationMilliseconds: number;
  public readonly resultNote: SessionResultNote | null;

  public constructor(
    eventId: EntityId,
    actionSessionId: EntityId,
    lifeActionId: EntityId,
    completionKind: SessionCompletionKind,
    workedDurationMilliseconds: number,
    pausedDurationMilliseconds: number,
    resultNote: SessionResultNote | null,
    completedAt: Date,
  ) {
    super(eventId, actionSessionId, lifeActionId, completedAt);
    this.completionKind = completionKind;
    this.workedDurationMilliseconds = workedDurationMilliseconds;
    this.pausedDurationMilliseconds = pausedDurationMilliseconds;
    this.resultNote = resultNote;
  }
}
