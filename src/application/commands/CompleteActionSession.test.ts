import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  ActionSessionCompleted,
  EntityId,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import { CompleteActionSession } from './CompleteActionSession';

const STARTED_AT = new Date('2026-08-02T09:00:00.000+09:00');
const PAUSED_AT = new Date('2026-08-02T09:15:00.000+09:00');
const COMPLETED_AT = new Date('2026-08-02T10:00:00.000+09:00');

describe('CompleteActionSession', () => {
  it('завершает running-сессию, сохраняет результат и создаёт событие с длительностями', async () => {
    const session = createRunningSession();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(COMPLETED_AT);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('complete-event');
    const initialVersion = session.version;

    const result = await new CompleteActionSession(repository, clock, idGenerator).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: '  Получен рабочий результат  ',
    });
    const completedSession = unwrap(result);

    expect(completedSession).toBe(session);
    expect(session.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(session.completedAt).toEqual(COMPLETED_AT);
    expect(session.completionKind).toBe(SESSION_COMPLETION_KIND.completed);
    expect(session.resultNote?.toString()).toBe('Получен рабочий результат');
    expect(session.isCompleted()).toBe(true);
    expect(session.isInterrupted()).toBe(false);
    expect(session.version).toBe(initialVersion + 1);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(session);
    expect(repository.savedStatus).toBe(ACTION_SESSION_STATUS.completed);
    expect(repository.savedVersion).toBe(session.version);
    expect(repository.savedEventTypes).toEqual(['session.completed']);

    const [event] = session.getUncommittedEvents();
    expect(session.getUncommittedEvents()).toHaveLength(1);
    expect(event).toBeInstanceOf(ActionSessionCompleted);
    expect(event).toMatchObject({
      eventType: 'session.completed',
      eventId: EntityId.create('complete-event-1'),
      actionSessionId: session.id,
      lifeActionId: session.lifeActionId,
      completionKind: SESSION_COMPLETION_KIND.completed,
      elapsedDurationMilliseconds: 3_600_000,
      pausedDurationMilliseconds: 0,
      workedDurationMilliseconds: 3_600_000,
    });
    if (!(event instanceof ActionSessionCompleted)) {
      throw new Error('Ожидалось событие завершения сессии.');
    }
    expect(event.resultNote?.toString()).toBe('Получен рабочий результат');
    expect(event.occurredAt).toEqual(COMPLETED_AT);
  });

  it('завершает paused-сессию, закрывает последнюю паузу и исключает её из работы', async () => {
    const session = createPausedSession();
    const repository = new FakeActionSessionRepository(session);
    const completedAt = new Date('2026-08-02T09:45:00.000+09:00');
    const initialVersion = session.version;

    const result = await new CompleteActionSession(
      repository,
      new FakeClock(completedAt),
      new FakeIdGenerator('complete-paused-event'),
    ).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
    });

    expect(unwrap(result)).toBe(session);
    expect(session.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(session.pausedAt).toBeNull();
    expect(session.completedAt).toEqual(completedAt);
    expect(session.pauseIntervals).toHaveLength(1);
    expect(session.pauseIntervals[0]?.startedAt).toEqual(PAUSED_AT);
    expect(session.pauseIntervals[0]?.endedAt).toEqual(completedAt);
    expect(session.pauseIntervals[0]?.durationMilliseconds).toBe(1_800_000);
    expect(session.elapsedDurationAt(COMPLETED_AT)).toBe(2_700_000);
    expect(session.pausedDurationAt(COMPLETED_AT)).toBe(1_800_000);
    expect(session.workedDurationAt(COMPLETED_AT)).toBe(900_000);
    expect(session.version).toBe(initialVersion + 1);

    const [event] = session.getUncommittedEvents();
    expect(event).toBeInstanceOf(ActionSessionCompleted);
    expect(event).toMatchObject({
      elapsedDurationMilliseconds: 2_700_000,
      pausedDurationMilliseconds: 1_800_000,
      workedDurationMilliseconds: 900_000,
    });
  });

  it('завершает сессию как interrupted без обязательной записи результата и замораживает длительность', async () => {
    const session = createRunningSession();
    const repository = new FakeActionSessionRepository(session);
    const completedAt = new Date('2026-08-02T09:20:00.000+09:00');

    const result = await new CompleteActionSession(
      repository,
      new FakeClock(completedAt),
      new FakeIdGenerator('interrupt-event'),
    ).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.interrupted,
    });

    expect(unwrap(result)).toBe(session);
    expect(session.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(session.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
    expect(session.resultNote).toBeNull();
    expect(session.isInterrupted()).toBe(true);
    expect(session.elapsedDurationAt(new Date('2026-08-02T18:00:00.000+09:00'))).toBe(1_200_000);
    expect(session.workedDurationAt(new Date('2026-08-02T18:00:00.000+09:00'))).toBe(1_200_000);
  });

  it('считает пустую запись результата отсутствующей', async () => {
    const session = createRunningSession();

    const result = await new CompleteActionSession(
      new FakeActionSessionRepository(session),
      new FakeClock(COMPLETED_AT),
      new FakeIdGenerator('complete-event'),
    ).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: '   ',
    });

    expect(unwrap(result).resultNote).toBeNull();
  });

  it('возвращает session.not_found без Clock, IdGenerator и save', async () => {
    const repository = new FakeActionSessionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(COMPLETED_AT);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new CompleteActionSession(repository, clock, idGenerator).execute({
      sessionId: EntityId.create('missing-session'),
      completionKind: SESSION_COMPLETION_KIND.completed,
    });

    expectFailureCode(result, 'session.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('отклоняет завершение раньше startedAt без изменения сессии и save', async () => {
    const session = createRunningSession();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const initialVersion = session.version;

    const result = await new CompleteActionSession(
      repository,
      new FakeClock(new Date('2026-08-02T08:59:00.000+09:00')),
      new FakeIdGenerator('backward-complete-event'),
    ).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
    });

    expectFailureCode(result, 'action_session.time_before_last_transition');
    expect(session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(session.completedAt).toBeNull();
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('отклоняет завершение раньше pausedAt без закрытия паузы и save', async () => {
    const session = createPausedSession();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const initialVersion = session.version;

    const result = await new CompleteActionSession(
      repository,
      new FakeClock(new Date('2026-08-02T09:14:00.000+09:00')),
      new FakeIdGenerator('backward-complete-event'),
    ).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
    });

    expectFailureCode(result, 'action_session.time_before_last_transition');
    expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(session.pausedAt).toEqual(PAUSED_AT);
    expect(session.completedAt).toBeNull();
    expect(session.pauseIntervals).toEqual([]);
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('повторно завершает completed-сессию идемпотентно без изменения, события и save', async () => {
    const session = createRunningSession();
    const originalCompletedAt = new Date('2026-08-02T09:20:00.000+09:00');
    session.complete({
      completedAt: originalCompletedAt,
      completionKind: SESSION_COMPLETION_KIND.interrupted,
      eventId: EntityId.create('original-complete-event'),
    });
    session.clearUncommittedEvents();
    const repository = new FakeActionSessionRepository(session);
    const save = vi.spyOn(repository, 'save');
    const initialVersion = session.version;

    const result = await new CompleteActionSession(
      repository,
      new FakeClock(COMPLETED_AT),
      new FakeIdGenerator('duplicate-complete-event'),
    ).execute({
      sessionId: session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: 'Не должно сохраниться',
    });

    expect(unwrap(result)).toBe(session);
    expect(session.completedAt).toEqual(originalCompletedAt);
    expect(session.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
    expect(session.resultNote).toBeNull();
    expect(session.version).toBe(initialVersion);
    expect(session.getUncommittedEvents()).toEqual([]);
    expect(session.elapsedDurationAt(COMPLETED_AT)).toBe(1_200_000);
    expect(session.workedDurationAt(COMPLETED_AT)).toBe(1_200_000);
    expect(save).not.toHaveBeenCalled();
  });
});

class FakeActionSessionRepository implements ActionSessionRepository {
  readonly #sessions = new Map<string, ActionSession>();
  public savedStatus: string | null = null;
  public savedVersion: number | null = null;
  public savedEventTypes: string[] = [];

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

  public async save(session: ActionSession): Promise<void> {
    this.savedStatus = session.status;
    this.savedVersion = session.version;
    this.savedEventTypes = session.getUncommittedEvents().map((event) => event.eventType);
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
