import { describe, expect, it, vi } from 'vitest';
import { ActionSession, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import { GetUnfinishedActionSession } from './GetUnfinishedActionSession';

const LIFE_ACTION_ID = EntityId.create('action-1');
const STARTED_AT = new Date('2026-08-02T08:00:00.000+09:00');

describe('GetUnfinishedActionSession', () => {
  it('returns a running session', async () => {
    const session = createSession('running');
    const repository = createRepository(session);

    await expect(new GetUnfinishedActionSession(repository).execute()).resolves.toBe(session);
  });

  it('returns a paused session', async () => {
    const session = createSession('paused');
    session.pause(new Date(STARTED_AT.getTime() + 60_000), EntityId.create('pause-event'));
    const repository = createRepository(session);

    await expect(new GetUnfinishedActionSession(repository).execute()).resolves.toBe(session);
  });

  it('does not return a completed session', async () => {
    const repository = createRepository(null);

    await expect(new GetUnfinishedActionSession(repository).execute()).resolves.toBeNull();
  });

  it('returns null when there is no session', async () => {
    const repository = createRepository(null);

    await expect(new GetUnfinishedActionSession(repository).execute()).resolves.toBeNull();
  });

  it('passes multiple_unfinished_detected through unchanged', async () => {
    const error = new DomainError(
      'session.multiple_unfinished_detected',
      'Обнаружено несколько незавершённых сессий.',
    );
    const repository = createRepository(null);
    vi.mocked(repository.findUnfinished).mockRejectedValue(error);

    await expect(new GetUnfinishedActionSession(repository).execute()).rejects.toBe(error);
  });

  it('does not change session state or version', async () => {
    const session = createSession('unchanged');
    const repository = createRepository(session);
    const initialState = sessionState(session);
    const initialVersion = session.version;

    await new GetUnfinishedActionSession(repository).execute();

    expect(sessionState(session)).toEqual(initialState);
    expect(session.version).toBe(initialVersion);
  });

  it('does not save', async () => {
    const repository = createRepository(createSession('not-saved'));

    await new GetUnfinishedActionSession(repository).execute();

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not create or clear events', async () => {
    const session = createSession('events-unchanged');
    const initialEvents = session.getUncommittedEvents();
    const repository = createRepository(session);

    await new GetUnfinishedActionSession(repository).execute();

    expect(session.getUncommittedEvents()).toEqual(initialEvents);
  });
});

function createRepository(session: ActionSession | null): ActionSessionRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByLifeActionId: vi.fn().mockResolvedValue([]),
    findUnfinished: vi.fn().mockResolvedValue(session),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function createSession(id: string): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: LIFE_ACTION_ID,
    startedAt: STARTED_AT,
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function sessionState(session: ActionSession): object {
  return {
    status: session.status,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    completedAt: session.completedAt,
    pauseIntervals: session.pauseIntervals,
  };
}
