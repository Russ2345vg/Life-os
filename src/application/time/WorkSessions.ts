import { ActionSession, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import { createWorkSessionJournalEntries } from '../journal/createJournalEntries';

export class WorkSessions {
  public constructor(
    readonly repository: ActionSessionRepository,
    readonly actions: LifeActionRepository,
    readonly unitOfWork: JournalUnitOfWork,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}

  public list(): Promise<readonly ActionSession[]> {
    return this.repository.all();
  }

  public async start(actionId: string, kind: 'work' | 'focus' = 'work'): Promise<ActionSession> {
    const action = await this.actions.findById(EntityId.create(actionId));
    if (
      !action ||
      action.isArchived() ||
      action.isDeleted() ||
      !['draft', 'ready'].includes(action.status)
    )
      throw new DomainError(
        'session.action_unavailable',
        'Начать работу можно только с открытым действием.',
      );
    const session = ActionSession.start({
      kind,
      id: this.ids.generate(),
      lifeActionId: action.id,
      goalIdAtStart: action.goalId,
      startedAt: this.clock.now(),
      eventId: this.ids.generate(),
    });
    await this.unitOfWork.commit({
      workSessionActionGuard: { id: action.id, expectedVersion: action.version },
      workSessions: [{ workSession: session, expectedVersion: null }],
      journalEntries: createWorkSessionJournalEntries(session, action),
    });
    return session;
  }

  public pause(id: string, expectedVersion: number): Promise<ActionSession> {
    return this.update(id, expectedVersion, (session) =>
      session.pause(this.clock.now(), this.ids.generate()),
    );
  }

  /** Persist the scheduled end of a focus interval even if the tab wakes later. */
  public pauseAtDeadline(
    id: string,
    expectedVersion: number,
    deadline: Date,
  ): Promise<ActionSession> {
    const now = this.clock.now();
    const at = new Date(Math.min(deadline.getTime(), now.getTime()));
    return this.update(id, expectedVersion, (session) => session.pause(at, this.ids.generate()));
  }

  public resume(id: string, expectedVersion: number): Promise<ActionSession> {
    return this.update(id, expectedVersion, (session) =>
      session.resume(this.clock.now(), this.ids.generate()),
    );
  }

  public finishAtDeadline(
    id: string,
    expectedVersion: number,
    deadline: Date,
  ): Promise<ActionSession> {
    const completedAt = new Date(Math.min(deadline.getTime(), this.clock.now().getTime()));
    return this.update(id, expectedVersion, (session) =>
      session.complete({ completedAt, completionKind: 'completed', eventId: this.ids.generate() }),
    );
  }

  public finish(id: string, expectedVersion: number, interrupted = false): Promise<ActionSession> {
    return this.update(id, expectedVersion, (session) =>
      session.complete({
        completedAt: this.clock.now(),
        completionKind: interrupted ? 'interrupted' : 'completed',
        eventId: this.ids.generate(),
      }),
    );
  }

  private async update(
    id: string,
    expectedVersion: number,
    transition: (session: ActionSession) => void,
  ): Promise<ActionSession> {
    const session = await this.repository.findById(EntityId.create(id));
    if (!session) throw new DomainError('session.not_found', 'Рабочая сессия не найдена.');
    if (session.version !== expectedVersion)
      throw new DomainError(
        'persistence.version_conflict',
        'Сессия изменилась. Обновите экран и повторите действие.',
      );
    transition(session);
    if (session.version === expectedVersion) return session;
    const action = await this.actions.findById(session.lifeActionId);
    await this.unitOfWork.commit({
      workSessions: [{ workSession: session, expectedVersion }],
      journalEntries: createWorkSessionJournalEntries(session, action),
    });
    return session;
  }
}
