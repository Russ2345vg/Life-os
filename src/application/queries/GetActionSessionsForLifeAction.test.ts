import { describe, expect, it, vi } from 'vitest';
import { ActionSession, EntityId } from '../../domain';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import { GetActionSessionsForLifeAction } from './GetActionSessionsForLifeAction';

const LIFE_ACTION_ID = EntityId.create('action-1');
const OTHER_LIFE_ACTION_ID = EntityId.create('action-2');

describe('GetActionSessionsForLifeAction', () => {
  it('returns all running, paused, and completed sessions only for the requested action', async () => {
    const running = createSession('running', LIFE_ACTION_ID, at('08:00:00'));
    const paused = pauseSession(createSession('paused', LIFE_ACTION_ID, at('09:00:00')));
    const completed = completeSession(createSession('completed', LIFE_ACTION_ID, at('10:00:00')));
    const foreign = createSession('foreign', OTHER_LIFE_ACTION_ID, at('07:00:00'));
    const repository = new FakeActionSessionRepository([foreign, completed, paused, running]);

    const result = await new GetActionSessionsForLifeAction(repository).execute(LIFE_ACTION_ID);

    expect(result).toEqual([running, paused, completed]);
    expect(result.map((session) => session.status)).toEqual(['running', 'paused', 'completed']);
  });

  it('sorts by startedAt and then by the string value of id', async () => {
    const later = createSession('session-later', LIFE_ACTION_ID, at('10:00:00'));
    const sameTimeB = createSession('session-b', LIFE_ACTION_ID, at('08:00:00'));
    const sameTimeA = createSession('session-a', LIFE_ACTION_ID, at('08:00:00'));
    const repository = new FakeActionSessionRepository([later, sameTimeB, sameTimeA]);

    const result = await new GetActionSessionsForLifeAction(repository).execute(LIFE_ACTION_ID);

    expect(result).toEqual([sameTimeA, sameTimeB, later]);
  });

  it('returns an empty array when there are no sessions', async () => {
    const repository = new FakeActionSessionRepository([]);

    await expect(
      new GetActionSessionsForLifeAction(repository).execute(LIFE_ACTION_ID),
    ).resolves.toEqual([]);
  });

  it('returns an independent array', async () => {
    const session = createSession('session-1', LIFE_ACTION_ID, at('08:00:00'));
    const repository = new FakeActionSessionRepository([session]);
    const query = new GetActionSessionsForLifeAction(repository);
    const firstResult = await query.execute(LIFE_ACTION_ID);

    (firstResult as ActionSession[]).length = 0;

    await expect(query.execute(LIFE_ACTION_ID)).resolves.toEqual([session]);
  });

  it('does not change session state, version, or events and does not save', async () => {
    const sessions = [
      createSession('running', LIFE_ACTION_ID, at('08:00:00')),
      pauseSession(createSession('paused', LIFE_ACTION_ID, at('09:00:00'))),
      completeSession(createSession('completed', LIFE_ACTION_ID, at('10:00:00'))),
    ];
    const repository = new FakeActionSessionRepository(sessions);
    const save = vi.spyOn(repository, 'save');
    const initialStates = sessions.map(sessionState);
    const initialVersions = sessions.map((session) => session.version);
    const initialEvents = sessions.map((session) => session.getUncommittedEvents());

    await new GetActionSessionsForLifeAction(repository).execute(LIFE_ACTION_ID);

    expect(sessions.map(sessionState)).toEqual(initialStates);
    expect(sessions.map((session) => session.version)).toEqual(initialVersions);
    expect(sessions.map((session) => session.getUncommittedEvents())).toEqual(initialEvents);
    expect(save).not.toHaveBeenCalled();
  });
});

class FakeActionSessionRepository implements ActionSessionRepository {
  readonly #sessions: readonly ActionSession[];

  public constructor(sessions: readonly ActionSession[]) {
    this.#sessions = sessions;
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessions.find((session) => session.id.equals(id)) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    void lifeActionId;
    return this.#sessions;
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return this.#sessions.find((session) => session.isRunning() || session.isPaused()) ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    void session;
  }
}

function createSession(id: string, lifeActionId: EntityId, startedAt: Date): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt,
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function pauseSession(session: ActionSession): ActionSession {
  session.pause(
    new Date(session.startedAt.getTime() + 60_000),
    EntityId.create(`${session.id.toString()}-paused-event`),
  );
  return session;
}

function completeSession(session: ActionSession): ActionSession {
  session.complete({
    completedAt: new Date(session.startedAt.getTime() + 60_000),
    completionKind: 'interrupted',
    eventId: EntityId.create(`${session.id.toString()}-completed-event`),
  });
  return session;
}

function sessionState(session: ActionSession): object {
  return {
    lifeActionId: session.lifeActionId,
    status: session.status,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    completedAt: session.completedAt,
    completionKind: session.completionKind,
    resultNote: session.resultNote,
    pauseIntervals: session.pauseIntervals,
  };
}

function at(time: string): Date {
  return new Date(`2026-08-02T${time}.000+09:00`);
}
