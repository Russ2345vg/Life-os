import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  ActionActualResult,
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../../domain';
import { VerifyLifeActionResult } from '../../application';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-07');
const COMPLETED_AT = new Date('2026-08-07T10:45:00.000Z');
const VERIFIED_AT = new Date('2026-08-07T11:00:00.000Z');

describe('LifeAction result verification IndexedDB integration', () => {
  it('сохраняет подтверждённый результат после повторного открытия базы и не изменяет историю сессии', async () => {
    const indexedDb = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(indexedDb);
    await firstDatabase.open();
    const lifeActions = new IndexedDbLifeActionRepository(firstDatabase);
    const sessions = new IndexedDbActionSessionRepository(firstDatabase);
    const action = markLifeActionInProgress(createReadyLifeAction('verified-persisted', DATE));
    const session = ActionSession.start({
      id: EntityId.create('verified-persisted-session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-07T10:00:00.000Z'),
      eventId: EntityId.create('verified-persisted-session-start'),
    });
    session.complete({
      completedAt: COMPLETED_AT,
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: SessionResultNote.create('Форма проверена вручную'),
      eventId: EntityId.create('verified-persisted-session-complete'),
    });
    session.clearUncommittedEvents();
    const originalSessionVersion = session.version;
    const originalSessionResult = session.resultNote?.toString();

    await lifeActions.save(action);
    await sessions.save(session);

    const result = await new VerifyLifeActionResult(
      lifeActions,
      sessions,
      new FakeClock(VERIFIED_AT),
      new FakeIdGenerator('persisted-verification'),
    ).execute({
      lifeActionId: action.id,
      actualResult: ActionActualResult.create(
        'Форма работает и соответствует ожидаемому результату',
      ),
    });

    expect(result.ok).toBe(true);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(indexedDb);
    await reopenedDatabase.open();
    const reopenedLifeActions = new IndexedDbLifeActionRepository(reopenedDatabase);
    const reopenedSessions = new IndexedDbActionSessionRepository(reopenedDatabase);
    const restoredAction = await reopenedLifeActions.findById(action.id);
    const restoredSessions = await reopenedSessions.findByLifeActionId(action.id);

    expect(restoredAction?.status).toBe('completed');
    expect(restoredAction?.actualResult?.toString()).toBe(
      'Форма работает и соответствует ожидаемому результату',
    );
    expect(restoredAction?.completedAt).toEqual(VERIFIED_AT);
    expect(restoredSessions).toHaveLength(1);
    expect(restoredSessions[0]?.version).toBe(originalSessionVersion);
    expect(restoredSessions[0]?.resultNote?.toString()).toBe(originalSessionResult);
    expect(restoredSessions[0]?.completedAt).toEqual(COMPLETED_AT);
    reopenedDatabase.close();
  });
});
