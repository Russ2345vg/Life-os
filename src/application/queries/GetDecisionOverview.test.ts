import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
  type Decision,
  type LifeAction,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { GetDecisionOverview } from './GetDecisionOverview';

const DATE = DayDate.create('2026-08-05');

function createSession(id: string, lifeActionId: EntityId, startedAt: string): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt: new Date(startedAt),
    eventId: EntityId.create(`${id}-started`),
  });
}

describe('GetDecisionOverview', () => {
  it('returns the decision, ordered linked actions, and ordered sessions without saving', async () => {
    const decision = createPlannedDecision('overview', DATE);
    const laterAction = createReadyLifeAction('later', DATE, {
      decisionId: decision.id,
      createdAt: new Date('2026-08-05T10:00:00.000Z'),
    });
    const earlierAction = createReadyLifeAction('earlier', DATE, {
      decisionId: decision.id,
      createdAt: new Date('2026-08-05T08:00:00.000Z'),
    });
    const laterSession = createSession(
      'later-session',
      earlierAction.id,
      '2026-08-05T09:00:00.000Z',
    );
    const earlierSession = createSession(
      'earlier-session',
      earlierAction.id,
      '2026-08-05T08:30:00.000Z',
    );
    earlierSession.complete({
      completedAt: new Date('2026-08-05T08:50:00.000Z'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: SessionResultNote.create('Результат сессии'),
      eventId: EntityId.create('earlier-session-completed'),
    });
    const decisionRepository = new FakeDecisionRepository([decision]);
    const actionRepository = new FakeLifeActionRepository([laterAction, earlierAction]);
    const sessionRepository = new FakeActionSessionRepository([laterSession, earlierSession]);
    const decisionSave = vi.spyOn(decisionRepository, 'save');
    const actionSave = vi.spyOn(actionRepository, 'save');
    const sessionSave = vi.spyOn(sessionRepository, 'save');
    const findAllSessions = vi.spyOn(sessionRepository, 'findAll');
    const findSessionsByAction = vi.spyOn(sessionRepository, 'findByLifeActionId');

    const result = await new GetDecisionOverview(
      decisionRepository,
      actionRepository,
      sessionRepository,
    ).execute(decision.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decision).toBe(decision);
      expect(result.value.actions.map((entry) => entry.lifeAction.id.toString())).toEqual([
        'earlier',
        'later',
      ]);
      expect(result.value.actions[0]?.sessions.map((session) => session.id.toString())).toEqual([
        'earlier-session',
        'later-session',
      ]);
      expect(result.value.actions[1]?.sessions).toEqual([]);
    }
    expect(decisionSave).not.toHaveBeenCalled();
    expect(actionSave).not.toHaveBeenCalled();
    expect(sessionSave).not.toHaveBeenCalled();
    expect(findAllSessions).toHaveBeenCalledTimes(1);
    expect(findSessionsByAction).not.toHaveBeenCalled();
  });

  it('returns decision.not_found and does not read actions for an unknown decision', async () => {
    const decisions = new FakeDecisionRepository([]);
    const actions = new FakeLifeActionRepository([]);
    const sessions = new FakeActionSessionRepository([]);
    const findActions = vi.spyOn(actions, 'findByDecisionId');

    const result = await new GetDecisionOverview(decisions, actions, sessions).execute(
      EntityId.create('missing-decision'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('decision.not_found');
    }
    expect(findActions).not.toHaveBeenCalled();
  });
});

class FakeDecisionRepository implements DecisionRepository {
  readonly #decisions: readonly Decision[];

  public constructor(decisions: readonly Decision[]) {
    this.#decisions = decisions;
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decisions.find((decision) => decision.id.equals(id)) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return this.#decisions.filter((decision) => decision.isScheduledFor(date));
  }

  public async save(decision: Decision): Promise<void> {
    void decision;
  }
}

class FakeLifeActionRepository implements LifeActionRepository {
  readonly #actions: readonly LifeAction[];

  public constructor(actions: readonly LifeAction[]) {
    this.#actions = actions;
  }

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#actions.find((action) => action.id.equals(id)) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return this.#actions.filter((action) => action.isScheduledFor(date));
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return this.#actions.filter((action) => action.decisionId?.equals(decisionId));
  }

  public async save(action: LifeAction): Promise<void> {
    void action;
  }
}

class FakeActionSessionRepository implements ActionSessionRepository {
  readonly #sessions: readonly ActionSession[];

  public constructor(sessions: readonly ActionSession[]) {
    this.#sessions = sessions;
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessions.find((session) => session.id.equals(id)) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return this.#sessions.filter((session) => session.lifeActionId.equals(lifeActionId));
  }

  public async findAll(): Promise<readonly ActionSession[]> {
    return this.#sessions;
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return this.#sessions.find((session) => !session.isCompleted()) ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    void session;
  }
}
