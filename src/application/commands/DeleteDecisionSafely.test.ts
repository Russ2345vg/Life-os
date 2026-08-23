import { describe, expect, it } from 'vitest';
import { ActionSession, DayDate, EntityId, type Decision, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import {
  archiveDecision,
  confirmDecision,
  createPlannedDecision,
} from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  TestActionSessionRepository,
  TestDecisionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import { DeleteDecisionSafely } from './DeleteDecisionSafely';

const DATE = DayDate.create('2026-08-06');
const NOW = new Date('2026-08-06T20:00:00.000+09:00');

describe('DeleteDecisionSafely', () => {
  it('перемещает решение в корзину с проверкой версии', async () => {
    const linked = createPlannedDecision('delete-success', DATE);
    linked.updateDetails({
      projectId: EntityId.create('project-delete'),
      occurredAt: new Date('2026-08-06T19:00:00.000+09:00'),
      eventId: EntityId.create('project-delete-event'),
    });
    const context = await createContext(linked);
    const version = context.decision.version;

    const result = await context.command.execute({
      decisionId: context.decision.id,
      expectedVersion: version,
    });

    expect(result.ok).toBe(true);
    expect((await context.decisionRepository.findById(context.decision.id))?.isDeleted()).toBe(
      true,
    );
    expect((await context.decisionRepository.findById(context.decision.id))?.version).toBe(
      version + 1,
    );
    expect(
      (await context.decisionRepository.findById(context.decision.id))?.projectId?.toString(),
    ).toBe('project-delete');
  });

  it('preserves reschedule history when moving a decision to trash', async () => {
    const decision = createPlannedDecision('history-delete', DATE);
    decision.reschedule(
      DayDate.create('2026-08-07'),
      'Moved to tomorrow',
      new Date('2026-08-06T18:00:00.000+09:00'),
      EntityId.create('history-delete-rescheduled'),
    );
    const history = decision.rescheduleHistory;
    const context = await createContext(decision);

    const result = await context.command.execute({ decisionId: decision.id });

    expect(result.ok).toBe(true);
    const stored = await context.decisionRepository.findById(decision.id);
    expect(stored?.rescheduleCount).toBe(1);
    expect(stored?.rescheduleHistory).toEqual(history);
  });

  it.each(['running', 'paused'] as const)(
    'блокирует удаление при %s сессии связанного действия',
    async (status) => {
      const decision = createPlannedDecision(`session-${status}`, DATE);
      const action = markLifeActionInProgress(
        createReadyLifeAction(`action-${status}`, DATE, { decisionId: decision.id }),
      );
      const session = createSession(`session-${status}`, action);
      if (status === 'paused') {
        session.pause(new Date(NOW.getTime() + 60_000), EntityId.create('pause-event'));
      }
      const context = await createContext(decision, [action], [session]);

      const result = await context.command.execute({
        decisionId: decision.id,
        expectedVersion: decision.version,
      });

      expectFailure(result, 'decision.unfinished_session_blocks_delete');
      expect((await context.decisionRepository.findById(decision.id))?.isDeleted()).toBe(false);
    },
  );

  it('блокирует удаление при незавершённом действии без сессии', async () => {
    const decision = createPlannedDecision('unfinished-action', DATE);
    const action = createReadyLifeAction('ready-action', DATE, { decisionId: decision.id });
    const context = await createContext(decision, [action]);

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version,
    });

    expectFailure(result, 'decision.unfinished_actions_block_delete');
  });

  it('сохраняет завершённые и отменённые действия без изменений', async () => {
    const decision = createPlannedDecision('preserve-actions', DATE);
    const completed = completeLifeAction(
      createReadyLifeAction('completed-action', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-action', DATE, { decisionId: decision.id }),
    );
    const versions = [completed.version, cancelled.version];
    const context = await createContext(decision, [completed, cancelled]);

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version,
    });

    expect(result.ok).toBe(true);
    expect([completed.version, cancelled.version]).toEqual(versions);
    expect(await context.lifeActionRepository.findByDecisionId(decision.id)).toEqual([
      completed,
      cancelled,
    ]);
  });

  it('отклоняет устаревшую версию без изменения записи', async () => {
    const context = await createContext(createPlannedDecision('stale-delete', DATE));
    const result = await context.command.execute({
      decisionId: context.decision.id,
      expectedVersion: context.decision.version - 1,
    });

    expectFailure(result, 'decision.delete_conflict');
    expect((await context.decisionRepository.findById(context.decision.id))?.isDeleted()).toBe(
      false,
    );
  });

  it('отклоняет повторное удаление', async () => {
    const context = await createContext(createPlannedDecision('already-deleted', DATE));
    const first = await context.command.execute({ decisionId: context.decision.id });
    expect(first.ok).toBe(true);
    const stored = await context.decisionRepository.findById(context.decision.id);

    expect(stored).not.toBeNull();
    const second = await context.command.execute({
      decisionId: context.decision.id,
      expectedVersion: stored!.version,
    });

    expectFailure(second, 'decision.already_deleted');
  });

  it('не перемещает архивированное решение в корзину', async () => {
    const archived = archiveDecision(createConfirmedDecision('archived-delete'));
    const context = await createContext(archived);

    const result = await context.command.execute({ decisionId: archived.id });

    expectFailure(result, 'decision.archived_cannot_be_deleted');
  });
});

async function createContext(
  decision: Decision,
  actions: readonly LifeAction[] = [],
  sessions: readonly ActionSession[] = [],
) {
  const decisionRepository = new TestDecisionRepository();
  const lifeActionRepository = new TestLifeActionRepository();
  const actionSessionRepository = new TestActionSessionRepository();
  await decisionRepository.save(decision);
  for (const action of actions) await lifeActionRepository.save(action);
  for (const session of sessions) await actionSessionRepository.save(session);
  return {
    decision,
    decisionRepository,
    lifeActionRepository,
    command: new DeleteDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      new FakeClock(NOW),
      new FakeIdGenerator('delete-event'),
    ),
  };
}

function createSession(id: string, action: LifeAction): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: action.id,
    startedAt: new Date('2026-08-06T10:00:00.000+09:00'),
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function createConfirmedDecision(id: string): Decision {
  return confirmDecision(createPlannedDecision(id, DATE));
}

function expectFailure(
  result: Awaited<ReturnType<DeleteDecisionSafely['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
