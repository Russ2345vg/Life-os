import { describe, expect, it } from 'vitest';
import {
  ActionActualResult,
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../domain';
import { createPlannedDecision, confirmDecision } from '../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../test/helpers/LifeActionTestFactory';
import {
  createDecisionLifecycle,
  createDecisionOverviewPresentation,
  decisionOutcomeLabel,
} from './decisionOverviewPresentation';

const DATE = DayDate.create('2026-08-05');
const NOW = new Date('2026-08-05T12:00:00.000Z');

function createCompletedSession(id: string, lifeActionId: EntityId): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt: new Date('2026-08-05T10:00:00.000Z'),
    eventId: EntityId.create(`${id}-start`),
  });
  session.complete({
    completedAt: new Date('2026-08-05T10:45:00.000Z'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    resultNote: SessionResultNote.create('Сессия завершена'),
    eventId: EntityId.create(`${id}-complete`),
  });
  return session;
}

describe('decision overview presentation', () => {
  it('calculates action, session, and worked-time totals', () => {
    const decision = createPlannedDecision('metrics', DATE);
    const completed = completeLifeAction(
      createReadyLifeAction('completed', DATE, { decisionId: decision.id }),
    );
    const active = markLifeActionInProgress(
      createReadyLifeAction('active', DATE, { decisionId: decision.id }),
    );
    const completedSession = createCompletedSession('completed-session', completed.id);
    const runningSession = ActionSession.start({
      id: EntityId.create('running-session'),
      lifeActionId: active.id,
      startedAt: new Date('2026-08-05T11:30:00.000Z'),
      eventId: EntityId.create('running-session-start'),
    });

    const view = createDecisionOverviewPresentation(
      {
        decision,
        actions: [
          { lifeAction: completed, sessions: [completedSession] },
          { lifeAction: active, sessions: [runningSession] },
        ],
      },
      NOW,
    );

    expect(view.actionCount).toBe(2);
    expect(view.completedActionCount).toBe(1);
    expect(view.unfinishedActionCount).toBe(1);
    expect(view.sessionCount).toBe(2);
    expect(view.completedSessionCount).toBe(1);
    expect(view.workedDurationMs).toBe(75 * 60_000);
    expect(view.actions[0]?.workedDurationMs).toBe(45 * 60_000);
    expect(view.actions[1]?.workedDurationMs).toBe(30 * 60_000);
  });

  it('creates an ordered lifecycle from persisted decision timestamps', () => {
    const decision = confirmDecision(createPlannedDecision('timeline', DATE));

    expect(createDecisionLifecycle(decision).map((entry) => entry.key)).toEqual([
      'created',
      'planned',
      'started',
      'confirmed',
    ]);
    expect(decisionOutcomeLabel(decision)).toBe('Результат подтверждён');
  });

  it('показывает мягкое удаление и восстановление в жизненном цикле', () => {
    const decision = createPlannedDecision('trash-timeline', DATE);
    decision.softDelete(
      new Date('2026-08-05T18:00:00.000Z'),
      EntityId.create('trash-timeline-deleted'),
    );
    decision.restoreFromTrash(
      new Date('2026-08-05T18:10:00.000Z'),
      EntityId.create('trash-timeline-restored'),
    );

    expect(createDecisionLifecycle(decision).map((entry) => entry.key)).toEqual([
      'created',
      'planned',
      'deleted',
      'restored-from-trash',
    ]);
  });

  it('uses the actual result from a completed action in its linked action data', () => {
    const decision = createPlannedDecision('actual-result', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('actual-result-action', DATE, { decisionId: decision.id }),
    );
    action.complete(
      ActionActualResult.create('Получен измеримый результат'),
      new Date('2026-08-05T11:00:00.000Z'),
      EntityId.create('actual-result-completed'),
    );

    const view = createDecisionOverviewPresentation(
      { decision, actions: [{ lifeAction: action, sessions: [] }] },
      NOW,
    );

    expect(view.actions[0]?.lifeAction.actualResult?.toString()).toBe(
      'Получен измеримый результат',
    );
  });
});
