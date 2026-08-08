import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  ActionSessionStarted,
  Day,
  DayDate,
  EntityId,
  LIFE_ACTION_STATUS,
  LifeActionStarted,
  SESSION_COMPLETION_KIND,
  type LifeAction,
} from '../../domain';
import { InMemoryLifeActionRepository } from '../../infrastructure';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import {
  StartLifeActionSession,
  type StartLifeActionSessionResult,
} from './StartLifeActionSession';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T10:30:00.000+09:00');
const EXISTING_STARTED_AT = new Date('2026-08-02T09:00:00.000+09:00');
const EXISTING_PAUSED_AT = new Date('2026-08-02T09:30:00.000+09:00');
const EXISTING_COMPLETED_AT = new Date('2026-08-02T10:00:00.000+09:00');

describe('StartLifeActionSession', () => {
  it('согласованно переводит ready в in_progress и создаёт running-сессию', async () => {
    const lifeAction = createReadyLifeAction('ready-action', DATE);
    lifeAction.clearUncommittedEvents();
    const initialVersion = lifeAction.version;
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const actionSessionRepository = new FakeActionSessionRepository();
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const findUnfinished = vi.spyOn(actionSessionRepository, 'findUnfinished');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('coordinated');
    const generate = vi.spyOn(idGenerator, 'generate');

    const result = unwrap(
      await new StartLifeActionSession(
        lifeActionRepository,
        actionSessionRepository,
        createOpenDayRepository(),
        new FakeCurrentDateProvider(DATE),
        clock,
        idGenerator,
      ).execute({ lifeActionId: lifeAction.id }),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.lifeAction).toBe(lifeAction);
    expect(result.lifeAction.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(result.lifeAction.startedAt).toEqual(NOW);
    expect(result.lifeAction.version).toBe(initialVersion + 1);
    expect(result.session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(result.session.lifeActionId.equals(lifeAction.id)).toBe(true);
    expect(result.session.startedAt).toEqual(NOW);
    expect(result.session.id.toString()).toBe('coordinated-2');

    expect(findUnfinished).toHaveBeenCalledOnce();
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(3);
    expect(findUnfinished.mock.invocationCallOrder[0]).toBeLessThan(
      now.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(findUnfinished.mock.invocationCallOrder[0]).toBeLessThan(
      generate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    const [lifeActionEvent] = result.lifeAction.getUncommittedEvents();
    expect(result.lifeAction.getUncommittedEvents()).toHaveLength(1);
    expect(lifeActionEvent).toBeInstanceOf(LifeActionStarted);
    expect(lifeActionEvent).toMatchObject({
      eventType: 'action.started',
      eventId: EntityId.create('coordinated-1'),
      lifeActionId: lifeAction.id,
    });
    expect(lifeActionEvent?.occurredAt).toEqual(NOW);

    const [sessionEvent] = result.session.getUncommittedEvents();
    expect(result.session.getUncommittedEvents()).toHaveLength(1);
    expect(sessionEvent).toBeInstanceOf(ActionSessionStarted);
    expect(sessionEvent).toMatchObject({
      eventType: 'session.started',
      eventId: EntityId.create('coordinated-3'),
      actionSessionId: result.session.id,
      lifeActionId: lifeAction.id,
    });
    expect(sessionEvent?.occurredAt).toEqual(NOW);

    expect(lifeActionSave).toHaveBeenCalledOnce();
    expect(lifeActionSave).toHaveBeenCalledWith(lifeAction);
    expect(sessionSave).toHaveBeenCalledOnce();
    expect(sessionSave).toHaveBeenCalledWith(result.session);
    expect(lifeActionSave.mock.invocationCallOrder[0]).toBeLessThan(
      sessionSave.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('оставляет in_progress без изменений и сохраняет только новую running-сессию', async () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('in-progress-action', DATE));
    lifeAction.clearUncommittedEvents();
    const initialState = lifeActionState(lifeAction);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const actionSessionRepository = new FakeActionSessionRepository();
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('continued');

    const result = unwrap(
      await new StartLifeActionSession(
        lifeActionRepository,
        actionSessionRepository,
        createOpenDayRepository(),
        new FakeCurrentDateProvider(DATE),
        clock,
        idGenerator,
      ).execute({ lifeActionId: lifeAction.id }),
    );

    expect(result.lifeAction).toBe(lifeAction);
    expect(lifeActionState(result.lifeAction)).toEqual(initialState);
    expect(result.session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(result.session.lifeActionId.equals(lifeAction.id)).toBe(true);
    expect(result.session.startedAt).toEqual(NOW);
    expect(result.session.id.toString()).toBe('continued-1');
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(2);
    expect(lifeActionSave).not.toHaveBeenCalled();
    expect(sessionSave).toHaveBeenCalledOnce();

    const [event] = result.session.getUncommittedEvents();
    expect(event).toBeInstanceOf(ActionSessionStarted);
    expect(event).toMatchObject({
      eventType: 'session.started',
      eventId: EntityId.create('continued-2'),
      actionSessionId: result.session.id,
      lifeActionId: lifeAction.id,
    });
    expect(event?.occurredAt).toEqual(NOW);
  });

  it('возвращает action.not_found до проверки сессий и использования Clock или IdGenerator', async () => {
    const lifeActionRepository = new InMemoryLifeActionRepository();
    const actionSessionRepository = new FakeActionSessionRepository();
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const findUnfinished = vi.spyOn(actionSessionRepository, 'findUnfinished');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      createOpenDayRepository(),
      new FakeCurrentDateProvider(DATE),
      clock,
      idGenerator,
    ).execute({ lifeActionId: EntityId.create('missing-action') });

    expectFailureCode(result, 'action.not_found');
    expect(findUnfinished).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(lifeActionSave).not.toHaveBeenCalled();
    expect(sessionSave).not.toHaveBeenCalled();
  });

  it('запрещает draft, completed и cancelled с action.cannot_start_session без изменений', async () => {
    const forbidden = [
      createLifeActionDraft('draft-action'),
      completeLifeAction(markLifeActionInProgress(createReadyLifeAction('completed-action', DATE))),
      cancelLifeAction(createReadyLifeAction('cancelled-action', DATE)),
    ];

    for (const lifeAction of forbidden) {
      lifeAction.clearUncommittedEvents();
      const initialState = lifeActionState(lifeAction);
      const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
      const actionSessionRepository = new FakeActionSessionRepository();
      const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
      const sessionSave = vi.spyOn(actionSessionRepository, 'save');
      const findUnfinished = vi.spyOn(actionSessionRepository, 'findUnfinished');
      const clock = new FakeClock(NOW);
      const now = vi.spyOn(clock, 'now');
      const idGenerator = new FakeIdGenerator('unused');

      const result = await new StartLifeActionSession(
        lifeActionRepository,
        actionSessionRepository,
        createOpenDayRepository(),
        new FakeCurrentDateProvider(DATE),
        clock,
        idGenerator,
      ).execute({ lifeActionId: lifeAction.id });

      expectFailureCode(result, 'action.cannot_start_session');
      expect(lifeActionState(lifeAction)).toEqual(initialState);
      expect(findUnfinished).not.toHaveBeenCalled();
      expect(now).not.toHaveBeenCalled();
      expect(idGenerator.generatedCount).toBe(0);
      expect(lifeActionSave).not.toHaveBeenCalled();
      expect(sessionSave).not.toHaveBeenCalled();
    }
  });

  it('запрещает архивированное действие с action.unavailable без изменений', async () => {
    const lifeAction = archiveLifeAction(
      completeLifeAction(markLifeActionInProgress(createReadyLifeAction('archived-action', DATE))),
    );
    lifeAction.clearUncommittedEvents();
    const initialState = lifeActionState(lifeAction);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const actionSessionRepository = new FakeActionSessionRepository();
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const findUnfinished = vi.spyOn(actionSessionRepository, 'findUnfinished');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      createOpenDayRepository(),
      new FakeCurrentDateProvider(DATE),
      clock,
      idGenerator,
    ).execute({ lifeActionId: lifeAction.id });

    expectFailureCode(result, 'action.unavailable');
    expect(lifeActionState(lifeAction)).toEqual(initialState);
    expect(findUnfinished).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(lifeActionSave).not.toHaveBeenCalled();
    expect(sessionSave).not.toHaveBeenCalled();
  });

  it.each([
    ['running той же LifeAction', 'running', 'blocked-action'],
    ['paused той же LifeAction', 'paused', 'blocked-action'],
    ['running другой LifeAction', 'running', 'other-action'],
  ] as const)('блокирует запуск при незавершённой сессии: %s', async (_name, status, ownerId) => {
    const lifeAction = createReadyLifeAction('blocked-action', DATE);
    lifeAction.clearUncommittedEvents();
    const initialLifeActionState = lifeActionState(lifeAction);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const existingSession = createStoredSession('unfinished-session', ownerId, status);
    const initialSessionState = actionSessionState(existingSession);
    const actionSessionRepository = new FakeActionSessionRepository();
    await actionSessionRepository.save(existingSession);
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      createOpenDayRepository(),
      new FakeCurrentDateProvider(DATE),
      clock,
      idGenerator,
    ).execute({ lifeActionId: lifeAction.id });

    expectFailureCode(result, 'session.unfinished_exists');
    expect(lifeActionState(lifeAction)).toEqual(initialLifeActionState);
    expect(actionSessionState(existingSession)).toEqual(initialSessionState);
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(lifeActionSave).not.toHaveBeenCalled();
    expect(sessionSave).not.toHaveBeenCalled();
  });

  it('completed-сессия не блокирует новый запуск', async () => {
    const lifeAction = createReadyLifeAction('after-completed-action', DATE);
    lifeAction.clearUncommittedEvents();
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const completedSession = createCompletedStoredSession(
      'completed-session',
      'after-completed-action',
    );
    const initialSessionState = actionSessionState(completedSession);
    const actionSessionRepository = new FakeActionSessionRepository();
    await actionSessionRepository.save(completedSession);

    const result = unwrap(
      await new StartLifeActionSession(
        lifeActionRepository,
        actionSessionRepository,
        createOpenDayRepository(),
        new FakeCurrentDateProvider(DATE),
        new FakeClock(NOW),
        new FakeIdGenerator('after-completed'),
      ).execute({ lifeActionId: lifeAction.id }),
    );

    expect(result.lifeAction.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(result.session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(actionSessionState(completedSession)).toEqual(initialSessionState);
  });

  it('передаёт session.multiple_unfinished_detected без маскировки и побочных эффектов', async () => {
    const lifeAction = createReadyLifeAction('corrupted-storage-action', DATE);
    lifeAction.clearUncommittedEvents();
    const initialState = lifeActionState(lifeAction);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const actionSessionRepository = new FakeActionSessionRepository();
    const repositoryError = new DomainError(
      'session.multiple_unfinished_detected',
      'Обнаружено несколько незавершённых сессий.',
    );
    vi.spyOn(actionSessionRepository, 'findUnfinished').mockRejectedValue(repositoryError);
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      createOpenDayRepository(),
      new FakeCurrentDateProvider(DATE),
      clock,
      idGenerator,
    ).execute({ lifeActionId: lifeAction.id });

    expectFailureCode(result, 'session.multiple_unfinished_detected');
    if (!result.ok) {
      expect(result.error).toBe(repositoryError);
    }
    expect(lifeActionState(lifeAction)).toEqual(initialState);
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(lifeActionSave).not.toHaveBeenCalled();
    expect(sessionSave).not.toHaveBeenCalled();
  });

  it('запрещает запуск сессии до начала дня', async () => {
    const lifeAction = createReadyLifeAction('ready-before-day-start', DATE);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const actionSessionRepository = new FakeActionSessionRepository();
    const dayRepository = new FakeDayRepository();
    dayRepository.seed(
      Day.createCurrentPlanned({
        id: EntityId.create('planned-day'),
        currentDate: DATE,
        occurredAt: NOW,
        createdEventId: EntityId.create('planned-day-created'),
      }),
    );

    const result = await new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      dayRepository,
      new FakeCurrentDateProvider(DATE),
      new FakeClock(NOW),
      new FakeIdGenerator('unused'),
    ).execute({ lifeActionId: lifeAction.id });

    expectFailureCode(result, 'day.not_started');
  });

  it('запрещает запуск действия, запланированного не на текущую дату', async () => {
    const otherDate = DayDate.create('2026-08-03');
    const lifeAction = createReadyLifeAction('future-action', otherDate);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);

    const result = await new StartLifeActionSession(
      lifeActionRepository,
      new FakeActionSessionRepository(),
      createOpenDayRepository(),
      new FakeCurrentDateProvider(DATE),
      new FakeClock(NOW),
      new FakeIdGenerator('unused'),
    ).execute({ lifeActionId: lifeAction.id });

    expectFailureCode(result, 'action.not_scheduled_for_current_day');
  });
});

function createOpenDayRepository(): FakeDayRepository {
  const repository = new FakeDayRepository();
  repository.seed(
    Day.openCurrent({
      id: EntityId.create('current-open-day'),
      currentDate: DATE,
      occurredAt: NOW,
      createdEventId: EntityId.create('current-day-created'),
      openedEventId: EntityId.create('current-day-opened'),
    }),
  );
  return repository;
}

async function lifeActionRepositoryWith(
  lifeAction: LifeAction,
): Promise<InMemoryLifeActionRepository> {
  const repository = new InMemoryLifeActionRepository();
  await repository.save(lifeAction);
  return repository;
}

class FakeActionSessionRepository implements ActionSessionRepository {
  readonly #sessions = new Map<string, ActionSession>();

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessions.get(id.toString()) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return [...this.#sessions.values()].filter((session) =>
      session.lifeActionId.equals(lifeActionId),
    );
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    const unfinishedSessions = [...this.#sessions.values()].filter(
      (session) => session.isRunning() || session.isPaused(),
    );

    if (unfinishedSessions.length > 1) {
      throw new DomainError(
        'session.multiple_unfinished_detected',
        'Обнаружено несколько незавершённых сессий.',
      );
    }

    return unfinishedSessions[0] ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    this.#sessions.set(session.id.toString(), session);
  }
}

function createStoredSession(
  sessionId: string,
  lifeActionId: string,
  status: 'running' | 'paused',
): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create(sessionId),
    lifeActionId: EntityId.create(lifeActionId),
    startedAt: EXISTING_STARTED_AT,
    eventId: EntityId.create(`${sessionId}-started-event`),
  });

  if (status === 'paused') {
    session.pause(EXISTING_PAUSED_AT, EntityId.create(`${sessionId}-paused-event`));
  }

  session.clearUncommittedEvents();
  return session;
}

function createCompletedStoredSession(sessionId: string, lifeActionId: string): ActionSession {
  const session = createStoredSession(sessionId, lifeActionId, 'running');
  session.complete({
    completedAt: EXISTING_COMPLETED_AT,
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: EntityId.create(`${sessionId}-completed-event`),
  });
  session.clearUncommittedEvents();
  return session;
}

function lifeActionState(lifeAction: LifeAction): object {
  return {
    status: lifeAction.status,
    version: lifeAction.version,
    startedAt: lifeAction.startedAt,
    completedAt: lifeAction.completedAt,
    cancelledAt: lifeAction.cancelledAt,
    archivedAt: lifeAction.archivedAt,
    events: lifeAction.getUncommittedEvents(),
  };
}

function actionSessionState(session: ActionSession): object {
  return {
    status: session.status,
    version: session.version,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    completedAt: session.completedAt,
    completionKind: session.completionKind,
    resultNote: session.resultNote,
    pauseIntervals: session.pauseIntervals,
    events: session.getUncommittedEvents(),
  };
}

function unwrap(
  result: Result<StartLifeActionSessionResult, DomainError>,
): StartLifeActionSessionResult {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectFailureCode(
  result: Result<StartLifeActionSessionResult, DomainError>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
