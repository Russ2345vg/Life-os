import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ACTION_LIST_GROUP, GetActionListsForDate } from '../../application';
import {
  ActionActualResult,
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { FakeClock } from '../../test/helpers/Fakes';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-06');
const NOW = new Date('2026-08-06T12:00:00.000+09:00');

describe('action lists IndexedDB integration', () => {
  it('восстанавливает группы, решение, сессии и время после повторного открытия базы', async () => {
    const indexedDb = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(indexedDb);
    await firstDatabase.open();
    const firstDecisionRepository = new IndexedDbDecisionRepository(firstDatabase);
    const firstActionRepository = new IndexedDbLifeActionRepository(firstDatabase);
    const firstSessionRepository = new IndexedDbActionSessionRepository(firstDatabase);
    const decision = createPlannedDecision('persisted-list', DATE);
    decision.updateDetails({
      sphereId: EntityId.create('sphere-work'),
      occurredAt: at('07:30'),
      eventId: EntityId.create('persisted-list-sphere-updated'),
    });
    const pausedAction = markLifeActionInProgress(
      createReadyLifeAction('persisted-paused', DATE, {
        decisionId: decision.id,
        sphereId: EntityId.create('sphere-work'),
      }),
    );
    const completedAction = completeLifeAction(createReadyLifeAction('persisted-completed', DATE));
    const pausedSession = ActionSession.start({
      id: EntityId.create('persisted-paused-session'),
      lifeActionId: pausedAction.id,
      startedAt: at('09:00'),
      eventId: EntityId.create('persisted-paused-session-started'),
    });
    pausedSession.pause(at('09:30'), EntityId.create('persisted-paused-session-paused'));
    const completedSession = ActionSession.start({
      id: EntityId.create('persisted-completed-session'),
      lifeActionId: completedAction.id,
      startedAt: at('08:00'),
      eventId: EntityId.create('persisted-completed-session-started'),
    });
    completedSession.complete({
      completedAt: at('08:40'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: EntityId.create('persisted-completed-session-completed'),
    });

    await Promise.all([
      firstDecisionRepository.save(decision),
      firstActionRepository.save(pausedAction),
      firstActionRepository.save(completedAction),
      firstSessionRepository.save(pausedSession),
      firstSessionRepository.save(completedSession),
    ]);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(indexedDb);
    await reopenedDatabase.open();
    const query = new GetActionListsForDate(
      new IndexedDbLifeActionRepository(reopenedDatabase),
      new IndexedDbDecisionRepository(reopenedDatabase),
      new IndexedDbActionSessionRepository(reopenedDatabase),
      new FakeClock(NOW),
    );

    const snapshot = await query.execute(DATE);

    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]?.lifeAction.id.equals(pausedAction.id)).toBe(true);
    expect(snapshot.items[0]?.group).toBe(ACTION_LIST_GROUP.paused);
    expect(snapshot.items[0]?.decisionTitle).toBe('Решение persisted-list');
    expect(snapshot.items[0]?.sphereId).toBe('sphere-work');
    expect(snapshot.items[0]?.totalWorkedDurationMs).toBe(30 * 60_000);
    expect(snapshot.items[1]?.lifeAction.id.equals(completedAction.id)).toBe(true);
    expect(snapshot.items[1]?.group).toBe(ACTION_LIST_GROUP.completed);
    expect(snapshot.items[1]?.completedSessionCount).toBe(1);
    expect(snapshot.items[1]?.totalWorkedDurationMs).toBe(40 * 60_000);
    expect(snapshot.items[1]?.lifeAction.actualResult?.toString()).toBe('Действие выполнено');
    reopenedDatabase.close();
  });

  it('перемещает карточку между списками после сохранения каждого перехода', async () => {
    const indexedDb = new IDBFactory();
    const database = new LifeOsIndexedDb(indexedDb);
    await database.open();
    const decisionRepository = new IndexedDbDecisionRepository(database);
    const actionRepository = new IndexedDbLifeActionRepository(database);
    const sessionRepository = new IndexedDbActionSessionRepository(database);
    const clock = new FakeClock(NOW);
    const query = new GetActionListsForDate(
      actionRepository,
      decisionRepository,
      sessionRepository,
      clock,
    );
    const action = createReadyLifeAction('moving-card', DATE);
    await actionRepository.save(action);

    expect((await query.execute(DATE)).items[0]?.group).toBe(ACTION_LIST_GROUP.ready);

    action.markInProgress(at('09:00'), EntityId.create('moving-card-started'));
    const session = ActionSession.start({
      id: EntityId.create('moving-card-session'),
      lifeActionId: action.id,
      startedAt: at('09:00'),
      eventId: EntityId.create('moving-card-session-started'),
    });
    await actionRepository.save(action);
    await sessionRepository.save(session);
    expect((await query.execute(DATE)).items[0]?.group).toBe(ACTION_LIST_GROUP.active);

    session.pause(at('09:20'), EntityId.create('moving-card-session-paused'));
    await sessionRepository.save(session);
    expect((await query.execute(DATE)).items[0]?.group).toBe(ACTION_LIST_GROUP.paused);

    session.complete({
      completedAt: at('09:30'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: EntityId.create('moving-card-session-completed'),
    });
    await sessionRepository.save(session);
    expect((await query.execute(DATE)).items[0]?.group).toBe(ACTION_LIST_GROUP.active);

    action.complete(
      // The test factory uses the same validated value in the normal completion workflow.
      completedActionResult(),
      at('09:31'),
      EntityId.create('moving-card-completed'),
    );
    await actionRepository.save(action);
    expect((await query.execute(DATE)).items[0]?.group).toBe(ACTION_LIST_GROUP.completed);
    database.close();
  });
});

function completedActionResult(): ActionActualResult {
  return ActionActualResult.create('Проверенный результат действия');
}

function at(time: string): Date {
  return new Date(`2026-08-06T${time}:00.000+09:00`);
}
