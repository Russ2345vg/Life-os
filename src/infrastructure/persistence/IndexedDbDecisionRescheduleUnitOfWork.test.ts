import { IDBFactory } from 'fake-indexeddb';
import { ActionSession, DayDate, DECISION_KIND, EntityId, LIFE_ACTION_STATUS } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbDecisionRescheduleUnitOfWork } from './IndexedDbDecisionRescheduleUnitOfWork';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';

const PREVIOUS_DATE = DayDate.create('2026-08-06');
const NEW_DATE = DayDate.create('2026-08-08');
const NOW = new Date('2026-08-06T10:00:00.000Z');

describe('IndexedDbDecisionRescheduleUnitOfWork', () => {
  it('одной транзакцией переносит решение и связанное незавершённое действие', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const decision = createPlannedDecision('atomic-move', PREVIOUS_DATE);
    const lifeAction = createReadyLifeAction('atomic-move-action', PREVIOUS_DATE, {
      decisionId: decision.id,
    });
    await Promise.all([
      context.decisionRepository.save(decision),
      context.lifeActionRepository.save(lifeAction),
    ]);

    const changedDecision = cloneDecision(decision);
    const changedAction = cloneLifeAction(lifeAction);
    const expectedDecisionVersion = decision.version;
    const expectedActionVersion = lifeAction.version;
    changedDecision.reschedule(
      NEW_DATE,
      'Освободить время для срочного результата',
      NOW,
      id('decision-moved'),
    );
    changedAction.reschedule(NEW_DATE, NOW, id('action-moved'));

    await context.unitOfWork.commit({
      decision: changedDecision,
      expectedDecisionVersion,
      previousDate: PREVIOUS_DATE,
      newDate: NEW_DATE,
      linkedLifeActionIds: [lifeAction.id],
      movedLifeActions: [{ lifeAction: changedAction, expectedVersion: expectedActionVersion }],
    });
    context.database.close();

    const restored = createContext(factory);
    const [restoredDecision, restoredAction] = await Promise.all([
      restored.decisionRepository.findById(decision.id),
      restored.lifeActionRepository.findById(lifeAction.id),
    ]);

    expect(restoredDecision?.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(restoredDecision?.rescheduleCount).toBe(1);
    expect(restoredDecision?.rescheduleHistory).toHaveLength(1);
    expect(restoredDecision?.rescheduleHistory[0]?.reason).toBe(
      'Освободить время для срочного результата',
    );
    expect(restoredAction?.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(restoredAction?.status).toBe(LIFE_ACTION_STATUS.ready);
    restored.database.close();
  });

  it('откатывает действие, если версия решения устарела', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const decision = createPlannedDecision('stale-decision', PREVIOUS_DATE);
    const lifeAction = createReadyLifeAction('stale-decision-action', PREVIOUS_DATE, {
      decisionId: decision.id,
    });
    await Promise.all([
      context.decisionRepository.save(decision),
      context.lifeActionRepository.save(lifeAction),
    ]);

    const changedDecision = cloneDecision(decision);
    const changedAction = cloneLifeAction(lifeAction);
    changedDecision.reschedule(NEW_DATE, 'Перенос', NOW, id('stale-decision-event'));
    changedAction.reschedule(NEW_DATE, NOW, id('stale-decision-action-event'));

    await expect(
      context.unitOfWork.commit({
        decision: changedDecision,
        expectedDecisionVersion: decision.version + 1,
        previousDate: PREVIOUS_DATE,
        newDate: NEW_DATE,
        linkedLifeActionIds: [lifeAction.id],
        movedLifeActions: [{ lifeAction: changedAction, expectedVersion: lifeAction.version }],
      }),
    ).rejects.toMatchObject({ code: 'decision.reschedule_conflict' });

    const [storedDecision, storedAction] = await Promise.all([
      context.decisionRepository.findById(decision.id),
      context.lifeActionRepository.findById(lifeAction.id),
    ]);
    expect(storedDecision?.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(storedAction?.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    context.database.close();
  });

  it('откатывает решение, если версия связанного действия устарела', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const decision = createPlannedDecision('stale-action', PREVIOUS_DATE);
    const lifeAction = createReadyLifeAction('stale-action-item', PREVIOUS_DATE, {
      decisionId: decision.id,
    });
    await Promise.all([
      context.decisionRepository.save(decision),
      context.lifeActionRepository.save(lifeAction),
    ]);

    const changedDecision = cloneDecision(decision);
    const changedAction = cloneLifeAction(lifeAction);
    changedDecision.reschedule(NEW_DATE, 'Перенос', NOW, id('stale-action-decision-event'));
    changedAction.reschedule(NEW_DATE, NOW, id('stale-action-event'));

    await expect(
      context.unitOfWork.commit({
        decision: changedDecision,
        expectedDecisionVersion: decision.version,
        previousDate: PREVIOUS_DATE,
        newDate: NEW_DATE,
        linkedLifeActionIds: [lifeAction.id],
        movedLifeActions: [{ lifeAction: changedAction, expectedVersion: lifeAction.version + 1 }],
      }),
    ).rejects.toMatchObject({ code: 'decision.action_reschedule_conflict' });

    const [storedDecision, storedAction] = await Promise.all([
      context.decisionRepository.findById(decision.id),
      context.lifeActionRepository.findById(lifeAction.id),
    ]);
    expect(storedDecision?.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(storedAction?.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    context.database.close();
  });

  it('повторно проверяет незавершённую сессию внутри транзакции и ничего не переносит', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const decision = createPlannedDecision('session-conflict', PREVIOUS_DATE);
    const lifeAction = createReadyLifeAction('session-conflict-action', PREVIOUS_DATE, {
      decisionId: decision.id,
    });
    const session = ActionSession.start({
      id: id('running-session'),
      lifeActionId: lifeAction.id,
      startedAt: new Date('2026-08-06T09:30:00.000Z'),
      eventId: id('running-session-started'),
    });
    await Promise.all([
      context.decisionRepository.save(decision),
      context.lifeActionRepository.save(lifeAction),
      context.sessionRepository.save(session),
    ]);

    const changedDecision = cloneDecision(decision);
    const changedAction = cloneLifeAction(lifeAction);
    changedDecision.reschedule(NEW_DATE, 'Перенос', NOW, id('session-conflict-decision'));
    changedAction.reschedule(NEW_DATE, NOW, id('session-conflict-action-event'));

    await expect(
      context.unitOfWork.commit({
        decision: changedDecision,
        expectedDecisionVersion: decision.version,
        previousDate: PREVIOUS_DATE,
        newDate: NEW_DATE,
        linkedLifeActionIds: [lifeAction.id],
        movedLifeActions: [{ lifeAction: changedAction, expectedVersion: lifeAction.version }],
      }),
    ).rejects.toMatchObject({ code: 'decision.session_unfinished' });

    const [storedDecision, storedAction] = await Promise.all([
      context.decisionRepository.findById(decision.id),
      context.lifeActionRepository.findById(lifeAction.id),
    ]);
    expect(storedDecision?.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(storedAction?.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    context.database.close();
  });

  it('повторно проверяет лимит главных решений на новой дате', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const decision = createPlannedDecision('main-limit', PREVIOUS_DATE, DECISION_KIND.main, 1);
    await context.decisionRepository.save(decision);
    await Promise.all(
      [1, 2, 3].map((order) =>
        context.decisionRepository.save(
          createPlannedDecision(`occupied-${order}`, NEW_DATE, DECISION_KIND.main, order),
        ),
      ),
    );
    const changedDecision = cloneDecision(decision);
    changedDecision.reschedule(NEW_DATE, 'Перенос', NOW, id('main-limit-event'), 1);

    await expect(
      context.unitOfWork.commit({
        decision: changedDecision,
        expectedDecisionVersion: decision.version,
        previousDate: PREVIOUS_DATE,
        newDate: NEW_DATE,
        linkedLifeActionIds: [],
        movedLifeActions: [],
      }),
    ).rejects.toMatchObject({ code: 'decision.main_limit_reached' });

    expect(
      (await context.decisionRepository.findById(decision.id))?.plannedDate?.equals(PREVIOUS_DATE),
    ).toBe(true);
    context.database.close();
  });
});

function createContext(factory: IDBFactory) {
  const database = new LifeOsIndexedDb(factory);
  return {
    database,
    decisionRepository: new IndexedDbDecisionRepository(database),
    lifeActionRepository: new IndexedDbLifeActionRepository(database),
    sessionRepository: new IndexedDbActionSessionRepository(database),
    unitOfWork: new IndexedDbDecisionRescheduleUnitOfWork(database),
  };
}

function cloneDecision(decision: ReturnType<typeof createPlannedDecision>) {
  return DecisionRecordMapper.fromRecord(DecisionRecordMapper.toRecord(decision));
}

function cloneLifeAction(lifeAction: ReturnType<typeof createReadyLifeAction>) {
  return LifeActionRecordMapper.fromRecord(LifeActionRecordMapper.toRecord(lifeAction));
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
