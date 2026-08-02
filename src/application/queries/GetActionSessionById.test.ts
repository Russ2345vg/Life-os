import { describe, expect, it, vi } from 'vitest';
import { ActionSession, EntityId, type ActionSession as ActionSessionType } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import { GetActionSessionById } from './GetActionSessionById';

const SESSION_ID = EntityId.create('session-1');

describe('GetActionSessionById', () => {
  it('returns the found session without changing its state, version, or events', async () => {
    const session = ActionSession.start({
      id: SESSION_ID,
      lifeActionId: EntityId.create('action-1'),
      startedAt: new Date('2026-08-02T10:30:00.000+09:00'),
      eventId: EntityId.create('event-1'),
    });
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const initialState = sessionState(session);
    const initialVersion = session.version;
    const initialEvents = session.getUncommittedEvents();

    const result = await new GetActionSessionById(repository).execute(SESSION_ID);

    expect(unwrap(result)).toBe(session);
    expect(sessionState(session)).toEqual(initialState);
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual(initialEvents);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns session.not_found for an unknown id without saving', async () => {
    const repository = new FakeActionSessionRepository();
    const save = vi.spyOn(repository, 'save');

    const result = await new GetActionSessionById(repository).execute(
      EntityId.create('missing-session'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DomainError);
      expect(result.error.code).toBe('session.not_found');
    }
    expect(save).not.toHaveBeenCalled();
  });
});

class FakeActionSessionRepository implements ActionSessionRepository {
  readonly #session: ActionSessionType | null;

  public constructor(session: ActionSessionType | null = null) {
    this.#session = session;
  }

  public async findById(id: EntityId): Promise<ActionSessionType | null> {
    return this.#session?.id.equals(id) === true ? this.#session : null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSessionType[]> {
    return this.#session?.lifeActionId.equals(lifeActionId) === true ? [this.#session] : [];
  }

  public async save(session: ActionSessionType): Promise<void> {
    void session;
  }
}

function sessionState(session: ActionSessionType): object {
  return {
    status: session.status,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    completedAt: session.completedAt,
  };
}

function unwrap(result: Result<ActionSessionType, DomainError>): ActionSessionType {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}
