import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ActionSession, EntityId, SESSION_COMPLETION_KIND, SessionResultNote } from '../../domain';
import { buildActionSessionOverview } from '../../presentation/actionSessionOverview';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const ACTION_ID = EntityId.create('overview-persisted-action');

describe('action session overview IndexedDB integration', () => {
  it('восстанавливает список, результаты, паузы и статистику сессий после повторного открытия базы', async () => {
    const indexedDb = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(indexedDb);
    await firstDatabase.open();
    const firstRepository = new IndexedDbActionSessionRepository(firstDatabase);
    const first = completedSession('persisted-first', '08:00', '08:40', 'Подготовлен макет');
    const secondWithPause = ActionSession.start({
      id: EntityId.create('persisted-second-with-pause'),
      lifeActionId: ACTION_ID,
      startedAt: at('09:00'),
      eventId: EntityId.create('persisted-second-with-pause-start'),
    });
    secondWithPause.pause(at('09:20'), EntityId.create('persisted-second-with-pause-pause'));
    secondWithPause.resume(at('09:30'), EntityId.create('persisted-second-with-pause-resume'));
    secondWithPause.complete({
      completedAt: at('10:10'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: SessionResultNote.create('Проверена логика'),
      eventId: EntityId.create('persisted-second-with-pause-complete'),
    });
    const paused = ActionSession.start({
      id: EntityId.create('persisted-paused'),
      lifeActionId: ACTION_ID,
      startedAt: at('11:00'),
      eventId: EntityId.create('persisted-paused-start'),
    });
    paused.pause(at('11:15'), EntityId.create('persisted-paused-pause'));

    await firstRepository.save(first);
    await firstRepository.save(secondWithPause);
    await firstRepository.save(paused);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(indexedDb);
    await reopenedDatabase.open();
    const repository = new IndexedDbActionSessionRepository(reopenedDatabase);
    const restored = await repository.findByLifeActionId(ACTION_ID);
    const overview = buildActionSessionOverview(restored, at('12:00'));

    expect(overview.totalSessionCount).toBe(3);
    expect(overview.completedSessionCount).toBe(2);
    expect(overview.latestSession?.id.toString()).toBe('persisted-paused');
    expect(overview.items.map((item) => item.session.id.toString())).toEqual([
      'persisted-paused',
      'persisted-second-with-pause',
      'persisted-first',
    ]);
    expect(overview.items[1]?.session.resultNote?.toString()).toBe('Проверена логика');
    expect(overview.items[1]?.pausedDurationMs).toBe(10 * 60_000);
    expect(overview.totalWorkedDurationMs).toBe(115 * 60_000);
    expect(overview.averageCompletedWorkedDurationMs).toBe(50 * 60_000);
    reopenedDatabase.close();
  });
});

function completedSession(
  id: string,
  startedAt: string,
  completedAt: string,
  result: string,
): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: ACTION_ID,
    startedAt: at(startedAt),
    eventId: EntityId.create(`${id}-start`),
  });
  session.complete({
    completedAt: at(completedAt),
    completionKind: SESSION_COMPLETION_KIND.completed,
    resultNote: SessionResultNote.create(result),
    eventId: EntityId.create(`${id}-complete`),
  });
  return session;
}

function at(time: string): Date {
  return new Date(`2026-08-07T${time}:00.000+09:00`);
}
