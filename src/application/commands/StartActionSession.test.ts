import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSessionStarted,
  DayDate,
  EntityId,
  type ActionSession,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { StartActionSession } from './StartActionSession';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T10:30:00.000+09:00');

describe('StartActionSession', () => {
  it('создаёт и сохраняет running-сессию для in_progress с Clock и двумя идентификаторами', async () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('action-progress', DATE));
    lifeAction.clearUncommittedEvents();
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const actionSessionRepository = new FakeActionSessionRepository();
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('session');
    const initialVersion = lifeAction.version;
    const initialStartedAt = lifeAction.startedAt;

    const result = await new StartActionSession(
      actionSessionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    ).execute({ lifeActionId: lifeAction.id });
    const session = unwrap(result);

    expect(session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(session.lifeActionId.equals(lifeAction.id)).toBe(true);
    expect(session.startedAt).toEqual(NOW);
    expect(session.id.toString()).toBe('session-1');
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(2);
    expect(sessionSave).toHaveBeenCalledOnce();
    expect(sessionSave).toHaveBeenCalledWith(session);
    await expect(actionSessionRepository.findById(session.id)).resolves.toBe(session);

    const [event] = session.getUncommittedEvents();
    expect(session.getUncommittedEvents()).toHaveLength(1);
    expect(event).toBeInstanceOf(ActionSessionStarted);
    expect(event).toMatchObject({
      eventType: 'session.started',
      eventId: EntityId.create('session-2'),
      actionSessionId: session.id,
      lifeActionId: lifeAction.id,
    });
    expect(event?.occurredAt).toEqual(NOW);

    expect(lifeAction.status).toBe('in_progress');
    expect(lifeAction.version).toBe(initialVersion);
    expect(lifeAction.startedAt).toEqual(initialStartedAt);
    expect(lifeAction.getUncommittedEvents()).toEqual([]);
    expect(lifeActionSave).not.toHaveBeenCalled();
  });

  it('возвращает action.not_found без сохранения и использования Clock или IdGenerator', async () => {
    const lifeActionRepository = new FakeLifeActionRepository();
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const actionSessionRepository = new FakeActionSessionRepository();
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartActionSession(
      actionSessionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    ).execute({ lifeActionId: EntityId.create('missing-action') });

    expectFailureCode(result, 'action.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(sessionSave).not.toHaveBeenCalled();
    expect(lifeActionSave).not.toHaveBeenCalled();
  });

  it('запрещает draft, ready, completed и cancelled без сохранения и изменения LifeAction', async () => {
    const forbidden = [
      createLifeActionDraft('action-draft'),
      createReadyLifeAction('action-ready', DATE),
      completeLifeAction(markLifeActionInProgress(createReadyLifeAction('action-completed', DATE))),
      cancelLifeAction(createReadyLifeAction('action-cancelled', DATE)),
    ];

    for (const lifeAction of forbidden) {
      lifeAction.clearUncommittedEvents();
      const initialState = lifeActionState(lifeAction);
      const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
      const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
      const actionSessionRepository = new FakeActionSessionRepository();
      const sessionSave = vi.spyOn(actionSessionRepository, 'save');
      const clock = new FakeClock(NOW);
      const now = vi.spyOn(clock, 'now');
      const idGenerator = new FakeIdGenerator('unused');

      const result = await new StartActionSession(
        actionSessionRepository,
        lifeActionRepository,
        clock,
        idGenerator,
      ).execute({ lifeActionId: lifeAction.id });

      expectFailureCode(result, 'session.action_not_in_progress');
      expect(lifeActionState(lifeAction)).toEqual(initialState);
      expect(now).not.toHaveBeenCalled();
      expect(idGenerator.generatedCount).toBe(0);
      expect(sessionSave).not.toHaveBeenCalled();
      expect(lifeActionSave).not.toHaveBeenCalled();
    }
  });

  it('запрещает архивированное действие с session.action_unavailable без сохранения', async () => {
    const lifeAction = archiveLifeAction(
      completeLifeAction(markLifeActionInProgress(createReadyLifeAction('action-archived', DATE))),
    );
    lifeAction.clearUncommittedEvents();
    const initialState = lifeActionState(lifeAction);
    const lifeActionRepository = await lifeActionRepositoryWith(lifeAction);
    const lifeActionSave = vi.spyOn(lifeActionRepository, 'save');
    const actionSessionRepository = new FakeActionSessionRepository();
    const sessionSave = vi.spyOn(actionSessionRepository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartActionSession(
      actionSessionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    ).execute({ lifeActionId: lifeAction.id });

    expectFailureCode(result, 'session.action_unavailable');
    expect(lifeActionState(lifeAction)).toEqual(initialState);
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(sessionSave).not.toHaveBeenCalled();
    expect(lifeActionSave).not.toHaveBeenCalled();
  });
});

async function lifeActionRepositoryWith(lifeAction: LifeAction): Promise<FakeLifeActionRepository> {
  const repository = new FakeLifeActionRepository();
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

  public async save(session: ActionSession): Promise<void> {
    this.#sessions.set(session.id.toString(), session);
  }
}

class FakeLifeActionRepository implements LifeActionRepository {
  readonly #lifeActions = new Map<string, LifeAction>();

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#lifeActions.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return [...this.#lifeActions.values()].filter((lifeAction) => lifeAction.isScheduledFor(date));
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return [...this.#lifeActions.values()].filter((lifeAction) =>
      lifeAction.decisionId?.equals(decisionId),
    );
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    this.#lifeActions.set(lifeAction.id.toString(), lifeAction);
  }
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
