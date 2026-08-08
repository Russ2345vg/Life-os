import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DeleteDecisionSafely,
  GetDecisionOverview,
  GetDecisionsForDate,
  GetDeletedDecisions,
  MainDecisionLimitPolicy,
  RestoreDeletedDecision,
} from '../../application';
import {
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-06');
const DELETED_AT = new Date('2026-08-06T20:00:00.000+09:00');
const RESTORED_AT = new Date('2026-08-06T20:05:00.000+09:00');

describe('decision soft deletion IndexedDB integration', () => {
  it('сохраняет корзину после повторного открытия, не трогает историю и восстанавливает решение', async () => {
    const indexedDb = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(indexedDb);
    await firstDatabase.open();
    const firstDecisionRepository = new IndexedDbDecisionRepository(firstDatabase);
    const firstActionRepository = new IndexedDbLifeActionRepository(firstDatabase);
    const firstSessionRepository = new IndexedDbActionSessionRepository(firstDatabase);
    const decision = createPlannedDecision('trash-persistence', DATE);
    const action = completeLifeAction(
      createReadyLifeAction('trash-persistence-action', DATE, { decisionId: decision.id }),
    );
    const session = ActionSession.start({
      id: EntityId.create('trash-persistence-session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-06T09:00:00.000+09:00'),
      eventId: EntityId.create('trash-persistence-session-started'),
    });
    session.complete({
      completedAt: new Date('2026-08-06T09:40:00.000+09:00'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: SessionResultNote.create('Сохранённый результат сессии'),
      eventId: EntityId.create('trash-persistence-session-completed'),
    });

    await Promise.all([
      firstDecisionRepository.save(decision),
      firstActionRepository.save(action),
      firstSessionRepository.save(session),
    ]);

    const deleteResult = await new DeleteDecisionSafely(
      firstDecisionRepository,
      firstActionRepository,
      firstSessionRepository,
      new FakeClock(DELETED_AT),
      new FakeIdGenerator('trash-delete'),
    ).execute({ decisionId: decision.id, expectedVersion: decision.version });

    expect(deleteResult.ok).toBe(true);
    firstDatabase.close();

    const deletedDatabase = new LifeOsIndexedDb(indexedDb);
    await deletedDatabase.open();
    const deletedDecisionRepository = new IndexedDbDecisionRepository(deletedDatabase);
    const deletedActionRepository = new IndexedDbLifeActionRepository(deletedDatabase);
    const deletedSessionRepository = new IndexedDbActionSessionRepository(deletedDatabase);
    const deletedDecisions = await new GetDeletedDecisions(deletedDecisionRepository).execute();
    const activeDecisions = await new GetDecisionsForDate(deletedDecisionRepository).execute(DATE);
    const deletedOverview = await new GetDecisionOverview(
      deletedDecisionRepository,
      deletedActionRepository,
      deletedSessionRepository,
    ).execute(decision.id);

    expect(deletedDecisions).toHaveLength(1);
    expect(deletedDecisions[0]?.deletedAt?.toISOString()).toBe(DELETED_AT.toISOString());
    expect(activeDecisions).toHaveLength(0);
    expect(deletedOverview.ok).toBe(true);
    if (deletedOverview.ok) {
      expect(deletedOverview.value.actions).toHaveLength(1);
      expect(deletedOverview.value.actions[0]?.lifeAction.version).toBe(action.version);
      expect(deletedOverview.value.actions[0]?.lifeAction.actualResult?.toString()).toBe(
        'Действие выполнено',
      );
      expect(deletedOverview.value.actions[0]?.sessions).toHaveLength(1);
      expect(deletedOverview.value.actions[0]?.sessions[0]?.version).toBe(session.version);
      expect(deletedOverview.value.actions[0]?.sessions[0]?.resultNote?.toString()).toBe(
        'Сохранённый результат сессии',
      );
    }

    const deletedVersion = deletedDecisions[0]!.version;
    const restoreResult = await new RestoreDeletedDecision(
      deletedDecisionRepository,
      new MainDecisionLimitPolicy(deletedDecisionRepository),
      new FakeClock(RESTORED_AT),
      new FakeIdGenerator('trash-restore'),
    ).execute({ decisionId: decision.id, expectedVersion: deletedVersion });

    expect(restoreResult.ok).toBe(true);
    deletedDatabase.close();

    const restoredDatabase = new LifeOsIndexedDb(indexedDb);
    await restoredDatabase.open();
    const restoredDecisionRepository = new IndexedDbDecisionRepository(restoredDatabase);
    const restoredActionRepository = new IndexedDbLifeActionRepository(restoredDatabase);
    const restoredSessionRepository = new IndexedDbActionSessionRepository(restoredDatabase);
    const restoredDecisions = await new GetDecisionsForDate(restoredDecisionRepository).execute(
      DATE,
    );
    const trashAfterRestore = await new GetDeletedDecisions(restoredDecisionRepository).execute();
    const restoredOverview = await new GetDecisionOverview(
      restoredDecisionRepository,
      restoredActionRepository,
      restoredSessionRepository,
    ).execute(decision.id);

    expect(restoredDecisions).toHaveLength(1);
    expect(restoredDecisions[0]?.isDeleted()).toBe(false);
    expect(restoredDecisions[0]?.lastDeletedAt?.toISOString()).toBe(DELETED_AT.toISOString());
    expect(restoredDecisions[0]?.restoredFromTrashAt?.toISOString()).toBe(
      RESTORED_AT.toISOString(),
    );
    expect(trashAfterRestore).toHaveLength(0);
    expect(restoredOverview.ok).toBe(true);
    if (restoredOverview.ok) {
      expect(restoredOverview.value.actions[0]?.lifeAction.version).toBe(action.version);
      expect(restoredOverview.value.actions[0]?.sessions[0]?.version).toBe(session.version);
      expect(restoredOverview.value.actions[0]?.sessions[0]?.resultNote?.toString()).toBe(
        'Сохранённый результат сессии',
      );
    }
    restoredDatabase.close();
  });
});
