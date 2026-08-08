import { describe, expect, it } from 'vitest';
import type { ActionSessionRepository, DecisionRepository, LifeActionRepository } from '../index';
import {
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
  type Decision,
  type LifeAction,
} from '../../domain';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
} from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { GetHistoryForDateRange } from './GetHistoryForDateRange';

const DATE = DayDate.create('2026-08-01');

function createCompletedSession(action: LifeAction, id: string, completedAt: Date): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: action.id,
    startedAt: new Date(completedAt.getTime() - 45 * 60_000),
    eventId: EntityId.create(`${id}-start`),
  });
  session.complete({
    completedAt,
    completionKind: SESSION_COMPLETION_KIND.completed,
    resultNote: SessionResultNote.create('Сессия завершена'),
    eventId: EntityId.create(`${id}-complete`),
  });
  return session;
}

describe('GetHistoryForDateRange', () => {
  it('возвращает только финальные решения, действия и завершённые сессии диапазона', async () => {
    const planned = createPlannedDecision('planned', DATE);
    const confirmed = confirmDecision(createPlannedDecision('confirmed', DATE));
    const cancelledDecision = cancelDecision(createPlannedDecision('cancelled', DATE));
    const ready = createReadyLifeAction('ready', DATE);
    const completed = completeLifeAction(createReadyLifeAction('completed', DATE));
    const cancelledAction = cancelLifeAction(createReadyLifeAction('cancelled-action', DATE));
    const completedSession = createCompletedSession(
      completed,
      'session-completed',
      new Date('2026-08-01T10:00:00.000+09:00'),
    );
    const runningSession = ActionSession.start({
      id: EntityId.create('session-running'),
      lifeActionId: ready.id,
      startedAt: new Date('2026-08-01T11:00:00.000+09:00'),
      eventId: EntityId.create('session-running-start'),
    });
    const query = new GetHistoryForDateRange(
      createDecisionRepository([planned, confirmed, cancelledDecision]),
      createLifeActionRepository([ready, completed, cancelledAction]),
      createSessionRepository([completedSession, runningSession]),
    );

    const result = await query.execute({ startDate: DATE, endDate: DATE });

    expect(result.decisions.map((item) => item.id.toString())).toEqual(['confirmed', 'cancelled']);
    expect(result.lifeActions.map((item) => item.id.toString())).toEqual([
      'completed',
      'cancelled-action',
    ]);
    expect(result.actionSessions).toHaveLength(1);
    expect(result.actionSessions[0]?.session.id.toString()).toBe('session-completed');
    expect(result.actionSessions[0]?.lifeAction.id.toString()).toBe('completed');
  });

  it('исключает события за пределами диапазона', async () => {
    const completed = completeLifeAction(createReadyLifeAction('completed', DATE));
    const session = createCompletedSession(
      completed,
      'session-completed',
      new Date('2026-08-01T10:00:00.000+09:00'),
    );
    const query = new GetHistoryForDateRange(
      createDecisionRepository([]),
      createLifeActionRepository([completed]),
      createSessionRepository([session]),
    );

    const result = await query.execute({
      startDate: DayDate.create('2026-08-02'),
      endDate: DayDate.create('2026-08-04'),
    });

    expect(result.decisions).toEqual([]);
    expect(result.lifeActions).toEqual([]);
    expect(result.actionSessions).toEqual([]);
  });

  it('запрещает обратный и слишком большой диапазон', async () => {
    const query = new GetHistoryForDateRange(
      createDecisionRepository([]),
      createLifeActionRepository([]),
      createSessionRepository([]),
    );

    await expect(
      query.execute({
        startDate: DayDate.create('2026-08-04'),
        endDate: DayDate.create('2026-08-01'),
      }),
    ).rejects.toMatchObject({ code: 'history.invalid_date_range' });

    await expect(
      query.execute({
        startDate: DayDate.create('2026-07-01'),
        endDate: DayDate.create('2026-08-04'),
      }),
    ).rejects.toMatchObject({ code: 'history.date_range_too_large' });
  });
});

function createDecisionRepository(decisions: readonly Decision[]): DecisionRepository {
  return {
    findById: async () => null,
    findByDate: async () => [],
    findAll: async () => decisions,
    save: async () => undefined,
  };
}

function createLifeActionRepository(actions: readonly LifeAction[]): LifeActionRepository {
  return {
    findById: async () => null,
    findByDate: async () => [],
    findByDecisionId: async () => [],
    findAll: async () => actions,
    save: async () => undefined,
  };
}

function createSessionRepository(sessions: readonly ActionSession[]): ActionSessionRepository {
  return {
    findById: async () => null,
    findByLifeActionId: async () => [],
    findUnfinished: async () => null,
    findAll: async () => sessions,
    save: async () => undefined,
  };
}
