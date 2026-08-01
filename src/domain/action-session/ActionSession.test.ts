import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { ActionSession } from './ActionSession';
import { ACTION_SESSION_STATUS } from './ActionSessionStatus';
import { SESSION_COMPLETION_KIND } from './SessionCompletionKind';
import { SessionResultNote } from './SessionResultNote';
import {
  ActionSessionCompleted,
  ActionSessionPaused,
  ActionSessionResumed,
  ActionSessionStarted,
} from './events';

describe('ActionSession.start', () => {
  it('создаёт running-сессию для LifeAction с начальной версией и событием', () => {
    const startedAt = time(9, 0);
    const session = startSession(startedAt);

    expect(session.id.toString()).toBe('session-1');
    expect(session.lifeActionId.toString()).toBe('action-1');
    expect(session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(session.startedAt).toEqual(startedAt);
    expect(session.pausedAt).toBeNull();
    expect(session.completedAt).toBeNull();
    expect(session.completionKind).toBeNull();
    expect(session.pauseIntervals).toEqual([]);
    expect(session.version).toBe(1);
    expect(session.isRunning()).toBe(true);

    const [event] = session.getUncommittedEvents();
    expect(event).toBeInstanceOf(ActionSessionStarted);
    expect(event).toMatchObject({
      eventType: 'session.started',
      actionSessionId: id('session-1'),
      lifeActionId: id('action-1'),
    });
    expect(event?.occurredAt).toEqual(startedAt);
  });

  it('защищает дату начала и массив событий от внешней мутации', () => {
    const startedAt = time(9, 0);
    const session = startSession(startedAt);
    const events = session.getUncommittedEvents();

    startedAt.setFullYear(2030);
    session.startedAt.setFullYear(2031);
    if (events[0] !== undefined) {
      events[0].occurredAt.setFullYear(2032);
    }
    (events as DomainEventArray).length = 0;

    expect(session.startedAt).toEqual(time(9, 0));
    expect(session.getUncommittedEvents()).toHaveLength(1);
  });

  it('запрещает создание без корректного lifeActionId', () => {
    expect(() =>
      ActionSession.start({
        id: id('session-1'),
        lifeActionId: undefined as unknown as EntityId,
        startedAt: time(9, 0),
        eventId: id('event-1'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.invalid_entity_id' }));
  });
});

describe('ActionSession pause и resume', () => {
  it('переводит running в paused, увеличивает версию и создаёт событие', () => {
    const session = startSession();

    session.pause(time(9, 10), id('event-pause'));

    expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(session.pausedAt).toEqual(time(9, 10));
    expect(session.version).toBe(2);
    expect(session.isPaused()).toBe(true);
    expect(session.getUncommittedEvents()[1]).toBeInstanceOf(ActionSessionPaused);
  });

  it('делает повторную паузу идемпотентной', () => {
    const session = startSession();
    session.pause(time(9, 10), id('event-pause'));

    session.pause(time(9, 20), id('event-duplicate'));

    expect(session.pausedAt).toEqual(time(9, 10));
    expect(session.version).toBe(2);
    expect(session.getUncommittedEvents()).toHaveLength(2);
  });

  it('возобновляет paused, закрывает интервал и создаёт событие', () => {
    const session = startSession();
    session.pause(time(9, 10), id('event-pause'));

    session.resume(time(9, 15), id('event-resume'));

    expect(session.status).toBe(ACTION_SESSION_STATUS.running);
    expect(session.pausedAt).toBeNull();
    expect(session.pauseIntervals).toHaveLength(1);
    expect(session.pauseIntervals[0]?.durationMilliseconds).toBe(300_000);
    expect(session.version).toBe(3);
    const event = session.getUncommittedEvents()[2];
    expect(event).toBeInstanceOf(ActionSessionResumed);
    if (!(event instanceof ActionSessionResumed)) {
      throw new Error('Ожидалось событие продолжения сессии.');
    }
    expect(event.pausedAt).toEqual(time(9, 10));
    expect(event.occurredAt).toEqual(time(9, 15));
  });

  it('делает resume уже running-сессии идемпотентным', () => {
    const session = startSession();

    session.resume(time(9, 10), id('event-resume'));

    expect(session.version).toBe(1);
    expect(session.pauseIntervals).toHaveLength(0);
    expect(session.getUncommittedEvents()).toHaveLength(1);
  });

  it('разрешает нулевую паузу', () => {
    const session = startSession();
    session.pause(time(9, 10), id('event-pause'));

    session.resume(time(9, 10), id('event-resume'));

    expect(session.pauseIntervals[0]?.durationMilliseconds).toBe(0);
  });

  it('отклоняет время перехода раньше начала или последнего перехода', () => {
    const session = startSession();

    expect(() => session.pause(time(8, 59), id('event-pause'))).toThrowError(
      expect.objectContaining({ code: 'action_session.time_before_last_transition' }),
    );

    session.pause(time(9, 10), id('event-pause'));
    expect(() => session.resume(time(9, 9), id('event-resume'))).toThrowError(
      expect.objectContaining({ code: 'action_session.time_before_last_transition' }),
    );
    expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(session.version).toBe(2);
  });
});

describe('ActionSession.complete', () => {
  it('завершает running-сессию и создаёт событие с длительностями и результатом', () => {
    const session = startSession();
    const resultNote = SessionResultNote.create('Получен рабочий черновик');

    session.complete({
      completedAt: time(10, 0),
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote,
      eventId: id('event-complete'),
    });

    expect(session.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(session.completedAt).toEqual(time(10, 0));
    expect(session.completionKind).toBe(SESSION_COMPLETION_KIND.completed);
    expect(session.resultNote).toBe(resultNote);
    expect(session.version).toBe(2);
    expect(session.isCompleted()).toBe(true);
    expect(session.isInterrupted()).toBe(false);

    const event = session.getUncommittedEvents()[1];
    expect(event).toBeInstanceOf(ActionSessionCompleted);
    if (!(event instanceof ActionSessionCompleted)) {
      throw new Error('Ожидалось событие завершения сессии.');
    }
    expect(event).toMatchObject({
      eventType: 'session.completed',
      completionKind: 'completed',
      workedDurationMilliseconds: 3_600_000,
      pausedDurationMilliseconds: 0,
      resultNote,
    });
  });

  it('при завершении paused закрывает последнюю паузу и исключает её из работы', () => {
    const session = startSession();
    session.pause(time(9, 15), id('event-pause'));

    session.complete({
      completedAt: time(9, 45),
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: id('event-complete'),
    });

    expect(session.pausedAt).toBeNull();
    expect(session.pauseIntervals).toHaveLength(1);
    expect(session.pauseIntervals[0]?.durationMilliseconds).toBe(1_800_000);
    expect(session.elapsedDurationAt(time(12, 0))).toBe(2_700_000);
    expect(session.pausedDurationAt(time(12, 0))).toBe(1_800_000);
    expect(session.workedDurationAt(time(12, 0))).toBe(900_000);
  });

  it('сохраняет отработанное время прерванной сессии', () => {
    const session = startSession();

    session.complete({
      completedAt: time(9, 20),
      completionKind: SESSION_COMPLETION_KIND.interrupted,
      eventId: id('event-interrupt'),
    });

    expect(session.isInterrupted()).toBe(true);
    expect(session.workedDurationAt(time(18, 0))).toBe(1_200_000);
  });

  it('делает повторное завершение идемпотентным', () => {
    const session = startSession();
    session.complete({
      completedAt: time(9, 20),
      completionKind: SESSION_COMPLETION_KIND.interrupted,
      eventId: id('event-interrupt'),
    });

    session.complete({
      completedAt: time(10, 0),
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: SessionResultNote.create('Не должно сохраниться'),
      eventId: id('event-duplicate'),
    });

    expect(session.completedAt).toEqual(time(9, 20));
    expect(session.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
    expect(session.resultNote).toBeNull();
    expect(session.version).toBe(2);
    expect(session.getUncommittedEvents()).toHaveLength(2);
  });

  it('запрещает завершение раньше последнего перехода без частичной мутации', () => {
    const session = startSession();
    session.pause(time(9, 20), id('event-pause'));

    expect(() =>
      session.complete({
        completedAt: time(9, 19),
        completionKind: SESSION_COMPLETION_KIND.completed,
        eventId: id('event-complete'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'action_session.time_before_last_transition' }));
    expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(session.pauseIntervals).toHaveLength(0);
    expect(session.version).toBe(2);
  });

  it('запрещает pause и resume завершённой сессии', () => {
    const session = startSession();
    session.complete({
      completedAt: time(9, 20),
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: id('event-complete'),
    });

    expect(() => session.pause(time(9, 30), id('event-pause'))).toThrowError(
      expect.objectContaining({ code: 'action_session.pause_requires_running' }),
    );
    expect(() => session.resume(time(9, 30), id('event-resume'))).toThrowError(
      expect.objectContaining({ code: 'action_session.resume_requires_paused' }),
    );
  });
});

describe('ActionSession durations и события', () => {
  it('считает elapsed, paused и worked для нескольких пауз', () => {
    const session = startSession();
    session.pause(time(9, 10), id('pause-1'));
    session.resume(time(9, 15), id('resume-1'));
    session.pause(time(9, 30), id('pause-2'));
    session.resume(time(9, 40), id('resume-2'));

    expect(session.elapsedDurationAt(time(10, 0))).toBe(3_600_000);
    expect(session.pausedDurationAt(time(10, 0))).toBe(900_000);
    expect(session.workedDurationAt(time(10, 0))).toBe(2_700_000);
  });

  it('учитывает открытую паузу только в pausedDuration', () => {
    const session = startSession();
    session.pause(time(9, 20), id('event-pause'));

    expect(session.elapsedDurationAt(time(9, 50))).toBe(3_000_000);
    expect(session.pausedDurationAt(time(9, 50))).toBe(1_800_000);
    expect(session.workedDurationAt(time(9, 50))).toBe(1_200_000);
  });

  it('замораживает все длительности после завершения', () => {
    const session = startSession();
    session.complete({
      completedAt: time(9, 30),
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: id('event-complete'),
    });

    expect(session.elapsedDurationAt(time(18, 0))).toBe(1_800_000);
    expect(session.workedDurationAt(time(18, 0))).toBe(1_800_000);
  });

  it('отклоняет расчёт раньше начала и раньше текущего перехода', () => {
    const session = startSession();
    expect(() => session.elapsedDurationAt(time(8, 59))).toThrowError(
      expect.objectContaining({ code: 'action_session.time_before_start' }),
    );

    session.pause(time(9, 20), id('event-pause'));
    expect(() => session.pausedDurationAt(time(9, 19))).toThrowError(
      expect.objectContaining({ code: 'action_session.time_before_last_transition' }),
    );
  });

  it('очищает непереданные события без изменения ранее выданного снимка', () => {
    const session = startSession();
    const snapshot = session.getUncommittedEvents();

    session.clearUncommittedEvents();

    expect(session.getUncommittedEvents()).toHaveLength(0);
    expect(snapshot).toHaveLength(1);
  });
});

type DomainEventArray = { length: number };

function startSession(startedAt = time(9, 0)): ActionSession {
  return ActionSession.start({
    id: id('session-1'),
    lifeActionId: id('action-1'),
    startedAt,
    eventId: id('event-start'),
  });
}

function time(hours: number, minutes: number): Date {
  return new Date(2026, 7, 1, hours, minutes, 0, 0);
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
