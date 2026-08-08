import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
  type ActionSession as ActionSessionType,
} from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';

describe('IndexedDbActionSessionRepository', () => {
  it('сохраняет сессию и находит новую сущность по id без новых событий', async () => {
    const { database, repository } = createContext();
    const session = createRunningSession('session-1', 'action-1');
    const sourceEventCount = session.getUncommittedEvents().length;

    await repository.save(session);
    const restored = await repository.findById(session.id);

    expect(restored).not.toBe(session);
    expect(restored).not.toBeNull();
    expect(ActionSessionRecordMapper.toRecord(restored!)).toEqual(
      ActionSessionRecordMapper.toRecord(session),
    );
    expect(session.getUncommittedEvents()).toHaveLength(sourceEventCount);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    await expect(repository.findById(id('missing'))).resolves.toBeNull();
    database.close();
  });

  it('повторным save обновляет существующий id без дубликата', async () => {
    const { database, repository } = createContext();
    const session = createRunningSession('same-id', 'action-1');
    await repository.save(session);
    session.pause(time('09:15'), id('pause-event'));

    await repository.save(session);

    const restored = await repository.findById(session.id);
    expect(restored?.isPaused()).toBe(true);
    expect(restored?.version).toBe(2);
    await expect(repository.findByLifeActionId(session.lifeActionId)).resolves.toHaveLength(1);
    database.close();
  });

  it('находит через byLifeActionId только сессии указанного действия', async () => {
    const { database, repository } = createContext();
    await repository.save(createRunningSession('first', 'action-1'));
    await repository.save(createCompletedSession('second', 'action-1'));
    await repository.save(createRunningSession('another', 'action-2'));

    const first = await repository.findByLifeActionId(id('action-1'));
    const second = await repository.findByLifeActionId(id('action-1'));

    expect(first.map((session) => session.id.toString())).toEqual(['first', 'second']);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    database.close();
  });

  it('находит running-сессию через byStatus как незавершённую', async () => {
    const { database, repository } = createContext();
    const running = createRunningSession('running', 'action-1');
    await repository.save(running);

    const restored = await repository.findUnfinished();

    expect(restored?.id.toString()).toBe('running');
    expect(restored).not.toBe(running);
    database.close();
  });

  it('находит paused-сессию через byStatus как незавершённую', async () => {
    const { database, repository } = createContext();
    const paused = createRunningSession('paused', 'action-1');
    paused.pause(time('09:15'), id('pause-event'));
    await repository.save(paused);

    const restored = await repository.findUnfinished();

    expect(restored?.isPaused()).toBe(true);
    expect(restored?.pausedAt?.toISOString()).toBe(time('09:15').toISOString());
    database.close();
  });

  it('игнорирует completed-сессии и возвращает null для пустого результата', async () => {
    const { database, repository } = createContext();
    await repository.save(createCompletedSession('completed-1', 'action-1'));
    await repository.save(createCompletedSession('completed-2', 'action-2'));

    await expect(repository.findUnfinished()).resolves.toBeNull();
    database.close();
  });

  it('возвращает session.multiple_unfinished_detected для нескольких незавершённых сессий', async () => {
    const { database, repository } = createContext();
    const paused = createRunningSession('paused', 'action-1');
    paused.pause(time('09:15'), id('pause-event'));
    await repository.save(paused);
    await repository.save(createRunningSession('running', 'action-2'));

    await expect(repository.findUnfinished()).rejects.toMatchObject({
      code: 'session.multiple_unfinished_detected',
    });
    database.close();
  });

  it('полностью восстанавливает паузы, interrupted, resultNote, workedDuration и version', async () => {
    const { database, repository } = createContext();
    const session = createCompletedSessionWithPauses();
    const workedDuration = session.workedDurationAt(time('11:00'));
    await repository.save(session);

    const restored = await repository.findById(session.id);

    expect(restored).not.toBeNull();
    expect(ActionSessionRecordMapper.toRecord(restored!)).toEqual(
      ActionSessionRecordMapper.toRecord(session),
    );
    expect(restored?.pauseIntervals).toHaveLength(2);
    expect(restored?.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
    expect(restored?.resultNote?.toString()).toBe('Прервано внешним событием');
    expect(restored?.workedDurationAt(time('11:00'))).toBe(workedDuration);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    database.close();
  });

  it('читает все сессии для построения истории независимо от статуса', async () => {
    const { database, repository } = createContext();
    await repository.save(createRunningSession('running-all', 'action-1'));
    await repository.save(createCompletedSession('completed-all', 'action-2'));

    const first = await repository.findAll();
    const second = await repository.findAll();

    expect(first.map((session) => session.id.toString()).sort()).toEqual([
      'completed-all',
      'running-all',
    ]);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    database.close();
  });

  it('не маскирует ошибку mapper для повреждённой записи', async () => {
    const { database, repository } = createContext();
    const connection = await database.open();
    const session = createRunningSession('corrupted', 'action-1');
    const corruptedRecord = {
      ...ActionSessionRecordMapper.toRecord(session),
      startedAt: 'not-a-date',
    };
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.actionSessions, 'readwrite', (store) =>
      store.put(corruptedRecord),
    );

    await expect(repository.findById(session.id)).rejects.toMatchObject({
      code: 'persistence.invalid_date',
    });
    database.close();
  });
});

function createContext(): {
  readonly database: LifeOsIndexedDb;
  readonly repository: IndexedDbActionSessionRepository;
} {
  const database = new LifeOsIndexedDb(new IDBFactory());
  return { database, repository: new IndexedDbActionSessionRepository(database) };
}

function createRunningSession(sessionId: string, lifeActionId: string): ActionSessionType {
  return ActionSession.start({
    id: id(sessionId),
    lifeActionId: id(lifeActionId),
    startedAt: time('09:00'),
    eventId: id(`${sessionId}-started-event`),
  });
}

function createCompletedSession(sessionId: string, lifeActionId: string): ActionSessionType {
  const session = createRunningSession(sessionId, lifeActionId);
  session.complete({
    completedAt: time('10:00'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: id(`${sessionId}-completed-event`),
  });
  return session;
}

function createCompletedSessionWithPauses(): ActionSessionType {
  const session = createRunningSession('completed-with-pauses', 'action-1');
  session.pause(time('09:15'), id('pause-1'));
  session.resume(time('09:25'), id('resume-1'));
  session.pause(time('09:45'), id('pause-2'));
  session.resume(time('10:00'), id('resume-2'));
  session.complete({
    completedAt: time('10:30'),
    completionKind: SESSION_COMPLETION_KIND.interrupted,
    resultNote: SessionResultNote.create('Прервано внешним событием'),
    eventId: id('completed-event'),
  });
  return session;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function time(value: string): Date {
  return new Date(`2026-08-02T${value}:00.000Z`);
}
