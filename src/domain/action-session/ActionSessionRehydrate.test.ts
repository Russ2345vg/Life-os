import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { ActionSession, type ActionSessionRehydrationData } from './ActionSession';
import { ACTION_SESSION_STATUS, type ActionSessionStatus } from './ActionSessionStatus';
import { PauseInterval } from './PauseInterval';
import { SESSION_COMPLETION_KIND } from './SessionCompletionKind';
import { SessionResultNote } from './SessionResultNote';

describe('ActionSession.rehydrate', () => {
  it('восстанавливает running, paused и completed без событий и сохраняет версию', () => {
    const running = ActionSession.rehydrate(runningData());
    const paused = ActionSession.rehydrate(pausedData());
    const completed = ActionSession.rehydrate(completedData());

    expect(running.status).toBe(ACTION_SESSION_STATUS.running);
    expect(paused.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(completed.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(completed.version).toBe(8);
    expect(running.getUncommittedEvents()).toHaveLength(0);
    expect(paused.getUncommittedEvents()).toHaveLength(0);
    expect(completed.getUncommittedEvents()).toHaveLength(0);
  });

  it('защищает входные Date, выходные Date и массив пауз', () => {
    const data = completedData();
    const pauseIntervals = data.pauseIntervals as PauseInterval[];
    const session = ActionSession.rehydrate(data);

    data.startedAt.setFullYear(2030);
    data.completedAt?.setFullYear(2031);
    pauseIntervals.length = 0;
    session.startedAt.setFullYear(2032);
    const returnedIntervals = session.pauseIntervals as PauseInterval[];
    returnedIntervals.length = 0;

    expect(session.startedAt).toEqual(time(9, 0));
    expect(session.completedAt).toEqual(time(10, 0));
    expect(session.pauseIntervals).toHaveLength(2);
  });

  it('отклоняет неизвестное состояние и вид завершения', () => {
    expect(() =>
      ActionSession.rehydrate({
        ...runningData(),
        status: 'active' as ActionSessionStatus,
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.invalid_status' }));

    expect(() =>
      ActionSession.rehydrate({
        ...completedData(),
        completionKind: 'cancelled' as never,
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.invalid_completion_kind' }));
  });

  it('проверяет сочетание полей running', () => {
    expect(() => ActionSession.rehydrate({ ...runningData(), pausedAt: time(9, 30) })).toThrowError(
      expect.objectContaining({ code: 'action_session.running_fields_invalid' }),
    );
    expect(() => ActionSession.rehydrate({ ...runningData(), completedAt: time(10, 0) })).toThrow(
      DomainError,
    );
  });

  it('проверяет сочетание полей paused', () => {
    expect(() => ActionSession.rehydrate({ ...pausedData(), pausedAt: null })).toThrowError(
      expect.objectContaining({ code: 'action_session.paused_fields_invalid' }),
    );
    expect(() => ActionSession.rehydrate({ ...pausedData(), completedAt: time(10, 0) })).toThrow(
      DomainError,
    );
  });

  it('проверяет сочетание полей completed', () => {
    expect(() => ActionSession.rehydrate({ ...completedData(), completedAt: null })).toThrowError(
      expect.objectContaining({ code: 'action_session.completed_fields_invalid' }),
    );
    expect(() => ActionSession.rehydrate({ ...completedData(), completionKind: null })).toThrow(
      DomainError,
    );
    expect(() => ActionSession.rehydrate({ ...completedData(), pausedAt: time(9, 50) })).toThrow(
      DomainError,
    );
  });

  it('запрещает resultNote у незавершённой сессии', () => {
    expect(() =>
      ActionSession.rehydrate({
        ...runningData(),
        resultNote: SessionResultNote.create('Лишний результат'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.uncompleted_has_result_note' }));
  });

  it('отклоняет паузу до начала сессии', () => {
    expect(() =>
      ActionSession.rehydrate({
        ...runningData(),
        pauseIntervals: [PauseInterval.create(time(8, 50), time(8, 55))],
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.pause_intervals_overlap' }));
  });

  it('отклоняет пересекающиеся и нарушающие порядок интервалы пауз', () => {
    const first = PauseInterval.create(time(9, 10), time(9, 20));
    const overlap = PauseInterval.create(time(9, 15), time(9, 25));
    const outOfOrder = PauseInterval.create(time(9, 5), time(9, 8));

    expect(() =>
      ActionSession.rehydrate({ ...runningData(), pauseIntervals: [first, overlap] }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.pause_intervals_overlap' }));
    expect(() =>
      ActionSession.rehydrate({ ...runningData(), pauseIntervals: [first, outOfOrder] }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.pause_intervals_overlap' }));
  });

  it('разрешает соприкасающиеся непересекающиеся интервалы', () => {
    const session = ActionSession.rehydrate({
      ...runningData(),
      pauseIntervals: [
        PauseInterval.create(time(9, 10), time(9, 20)),
        PauseInterval.create(time(9, 20), time(9, 30)),
      ],
    });

    expect(session.pauseIntervals).toHaveLength(2);
    expect(session.pausedDurationAt(time(10, 0))).toBe(1_200_000);
  });

  it('отклоняет открытую паузу раньше закрытой истории', () => {
    expect(() =>
      ActionSession.rehydrate({
        ...pausedData(),
        pausedAt: time(9, 20),
        pauseIntervals: [PauseInterval.create(time(9, 10), time(9, 30))],
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.paused_at_before_history' }));
  });

  it('отклоняет завершение раньше истории пауз и раньше начала', () => {
    expect(() =>
      ActionSession.rehydrate({
        ...completedData(),
        completedAt: time(9, 30),
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.completed_at_before_history' }));
    expect(() =>
      ActionSession.rehydrate({
        ...completedData(),
        pauseIntervals: [],
        completedAt: time(8, 59),
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.time_before_start' }));
  });

  it('отклоняет некорректные версию, идентификатор и время', () => {
    expect(() => ActionSession.rehydrate({ ...runningData(), version: 0 })).toThrowError(
      expect.objectContaining({ code: 'action_session.invalid_version' }),
    );
    expect(() =>
      ActionSession.rehydrate({
        ...runningData(),
        lifeActionId: null as unknown as EntityId,
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.invalid_entity_id' }));
    expect(() =>
      ActionSession.rehydrate({ ...runningData(), startedAt: new Date(Number.NaN) }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.invalid_time' }));
  });
});

function runningData(): ActionSessionRehydrationData {
  return {
    id: id('session-1'),
    lifeActionId: id('action-1'),
    status: ACTION_SESSION_STATUS.running,
    startedAt: time(9, 0),
    pausedAt: null,
    completedAt: null,
    completionKind: null,
    resultNote: null,
    pauseIntervals: [],
    version: 1,
  };
}

function pausedData(): ActionSessionRehydrationData {
  return {
    ...runningData(),
    status: ACTION_SESSION_STATUS.paused,
    pausedAt: time(9, 40),
    pauseIntervals: [PauseInterval.create(time(9, 10), time(9, 20))],
    version: 4,
  };
}

function completedData(): ActionSessionRehydrationData {
  return {
    ...runningData(),
    status: ACTION_SESSION_STATUS.completed,
    completedAt: time(10, 0),
    completionKind: SESSION_COMPLETION_KIND.completed,
    resultNote: SessionResultNote.create('Завершён полезный отрезок'),
    pauseIntervals: [
      PauseInterval.create(time(9, 10), time(9, 20)),
      PauseInterval.create(time(9, 40), time(9, 50)),
    ],
    version: 8,
  };
}

function time(hours: number, minutes: number): Date {
  return new Date(2026, 7, 1, hours, minutes, 0, 0);
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
