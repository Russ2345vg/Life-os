import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, WALK_MODE, WALK_STATUS, WALK_TYPE, Walk } from '../../domain';
import { formatStopwatch, formatTimer, getWalkTimeSnapshot } from './WalkTimer';

const STARTED_AT = new Date('2026-08-08T08:00:00.000Z');

describe('walk timer presentation', () => {
  it('calculates stopwatch time from startedAt', () => {
    const walk = runningWalk(WALK_MODE.stopwatch);
    expect(getWalkTimeSnapshot(walk, new Date('2026-08-08T08:12:34.900Z'))).toEqual({
      seconds: 754,
      expired: false,
    });
    expect(formatStopwatch(754)).toBe('00:12:34');
  });

  it('calculates countdown from startedAt and target without persisted ticks', () => {
    const walk = runningWalk(WALK_MODE.timer, 20);
    expect(getWalkTimeSnapshot(walk, new Date('2026-08-08T08:02:34.000Z'))).toEqual({
      seconds: 1046,
      expired: false,
    });
    expect(formatTimer(1046)).toBe('17:26');
  });

  it('clamps an expired timer at zero and leaves status running', () => {
    const walk = runningWalk(WALK_MODE.timer, 10);
    expect(getWalkTimeSnapshot(walk, new Date('2026-08-08T09:00:00.000Z'))).toEqual({
      seconds: 0,
      expired: true,
    });
    expect(walk.status).toBe(WALK_STATUS.running);
  });

  it('freezes stopwatch elapsed time at the pause timestamp', () => {
    const walk = runningWalk(WALK_MODE.stopwatch).pause(new Date('2026-08-08T08:10:00.000Z'));

    expect(getWalkTimeSnapshot(walk, new Date('2026-08-08T08:40:00.000Z'))).toEqual({
      seconds: 600,
      expired: false,
    });
  });

  it('does not consume timer time while the walk is paused', () => {
    const walk = runningWalk(WALK_MODE.timer, 20).pause(new Date('2026-08-08T08:05:00.000Z'));

    expect(getWalkTimeSnapshot(walk, new Date('2026-08-08T08:40:00.000Z'))).toEqual({
      seconds: 900,
      expired: false,
    });
  });

  it('continues a timer from active time after resume without consuming the pause', () => {
    const walk = runningWalk(WALK_MODE.timer, 20)
      .pause(new Date('2026-08-08T08:05:00.000Z'))
      .resume(new Date('2026-08-08T08:08:00.000Z'));

    expect(getWalkTimeSnapshot(walk, new Date('2026-08-08T08:10:00.000Z'))).toEqual({
      seconds: 13 * 60,
      expired: false,
    });
  });
});

function runningWalk(mode: typeof WALK_MODE.stopwatch): Walk;
function runningWalk(mode: typeof WALK_MODE.timer, target: number): Walk;
function runningWalk(
  mode: typeof WALK_MODE.stopwatch | typeof WALK_MODE.timer,
  target?: number,
): Walk {
  const planned = Walk.create({
    id: EntityId.create(`walk-${mode}`),
    date: DayDate.create('2026-08-08'),
    type: WALK_TYPE.mindful,
    now: new Date('2026-08-08T07:00:00.000Z'),
  });
  return planned.start(
    mode === WALK_MODE.timer
      ? {
          mode,
          startedAt: STARTED_AT,
          timerTargetMinutes: target ?? 10,
          reflectionQuestion: 'Вопрос',
        }
      : { mode, startedAt: STARTED_AT, reflectionQuestion: 'Вопрос' },
  );
}
