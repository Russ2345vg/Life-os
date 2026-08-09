import { describe, expect, it } from 'vitest';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import {
  ActionSession,
  DayDate,
  DECISION_KIND,
  EntityId,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { InMemoryDecisionRepository, InMemoryLifeActionRepository } from '../../infrastructure';
import { FakeClock } from '../../test/helpers/Fakes';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { ACTION_LIST_GROUP, GetActionListsForDate } from './GetActionListsForDate';

const DATE = DayDate.create('2026-08-06');
const NOW = new Date('2026-08-06T12:00:00.000+09:00');

function createQuery() {
  const lifeActions = new InMemoryLifeActionRepository();
  const decisions = new InMemoryDecisionRepository();
  const sessions = new FakeActionSessionRepository();
  const clock = new FakeClock(NOW);

  return {
    lifeActions,
    decisions,
    sessions,
    clock,
    query: new GetActionListsForDate(lifeActions, decisions, sessions, clock),
  };
}

describe('GetActionListsForDate', () => {
  it('собирает пять взаимоисключающих списков с решением, сессиями и временем', async () => {
    const context = createQuery();
    const decision = createPlannedDecision('main', DATE, DECISION_KIND.main, 1);
    decision.updateDetails({
      sphereId: EntityId.create('sphere-work'),
      occurredAt: at('08:05'),
      eventId: EntityId.create('main-sphere-updated'),
    });
    const active = markLifeActionInProgress(
      createReadyLifeAction('active', DATE, {
        decisionId: decision.id,
        sphereId: EntityId.create('sphere-work'),
        createdAt: at('08:00'),
      }),
    );
    const paused = markLifeActionInProgress(
      createReadyLifeAction('paused', DATE, { createdAt: at('08:30') }),
    );
    const ready = createReadyLifeAction('ready', DATE, { createdAt: at('09:00') });
    const completed = completeLifeAction(
      createReadyLifeAction('completed', DATE, { createdAt: at('09:30') }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled', DATE, { createdAt: at('10:00') }),
    );
    const archived = archiveLifeAction(
      completeLifeAction(createReadyLifeAction('archived', DATE, { createdAt: at('10:30') })),
    );
    const pausedSession = ActionSession.start({
      id: EntityId.create('paused-session'),
      lifeActionId: paused.id,
      startedAt: at('10:00'),
      eventId: EntityId.create('paused-session-started'),
    });
    pausedSession.pause(at('10:30'), EntityId.create('paused-session-paused'));
    const completedSession = ActionSession.start({
      id: EntityId.create('completed-session'),
      lifeActionId: completed.id,
      startedAt: at('07:00'),
      eventId: EntityId.create('completed-session-started'),
    });
    completedSession.complete({
      completedAt: at('07:45'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: EntityId.create('completed-session-completed'),
    });

    await context.decisions.save(decision);
    await Promise.all(
      [active, paused, ready, completed, cancelled, archived].map((action) =>
        context.lifeActions.save(action),
      ),
    );
    await context.sessions.save(pausedSession);
    await context.sessions.save(completedSession);

    const snapshot = await context.query.execute(DATE);

    expect(snapshot.items.map((item) => [item.lifeAction.id.toString(), item.group])).toEqual([
      ['active', ACTION_LIST_GROUP.active],
      ['paused', ACTION_LIST_GROUP.paused],
      ['ready', ACTION_LIST_GROUP.ready],
      ['completed', ACTION_LIST_GROUP.completed],
      ['cancelled', ACTION_LIST_GROUP.cancelled],
    ]);
    expect(snapshot.items[0]?.decisionTitle).toBe('Решение main');
    expect(snapshot.items[0]?.sphereId).toBe('sphere-work');
    expect(snapshot.items[1]?.unfinishedSession).toBe(pausedSession);
    expect(snapshot.items[1]?.totalWorkedDurationMs).toBe(30 * 60_000);
    expect(snapshot.items[3]?.completedSessionCount).toBe(1);
    expect(snapshot.items[3]?.totalWorkedDurationMs).toBe(45 * 60_000);
  });

  it('помещает действие с выполняющейся сессией в активный список', async () => {
    const context = createQuery();
    const action = markLifeActionInProgress(createReadyLifeAction('running', DATE));
    const session = ActionSession.start({
      id: EntityId.create('running-session'),
      lifeActionId: action.id,
      startedAt: at('11:15'),
      eventId: EntityId.create('running-session-started'),
    });
    await context.lifeActions.save(action);
    await context.sessions.save(session);

    const snapshot = await context.query.execute(DATE);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.group).toBe(ACTION_LIST_GROUP.active);
    expect(snapshot.items[0]?.unfinishedSession).toBe(session);
    expect(snapshot.items[0]?.totalWorkedDurationMs).toBe(45 * 60_000);
  });

  it('сохраняет стабильный порядок по времени создания и идентификатору', async () => {
    const context = createQuery();
    const second = createReadyLifeAction('b', DATE, { createdAt: at('08:00') });
    const first = createReadyLifeAction('a', DATE, { createdAt: at('08:00') });
    await context.lifeActions.save(second);
    await context.lifeActions.save(first);

    const snapshot = await context.query.execute(DATE);

    expect(snapshot.items.map((item) => item.lifeAction.id.toString())).toEqual(['a', 'b']);
  });

  it('возвращает новый снимок при повторном чтении и не изменяет сущности', async () => {
    const context = createQuery();
    const action = createReadyLifeAction('ready', DATE);
    await context.lifeActions.save(action);
    const initialVersion = action.version;

    const first = await context.query.execute(DATE);
    const second = await context.query.execute(DATE);

    expect(first).not.toBe(second);
    expect(first.items).not.toBe(second.items);
    expect(action.version).toBe(initialVersion);
    expect(action.getUncommittedEvents()).toHaveLength(2);
  });
});

function at(time: string): Date {
  return new Date(`2026-08-06T${time}:00.000+09:00`);
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
    return (
      [...this.#sessions.values()].find((session) => session.isRunning() || session.isPaused()) ??
      null
    );
  }

  public async save(session: ActionSession): Promise<void> {
    this.#sessions.set(session.id.toString(), session);
  }
}
