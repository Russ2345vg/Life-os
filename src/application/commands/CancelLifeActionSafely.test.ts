import { describe, expect, it } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  DayDate,
  EntityId,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { CancelLifeActionSafely } from './CancelLifeActionSafely';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T13:00:00.000+09:00');

describe('CancelLifeActionSafely', () => {
  it('отменяет ready-действие без сессий и сохраняет его один раз', async () => {
    const action = createReadyLifeAction('ready-cancel', DATE, {
      decisionId: EntityId.create('decision-preserved'),
    });
    const decisionId = action.decisionId;
    action.clearUncommittedEvents();
    const context = createContext(action, []);
    const version = action.version;

    const result = await context.command.execute({ lifeActionId: action.id });

    expect(result.ok).toBe(true);
    expect(action.status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect(action.cancelledAt).toEqual(NOW);
    expect(action.cancelReason?.toString()).toBe('Отменено пользователем');
    expect(action.decisionId).toBe(decisionId);
    expect(action.version).toBe(version + 1);
    expect(context.lifeActionRepository.saveCount).toBe(1);
    expect(action.getUncommittedEvents()).toHaveLength(1);
    expect(action.getUncommittedEvents()[0]).toMatchObject({
      eventType: 'action.cancelled',
      eventId: EntityId.create('safe-cancel-event-1'),
    });
  });

  it('отменяет in_progress-действие после одной или нескольких completed-сессий', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('progress-cancel', DATE));
    const sessions = [completedSession('done-1', action), completedSession('done-2', action)];
    const versions = sessions.map((session) => session.version);
    const context = createContext(action, sessions);

    const result = await context.command.execute({ lifeActionId: action.id });

    expect(result.ok).toBe(true);
    expect(action.status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect(sessions.map((session) => session.version)).toEqual(versions);
    expect(context.actionSessionRepository.saveCount).toBe(0);
  });

  it.each([
    ['running', (action: LifeAction) => createSession('running', action)],
    ['paused', (action: LifeAction) => pausedSession('paused', action)],
  ])('%s-сессия блокирует отмену без изменений', async (_label, createBlockingSession) => {
    const action = markLifeActionInProgress(createReadyLifeAction(`blocked-${_label}`, DATE));
    const session = createBlockingSession(action);
    const actionVersion = action.version;
    const sessionVersion = session.version;
    const context = createContext(action, [session]);

    const result = await context.command.execute({ lifeActionId: action.id });

    expectFailure(result, 'action.session_unfinished');
    expect(action.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(action.version).toBe(actionVersion);
    expect(session.version).toBe(sessionVersion);
    expect(context.lifeActionRepository.saveCount).toBe(0);
    expect(context.actionSessionRepository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('сессия другого действия не блокирует отмену', async () => {
    const action = createReadyLifeAction('target', DATE);
    const foreign = createSession('foreign', createReadyLifeAction('foreign-action', DATE));
    const context = createContext(action, [foreign]);

    const result = await context.command.execute({ lifeActionId: action.id });

    expect(result.ok).toBe(true);
  });

  it('возвращает action.not_found', async () => {
    const context = createContext(null, []);
    const result = await context.command.execute({ lifeActionId: EntityId.create('missing') });
    expectFailure(result, 'action.not_found');
  });

  it.each([
    ['draft', createLifeActionDraft('draft-cancel')],
    ['completed', completeLifeAction(createReadyLifeAction('completed-cancel', DATE))],
    ['cancelled', cancelLifeAction(createReadyLifeAction('cancelled-again', DATE))],
    [
      'archived',
      archiveLifeAction(completeLifeAction(createReadyLifeAction('archived-cancel', DATE))),
    ],
  ])('запрещает отмену %s-действия без повторного события и сохранения', async (_label, action) => {
    const context = createContext(action, []);
    const eventCount = action.getUncommittedEvents().length;
    const result = await context.command.execute({ lifeActionId: action.id });

    expectFailure(result, 'action.cannot_cancel');
    expect(action.getUncommittedEvents()).toHaveLength(eventCount);
    expect(context.lifeActionRepository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });
});

function createSession(id: string, action: LifeAction): ActionSession {
  return ActionSession.start({
    id: EntityId.create(`${id}-session`),
    lifeActionId: action.id,
    startedAt: new Date('2026-08-02T09:00:00.000+09:00'),
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function pausedSession(id: string, action: LifeAction): ActionSession {
  const session = createSession(id, action);
  session.pause(new Date('2026-08-02T09:10:00.000+09:00'), EntityId.create(`${id}-paused-event`));
  expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
  return session;
}

function completedSession(id: string, action: LifeAction): ActionSession {
  const session = createSession(id, action);
  session.complete({
    completedAt: new Date('2026-08-02T09:30:00.000+09:00'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: EntityId.create(`${id}-completed-event`),
  });
  return session;
}

function createContext(action: LifeAction | null, sessions: readonly ActionSession[]) {
  const lifeActionRepository = new TrackingLifeActionRepository(action);
  const actionSessionRepository = new TrackingActionSessionRepository(sessions);
  const idGenerator = new FakeIdGenerator('safe-cancel-event');
  return {
    lifeActionRepository,
    actionSessionRepository,
    idGenerator,
    command: new CancelLifeActionSafely(
      lifeActionRepository,
      actionSessionRepository,
      new FakeClock(NOW),
      idGenerator,
    ),
  };
}

class TrackingLifeActionRepository implements LifeActionRepository {
  readonly #action: LifeAction | null;
  public saveCount = 0;

  public constructor(action: LifeAction | null) {
    this.#action = action;
  }

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#action?.id.equals(id) ? this.#action : null;
  }

  public async findByDate(): Promise<readonly LifeAction[]> {
    return this.#action === null ? [] : [this.#action];
  }

  public async findByDecisionId(): Promise<readonly LifeAction[]> {
    return this.#action === null ? [] : [this.#action];
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

class TrackingActionSessionRepository implements ActionSessionRepository {
  readonly #sessions: readonly ActionSession[];
  public saveCount = 0;

  public constructor(sessions: readonly ActionSession[]) {
    this.#sessions = sessions;
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessions.find((session) => session.id.equals(id)) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return this.#sessions.filter((session) => session.lifeActionId.equals(lifeActionId));
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return this.#sessions.find((session) => !session.isCompleted()) ?? null;
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

function expectFailure(
  result: Awaited<ReturnType<CancelLifeActionSafely['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
