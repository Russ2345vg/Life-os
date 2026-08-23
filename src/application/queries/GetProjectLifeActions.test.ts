import { describe, expect, it, vi } from 'vitest';
import { ActionSession, DayDate, EntityId, Project, SESSION_COMPLETION_KIND } from '../../domain';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import {
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
} from '../../test/helpers/DecisionTestFactory';
import { GetProjectLifeActions, PROJECT_HISTORY_EVENT_KIND } from './GetProjectLifeActions';

describe('GetProjectLifeActions', () => {
  it('builds project history and summary from linked entities', async () => {
    const project = Project.create({
      id: EntityId.create('project-query'),
      title: 'Релиз LifeOS',
      now: new Date('2026-08-01T00:00:00.000Z'),
    }).pause(new Date('2026-08-02T00:00:00.000Z'));
    const confirmedDecision = confirmDecision(
      createPlannedDecision('decision-1', DayDate.create('2026-08-01'), undefined, 1, project.id),
    );
    const draftDecision = createDecisionDraft('decision-2', undefined, project.id);
    const completedAction = completeLifeAction(
      createReadyLifeAction('action-1', DayDate.create('2026-08-01'), {
        decisionId: confirmedDecision.id,
      }),
    );
    const readyAction = createReadyLifeAction('action-2', DayDate.create('2026-08-02'), {
      decisionId: draftDecision.id,
    });
    const session = completedSession(completedAction.id);
    const findByProjectId = vi.fn().mockResolvedValue([confirmedDecision, draftDecision]);
    const findByDecisionIds = vi.fn().mockResolvedValue([readyAction, completedAction]);
    const findByLifeActionIds = vi.fn().mockResolvedValue([session]);
    const findById = vi.fn().mockResolvedValue(project);
    const query = new GetProjectLifeActions(
      { findByProjectId },
      { findByDecisionIds },
      { findByLifeActionIds },
      { findById },
    );

    const result = await query.execute(project.id);

    expect(result.summary).toEqual({
      decisionCount: 2,
      completedLifeActionCount: 1,
      completedActionSessionCount: 1,
      totalActionDurationMs: 45 * 60_000,
    });
    expect(result.history.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        PROJECT_HISTORY_EVENT_KIND.projectStatusChanged,
        PROJECT_HISTORY_EVENT_KIND.actionSessionCompleted,
        PROJECT_HISTORY_EVENT_KIND.lifeActionCompleted,
        PROJECT_HISTORY_EVENT_KIND.decisionConfirmed,
        PROJECT_HISTORY_EVENT_KIND.decisionCreated,
        PROJECT_HISTORY_EVENT_KIND.projectCreated,
      ]),
    );
    expect(result.history).toHaveLength(7);
    expect(
      result.history.every(
        (event, index) =>
          index === 0 ||
          result.history[index - 1]!.occurredAt.getTime() >= event.occurredAt.getTime(),
      ),
    ).toBe(true);
    expect(result.lifeActions).toEqual([completedAction, readyAction]);
    expect(findByProjectId).toHaveBeenCalledOnce();
    expect(findByDecisionIds).toHaveBeenCalledOnce();
    expect(findByLifeActionIds).toHaveBeenCalledOnce();
    expect(findById).toHaveBeenCalledOnce();
  });

  it('does not query linked collections when the project has no decisions', async () => {
    const findByDecisionIds = vi.fn();
    const findByLifeActionIds = vi.fn();
    const query = new GetProjectLifeActions(
      { findByProjectId: vi.fn().mockResolvedValue([]) },
      { findByDecisionIds },
      { findByLifeActionIds },
      { findById: vi.fn().mockResolvedValue(null) },
    );

    await expect(query.execute(EntityId.create('empty-project'))).resolves.toEqual({
      decisions: [],
      lifeActions: [],
      history: [],
      summary: {
        decisionCount: 0,
        completedLifeActionCount: 0,
        completedActionSessionCount: 0,
        totalActionDurationMs: 0,
      },
    });
    expect(findByDecisionIds).not.toHaveBeenCalled();
    expect(findByLifeActionIds).not.toHaveBeenCalled();
  });
});

function completedSession(lifeActionId: EntityId): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create('session-1'),
    lifeActionId,
    startedAt: new Date('2026-08-01T10:00:00.000Z'),
    eventId: EntityId.create('session-started'),
  });
  session.pause(new Date('2026-08-01T10:30:00.000Z'), EntityId.create('session-paused'));
  session.resume(new Date('2026-08-01T10:45:00.000Z'), EntityId.create('session-resumed'));
  session.complete({
    completedAt: new Date('2026-08-01T11:00:00.000Z'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: EntityId.create('session-completed'),
  });
  return session;
}
