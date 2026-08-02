import { describe, expect, it } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../../../domain/action-session';
import { EntityId } from '../../../domain/shared/EntityId';
import type { ActionSessionRecord } from '../records/ActionSessionRecord';
import { ActionSessionRecordMapper } from './ActionSessionRecordMapper';

describe('ActionSessionRecordMapper', () => {
  it('преобразует completed ActionSession с несколькими паузами в независимую record', () => {
    const session = completedSession();
    const eventCount = session.getUncommittedEvents().length;

    const record = ActionSessionRecordMapper.toRecord(session);

    expect(record).toEqual({
      schemaVersion: 1,
      id: 'session-1',
      lifeActionId: 'action-1',
      status: 'completed',
      startedAt: '2026-08-02T09:00:00.000Z',
      pausedAt: null,
      completedAt: '2026-08-02T10:30:00.000Z',
      completionKind: 'interrupted',
      resultNote: 'Прервано внешним событием',
      pauseIntervals: [
        {
          startedAt: '2026-08-02T09:15:00.000Z',
          endedAt: '2026-08-02T09:25:00.000Z',
        },
        {
          startedAt: '2026-08-02T09:45:00.000Z',
          endedAt: '2026-08-02T10:00:00.000Z',
        },
      ],
      version: 6,
    });
    expect(session.getUncommittedEvents()).toHaveLength(eventCount);

    (record.pauseIntervals as { startedAt: string; endedAt: string }[])[0]!.startedAt =
      '2026-08-02T09:10:00.000Z';
    expect(session.pauseIntervals[0]?.startedAt.toISOString()).toBe('2026-08-02T09:15:00.000Z');
  });

  it('восстанавливает completed interrupted и сохраняет workedDuration в полном круге', () => {
    const source = completedSession();
    const before = source.workedDurationAt(time('11:00'));
    const record = ActionSessionRecordMapper.toRecord(source);
    const restored = ActionSessionRecordMapper.fromRecord(record);

    expect(restored.id.toString()).toBe(source.id.toString());
    expect(restored.lifeActionId.toString()).toBe(source.lifeActionId.toString());
    expect(restored.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(restored.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
    expect(restored.version).toBe(source.version);
    expect(restored.startedAt.toISOString()).toBe(record.startedAt);
    expect(restored.completedAt?.toISOString()).toBe(record.completedAt);
    expect(restored.pauseIntervals).toHaveLength(2);
    expect(restored.workedDurationAt(time('11:00'))).toBe(before);
    expect(restored.getUncommittedEvents()).toHaveLength(0);
    expect(ActionSessionRecordMapper.toRecord(restored)).toEqual(record);
  });

  it('восстанавливает открытую paused-сессию с тем же рабочим временем', () => {
    const source = pausedSession();
    const record = ActionSessionRecordMapper.toRecord(source);
    const restored = ActionSessionRecordMapper.fromRecord(record);
    const calculationTime = time('10:00');

    expect(record.pausedAt).toBe('2026-08-02T09:40:00.000Z');
    expect(restored.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(restored.pausedAt?.toISOString()).toBe(record.pausedAt);
    expect(restored.workedDurationAt(calculationTime)).toBe(
      source.workedDurationAt(calculationTime),
    );
    expect(restored.getUncommittedEvents()).toHaveLength(0);
  });

  it('отклоняет неподдерживаемую schemaVersion и некорректный EntityId', () => {
    const record = ActionSessionRecordMapper.toRecord(completedSession());

    expect(() =>
      ActionSessionRecordMapper.fromRecord({
        ...record,
        schemaVersion: 2,
      } as unknown as ActionSessionRecord),
    ).toThrowError(expect.objectContaining({ code: 'persistence.unsupported_schema_version' }));
    expect(() =>
      ActionSessionRecordMapper.fromRecord({ ...record, lifeActionId: '' }),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_entity_id' }));
  });

  it('отклоняет повреждённую дату и отсутствие обязательного поля', () => {
    const invalidDate = {
      ...ActionSessionRecordMapper.toRecord(completedSession()),
      completedAt: '2026-08-02T10:30:00.000',
    };
    const missingPauseIntervals = ActionSessionRecordMapper.toRecord(completedSession());
    delete (
      missingPauseIntervals as {
        pauseIntervals?: ActionSessionRecord['pauseIntervals'];
      }
    ).pauseIntervals;

    expect(() => ActionSessionRecordMapper.fromRecord(invalidDate)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_date' }),
    );
    expect(() => ActionSessionRecordMapper.fromRecord(missingPauseIntervals)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_record' }),
    );
  });
});

function completedSession(): ActionSession {
  const session = startedSession();
  session.pause(time('09:15'), id('event-pause-1'));
  session.resume(time('09:25'), id('event-resume-1'));
  session.pause(time('09:45'), id('event-pause-2'));
  session.resume(time('10:00'), id('event-resume-2'));
  session.complete({
    completedAt: time('10:30'),
    completionKind: SESSION_COMPLETION_KIND.interrupted,
    resultNote: SessionResultNote.create('Прервано внешним событием'),
    eventId: id('event-completed'),
  });
  return session;
}

function pausedSession(): ActionSession {
  const session = startedSession();
  session.pause(time('09:15'), id('event-pause-1'));
  session.resume(time('09:25'), id('event-resume-1'));
  session.pause(time('09:40'), id('event-pause-2'));
  return session;
}

function startedSession(): ActionSession {
  return ActionSession.start({
    id: id('session-1'),
    lifeActionId: id('action-1'),
    startedAt: time('09:00'),
    eventId: id('event-started'),
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function time(value: string): Date {
  return new Date(`2026-08-02T${value}:00.000Z`);
}
