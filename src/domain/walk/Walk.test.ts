import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { Walk } from './Walk';
import { WALK_MODE } from './WalkMode';
import { WALK_STATUS } from './WalkStatus';
import { WALK_TYPE, isWalkType } from './WalkType';

const DATE = DayDate.create('2026-08-08');
const NOW = new Date('2026-08-08T08:00:00.000Z');

describe('Walk', () => {
  it.each(Object.values(WALK_TYPE))('creates the %s walk type', (type) => {
    const walk = Walk.create({ id: EntityId.create(`walk-${type}`), date: DATE, type, now: NOW });

    expect(walk.type).toBe(type);
    expect(walk.date.equals(DATE)).toBe(true);
    expect(walk.createdAt).toEqual(NOW);
    expect(walk.updatedAt).toEqual(NOW);
    expect(walk.version).toBe(1);
    expect(walk.status).toBe(WALK_STATUS.planned);
  });

  it('starts once and keeps the original start data on a repeated start', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-start'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: NOW,
    });
    const started = walk.start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      timerTargetMinutes: 20,
      reflectionQuestion: 'Что важно?',
    });
    const repeated = started.start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T09:00:00.000Z'),
      reflectionQuestion: 'Другой вопрос',
    });

    expect(started).toMatchObject({
      status: WALK_STATUS.running,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 20,
      reflectionQuestion: 'Что важно?',
      version: 2,
    });
    expect(repeated).toBe(started);
  });

  it('rejects an unknown walk type', () => {
    expect(isWalkType('unknown')).toBe(false);
    expect(() =>
      Walk.create({
        id: EntityId.create('walk-unknown'),
        date: DATE,
        type: 'unknown' as never,
        now: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_type' }));
  });

  it('completes a running walk with actual timestamps, trimmed result and photo', () => {
    const started = runningWalk('complete', new Date('2026-08-08T23:50:00.000Z'));
    const completed = started.complete({
      endedAt: new Date('2026-08-09T00:20:00.000Z'),
      result: '  Стало спокойнее.  ',
      photo: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', sizeBytes: 3 },
    });

    expect(completed).toMatchObject({
      status: WALK_STATUS.completed,
      mode: started.mode,
      timerTargetMinutes: started.timerTargetMinutes,
      reflectionQuestion: started.reflectionQuestion,
      result: 'Стало спокойнее.',
      version: 3,
    });
    expect(completed.startedAt).toEqual(started.startedAt);
    expect(completed.endedAt).toEqual(new Date('2026-08-09T00:20:00.000Z'));
    expect(completed.actualDurationMilliseconds).toBe(30 * 60 * 1000);
  });

  it('allows an empty result and rejects an overlong result', () => {
    const started = runningWalk('result', new Date('2026-08-08T08:00:00.000Z'));
    expect(
      started.complete({ endedAt: new Date('2026-08-08T08:10:00.000Z'), result: '   ' }).result,
    ).toBeNull();
    expect(() =>
      started.complete({
        endedAt: new Date('2026-08-08T08:10:00.000Z'),
        result: 'x'.repeat(1001),
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.result_too_long' }));
  });

  it('abandons only a running walk and does not allow a second transition', () => {
    const planned = Walk.create({
      id: EntityId.create('walk-planned-finish'),
      date: DATE,
      type: WALK_TYPE.physical,
      now: NOW,
    });
    expect(() => planned.complete({ endedAt: NOW })).toThrowError(
      expect.objectContaining({ code: 'walk.cannot_complete' }),
    );
    const abandoned = runningWalk('abandon', NOW).abandon(new Date('2026-08-08T08:30:00.000Z'));
    expect(abandoned.status).toBe(WALK_STATUS.abandoned);
    expect(() => abandoned.abandon(new Date('2026-08-08T09:00:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'walk.cannot_abandon' }),
    );
    expect(() =>
      abandoned.complete({ endedAt: new Date('2026-08-08T09:00:00.000Z') }),
    ).toThrowError(expect.objectContaining({ code: 'walk.cannot_complete' }));
  });
});

function runningWalk(id: string, startedAt: Date): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.mindful,
    now: new Date(startedAt.getTime() - 60_000),
  }).start({
    mode: WALK_MODE.timer,
    startedAt,
    timerTargetMinutes: 20,
    reflectionQuestion: 'Что важно заметить?',
  });
}
