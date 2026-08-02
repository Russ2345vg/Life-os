import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  ActionSessionResumed,
  EntityId,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import { ResumeActionSession } from './ResumeActionSession';

const STARTED_AT = new Date('2026-08-02T09:00:00.000+09:00');
const PAUSED_AT = new Date('2026-08-02T09:15:00.000+09:00');
const RESUMED_AT = new Date('2026-08-02T09:45:00.000+09:00');

describe('ResumeActionSession', () => {
  it('переводит paused-сессию в running, закрывает паузу, создаёт событие и сохраняет результат', async () => {
    const session = createPausedSession();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(RESUMED_AT);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('resume-event');
    const initialVersion = session.version;

    const result = await new ResumeActionSession(repository, clock, idGenerator).execute({
      sessionId: session.id,
    });
    const updatedSession = unwrap(result);

    expect(updatedSession).toBe(session);
    expect(session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(session.pausedAt).toBeNull();
    expect(session.version).toBe(initialVersion + 1);
    expect(session.pauseIntervals).toHaveLength(1);
    expect(session.pauseIntervals[0]?.startedAt).toEqual(PAUSED_AT);
    expect(session.pauseIntervals[0]?.endedAt).toEqual(RESUMED_AT);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(session);
    expect(repository.savedStatus).toBe(ACTION_SESSION_STATUS.running);
    expect(repository.savedVersion).toBe(session.version);

    const [event] = session.getUncommittedEvents();
    expect(session.getUncommittedEvents()).toHaveLength(1);
    expect(event).toBeInstanceOf(ActionSessionResumed);
    expect(event).toMatchObject({
      eventType: 'session.resumed',
      eventId: EntityId.create('resume-event-1'),
      actionSessionId: session.id,
      lifeActionId: session.lifeActionId,
    });
    if (!(event instanceof ActionSessionResumed)) {
      throw new Error('Ожидалось событие продолжения сессии.');
    }
    expect(event.pausedAt).toEqual(PAUSED_AT);
    expect(event.occurredAt).toEqual(RESUMED_AT);
  });

  it('возвращает session.not_found без Clock, IdGenerator и save', async () => {
    const repository = new FakeActionSessionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(RESUMED_AT);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new ResumeActionSession(repository, clock, idGenerator).execute({
      sessionId: EntityId.create('missing-session'),
    });

    expectFailureCode(result, 'session.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('повторно продолжает running-сессию идемпотентно без интервала, события и save', async () => {
    const session = createRunningSession();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const idGenerator = new FakeIdGenerator('duplicate-resume-event');
    const initialVersion = session.version;

    const result = await new ResumeActionSession(
      repository,
      new FakeClock(RESUMED_AT),
      idGenerator,
    ).execute({ sessionId: session.id });

    expect(unwrap(result)).toBe(session);
    expect(session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(session.pausedAt).toBeNull();
    expect(session.pauseIntervals).toEqual([]);
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual([]);
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('не продолжает completed-сессию и не вызывает save', async () => {
    const session = createRunningSession();
    session.complete({
      completedAt: RESUMED_AT,
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: EntityId.create('complete-event'),
    });
    session.clearUncommittedEvents();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const initialVersion = session.version;

    const result = await new ResumeActionSession(
      repository,
      new FakeClock(new Date('2026-08-02T10:00:00.000+09:00')),
      new FakeIdGenerator('forbidden-resume-event'),
    ).execute({ sessionId: session.id });

    expectFailureCode(result, 'action_session.resume_requires_paused');
    expect(session.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('отклоняет время раньше pausedAt без изменения сессии и save', async () => {
    const session = createPausedSession();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const initialVersion = session.version;

    const result = await new ResumeActionSession(
      repository,
      new FakeClock(new Date('2026-08-02T09:14:00.000+09:00')),
      new FakeIdGenerator('backward-resume-event'),
    ).execute({ sessionId: session.id });

    expectFailureCode(result, 'action_session.time_before_last_transition');
    expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(session.pausedAt).toEqual(PAUSED_AT);
    expect(session.pauseIntervals).toEqual([]);
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});

class FakeActionSessionRepository implements ActionSessionRepository {
  readonly #sessions = new Map<string, ActionSession>();
  public savedStatus: string | null = null;
  public savedVersion: number | null = null;

  public constructor(session?: ActionSession) {
    if (session !== undefined) {
      this.#sessions.set(session.id.toString(), session);
    }
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessions.get(id.toString()) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return [...this.#sessions.values()].filter((session) =>
      session.lifeActionId.equals(lifeActionId),
    );
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return (
      [...this.#sessions.values()].find((session) => session.isRunning() || session.isPaused()) ??
      null
    );
  }

  public async save(session: ActionSession): Promise<void> {
    this.savedStatus = session.status;
    this.savedVersion = session.version;
    this.#sessions.set(session.id.toString(), session);
  }
}

function createRunningSession(): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create('session-1'),
    lifeActionId: EntityId.create('action-1'),
    startedAt: STARTED_AT,
    eventId: EntityId.create('start-event'),
  });
  session.clearUncommittedEvents();
  return session;
}

function createPausedSession(): ActionSession {
  const session = createRunningSession();
  session.pause(PAUSED_AT, EntityId.create('pause-event'));
  session.clearUncommittedEvents();
  return session;
}

function unwrap(result: Result<ActionSession, DomainError>): ActionSession {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectFailureCode(result: Result<ActionSession, DomainError>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
