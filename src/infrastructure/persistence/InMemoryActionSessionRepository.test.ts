import { describe, expect, it } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  EntityId,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { InMemoryActionSessionRepository } from './InMemoryActionSessionRepository';

const STARTED_AT = new Date('2026-08-01T09:00:00.000+09:00');
const PAUSED_AT = new Date('2026-08-01T09:30:00.000+09:00');
const COMPLETED_AT = new Date('2026-08-01T10:00:00.000+09:00');

describe('InMemoryActionSessionRepository', () => {
  it('сохраняет новую сессию', async () => {
    const repository = new InMemoryActionSessionRepository();
    const session = createRunningSession('session-1', 'action-1');

    await repository.save(session);

    await expect(repository.findByLifeActionId(session.lifeActionId)).resolves.toEqual([session]);
  });

  it('находит сессию по идентификатору', async () => {
    const repository = new InMemoryActionSessionRepository();
    const session = createRunningSession('session-1', 'action-1');
    await repository.save(session);

    await expect(repository.findById(session.id)).resolves.toBe(session);
  });

  it('возвращает отсутствие результата для неизвестного идентификатора', async () => {
    const repository = new InMemoryActionSessionRepository();

    await expect(repository.findById(id('missing'))).resolves.toBeNull();
  });

  it('обновляет существующую запись с тем же идентификатором', async () => {
    const repository = new InMemoryActionSessionRepository();
    const initial = createRunningSession('same-id', 'action-1');
    const replacement = createPausedSession('same-id', 'action-1');

    await repository.save(initial);
    await repository.save(replacement);

    await expect(repository.findById(initial.id)).resolves.toBe(replacement);
  });

  it('не создаёт дубликаты при повторном сохранении идентификатора', async () => {
    const repository = new InMemoryActionSessionRepository();
    const initial = createRunningSession('same-id', 'action-1');
    const replacement = createPausedSession('same-id', 'action-1');

    await repository.save(initial);
    await repository.save(replacement);

    await expect(repository.findByLifeActionId(initial.lifeActionId)).resolves.toEqual([
      replacement,
    ]);
  });

  it('находит все сессии указанного LifeAction', async () => {
    const repository = new InMemoryActionSessionRepository();
    const first = createRunningSession('session-1', 'action-1');
    const second = createPausedSession('session-2', 'action-1');

    await repository.save(first);
    await repository.save(second);

    await expect(repository.findByLifeActionId(id('action-1'))).resolves.toEqual([first, second]);
  });

  it('исключает сессии другого LifeAction', async () => {
    const repository = new InMemoryActionSessionRepository();
    const expected = createRunningSession('session-1', 'action-1');
    const anotherAction = createRunningSession('session-2', 'action-2');

    await repository.save(expected);
    await repository.save(anotherAction);

    await expect(repository.findByLifeActionId(id('action-1'))).resolves.toEqual([expected]);
  });

  it('пакетно находит сессии нескольких LifeAction', async () => {
    const repository = new InMemoryActionSessionRepository();
    const first = createRunningSession('session-1', 'action-1');
    const second = createCompletedSession('session-2', 'action-2');
    await repository.save(first);
    await repository.save(second);
    await repository.save(createRunningSession('session-3', 'action-3'));

    await expect(repository.findByLifeActionIds([id('action-1'), id('action-2')])).resolves.toEqual(
      [first, second],
    );
  });

  it('возвращает отдельный массив результатов', async () => {
    const repository = new InMemoryActionSessionRepository();
    const session = createRunningSession('session-1', 'action-1');
    await repository.save(session);
    const firstResult = await repository.findByLifeActionId(session.lifeActionId);

    (firstResult as ActionSession[]).length = 0;

    await expect(repository.findByLifeActionId(session.lifeActionId)).resolves.toEqual([session]);
  });

  it('хранит running, paused и completed сессии', async () => {
    const repository = new InMemoryActionSessionRepository();
    const running = createRunningSession('running', 'action-1');
    const paused = createPausedSession('paused', 'action-1');
    const completed = createCompletedSession('completed', 'action-1');

    await repository.save(running);
    await repository.save(paused);
    await repository.save(completed);

    await expect(repository.findByLifeActionId(id('action-1'))).resolves.toEqual([
      running,
      paused,
      completed,
    ]);
  });

  it('находит running-сессию как незавершённую', async () => {
    const repository = new InMemoryActionSessionRepository();
    const running = createRunningSession('running', 'action-1');
    await repository.save(running);

    await expect(repository.findUnfinished()).resolves.toBe(running);
  });

  it('находит paused-сессию как незавершённую', async () => {
    const repository = new InMemoryActionSessionRepository();
    const paused = createPausedSession('paused', 'action-1');
    await repository.save(paused);

    await expect(repository.findUnfinished()).resolves.toBe(paused);
  });

  it('не возвращает completed-сессию как незавершённую', async () => {
    const repository = new InMemoryActionSessionRepository();
    await repository.save(createCompletedSession('completed', 'action-1'));

    await expect(repository.findUnfinished()).resolves.toBeNull();
  });

  it('возвращает отсутствие результата для пустого репозитория', async () => {
    const repository = new InMemoryActionSessionRepository();

    await expect(repository.findUnfinished()).resolves.toBeNull();
  });

  it('игнорирует несколько completed-сессий и находит единственную незавершённую', async () => {
    const repository = new InMemoryActionSessionRepository();
    const running = createRunningSession('running', 'action-3');
    await repository.save(createCompletedSession('completed-1', 'action-1'));
    await repository.save(createCompletedSession('completed-2', 'action-2'));
    await repository.save(running);

    await expect(repository.findUnfinished()).resolves.toBe(running);
  });

  it('явно отклоняет повреждение с несколькими незавершёнными сессиями', async () => {
    const repository = new InMemoryActionSessionRepository();
    await repository.save(createRunningSession('running', 'action-1'));
    await repository.save(createPausedSession('paused', 'action-2'));

    await expect(repository.findUnfinished()).rejects.toBeInstanceOf(DomainError);
    await expect(repository.findUnfinished()).rejects.toMatchObject({
      code: 'session.multiple_unfinished_detected',
    });
  });
});

function createRunningSession(sessionId: string, lifeActionId: string): ActionSession {
  return ActionSession.rehydrate({
    id: id(sessionId),
    lifeActionId: id(lifeActionId),
    status: ACTION_SESSION_STATUS.running,
    startedAt: STARTED_AT,
    pausedAt: null,
    completedAt: null,
    completionKind: null,
    resultNote: null,
    pauseIntervals: [],
    version: 1,
  });
}

function createPausedSession(sessionId: string, lifeActionId: string): ActionSession {
  return ActionSession.rehydrate({
    id: id(sessionId),
    lifeActionId: id(lifeActionId),
    status: ACTION_SESSION_STATUS.paused,
    startedAt: STARTED_AT,
    pausedAt: PAUSED_AT,
    completedAt: null,
    completionKind: null,
    resultNote: null,
    pauseIntervals: [],
    version: 2,
  });
}

function createCompletedSession(sessionId: string, lifeActionId: string): ActionSession {
  return ActionSession.rehydrate({
    id: id(sessionId),
    lifeActionId: id(lifeActionId),
    status: ACTION_SESSION_STATUS.completed,
    startedAt: STARTED_AT,
    pausedAt: null,
    completedAt: COMPLETED_AT,
    completionKind: SESSION_COMPLETION_KIND.completed,
    resultNote: null,
    pauseIntervals: [],
    version: 2,
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
