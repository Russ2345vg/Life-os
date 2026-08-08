import { describe, expect, it, vi } from 'vitest';
import {
  ActionActualResult,
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../../domain';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  TestActionSessionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import { VerifyLifeActionResult } from './VerifyLifeActionResult';

const DATE = DayDate.create('2026-08-07');
const NOW = new Date('2026-08-07T12:00:00.000Z');

function id(value: string): EntityId {
  return EntityId.create(value);
}

function successfulSession(
  actionId: EntityId,
  options: { readonly resultNote: string | undefined } = { resultNote: 'Получен результат сессии' },
): ActionSession {
  const session = ActionSession.start({
    id: id(`session-${options.resultNote === undefined ? 'empty' : 'result'}`),
    lifeActionId: actionId,
    startedAt: new Date('2026-08-07T10:00:00.000Z'),
    eventId: id('session-started'),
  });
  session.complete({
    completedAt: new Date('2026-08-07T10:45:00.000Z'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    ...(options.resultNote === undefined
      ? {}
      : { resultNote: SessionResultNote.create(options.resultNote) }),
    eventId: id('session-completed'),
  });
  session.clearUncommittedEvents();
  return session;
}

function interruptedSession(actionId: EntityId): ActionSession {
  const session = ActionSession.start({
    id: id('session-interrupted'),
    lifeActionId: actionId,
    startedAt: new Date('2026-08-07T10:00:00.000Z'),
    eventId: id('interrupted-started'),
  });
  session.complete({
    completedAt: new Date('2026-08-07T10:10:00.000Z'),
    completionKind: SESSION_COMPLETION_KIND.interrupted,
    resultNote: SessionResultNote.create('Работа прервана'),
    eventId: id('interrupted-completed'),
  });
  session.clearUncommittedEvents();
  return session;
}

describe('VerifyLifeActionResult', () => {
  it('подтверждает результат только при наличии завершённой сессии с записанным результатом', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('verified-action', DATE));
    const actionRepository = new TestLifeActionRepository([action]);
    const sessionRepository = new TestActionSessionRepository([successfulSession(action.id)]);
    const save = vi.spyOn(actionRepository, 'save');

    const result = await new VerifyLifeActionResult(
      actionRepository,
      sessionRepository,
      new FakeClock(NOW),
      new FakeIdGenerator('verified-result'),
    ).execute({
      lifeActionId: action.id,
      actualResult: ActionActualResult.create('Ожидаемый результат достигнут и проверен'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected verified action result');
    expect(result.value.status).toBe('completed');
    expect(result.value.actualResult?.toString()).toBe('Ожидаемый результат достигнут и проверен');
    expect(result.value.completedAt).toEqual(NOW);
    expect(save).toHaveBeenCalledOnce();
  });

  it('не подтверждает действие без завершённой рабочей сессии', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('no-session', DATE));
    const result = await execute(action, []);

    expectFailure(result, 'life_action.result_verification_requires_completed_session');
    expect(action.status).toBe('in_progress');
  });

  it('не считает прерванную сессию подтверждением результата', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('interrupted-only', DATE));
    const result = await execute(action, [interruptedSession(action.id)]);

    expectFailure(result, 'life_action.result_verification_requires_completed_session');
    expect(action.status).toBe('in_progress');
  });

  it('требует записанный результат завершённой сессии', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('missing-note', DATE));
    const result = await execute(action, [successfulSession(action.id, { resultNote: undefined })]);

    expectFailure(result, 'life_action.result_verification_requires_session_result');
    expect(action.status).toBe('in_progress');
  });

  it('блокирует подтверждение при выполняющейся или приостановленной сессии', async () => {
    for (const paused of [false, true]) {
      const action = markLifeActionInProgress(
        createReadyLifeAction(`unfinished-${paused ? 'paused' : 'running'}`, DATE),
      );
      const running = ActionSession.start({
        id: id(`unfinished-session-${paused ? 'paused' : 'running'}`),
        lifeActionId: action.id,
        startedAt: new Date('2026-08-07T11:00:00.000Z'),
        eventId: id(`unfinished-start-${paused ? 'paused' : 'running'}`),
      });
      if (paused) {
        running.pause(new Date('2026-08-07T11:10:00.000Z'), id('pause-event'));
      }
      running.clearUncommittedEvents();

      const result = await execute(action, [successfulSession(action.id), running]);
      expectFailure(result, 'life_action.result_verification_requires_closed_session');
      expect(action.status).toBe('in_progress');
    }
  });

  it('не подтверждает уже завершённое или ещё не начатое действие повторно', async () => {
    const ready = createReadyLifeAction('ready-verification', DATE);
    const readyResult = await execute(ready, [successfulSession(ready.id)]);
    expectFailure(readyResult, 'life_action.result_verification_requires_in_progress');

    const completed = markLifeActionInProgress(
      createReadyLifeAction('completed-verification', DATE),
    );
    const first = await execute(completed, [successfulSession(completed.id)]);
    expect(first.ok).toBe(true);
    const second = await execute(completed, [successfulSession(completed.id)]);
    expectFailure(second, 'life_action.result_verification_requires_in_progress');
  });
});

async function execute(
  action: ReturnType<typeof createReadyLifeAction>,
  sessions: readonly ActionSession[],
) {
  return new VerifyLifeActionResult(
    new TestLifeActionRepository([action]),
    new TestActionSessionRepository(sessions),
    new FakeClock(NOW),
    new FakeIdGenerator('verify'),
  ).execute({
    lifeActionId: action.id,
    actualResult: ActionActualResult.create('Фактический результат'),
  });
}

function expectFailure(
  result: Awaited<ReturnType<VerifyLifeActionResult['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected failure');
  expect(result.error.code).toBe(code);
}
