import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, WALK_MODE, WALK_STATUS, WALK_TYPE, Walk } from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { GetActiveWalk } from './GetActiveWalk';

describe('GetActiveWalk', () => {
  it('restores a paused walk as the active walk', async () => {
    const planned = Walk.create({
      id: EntityId.create('walk-planned-for-active-query'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.restorative,
      now: new Date('2026-08-08T07:00:00.000Z'),
    });
    const paused = Walk.create({
      id: EntityId.create('walk-paused-for-active-query'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-08T07:00:00.000Z'),
    })
      .start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-08T08:00:00.000Z'),
        reflectionQuestion: 'Что сейчас важно?',
      })
      .pause(new Date('2026-08-08T08:20:00.000Z'));
    const query = new GetActiveWalk(new InMemoryWalkRepository([planned, paused]));

    const active = await query.execute();

    expect(active).toMatchObject({ id: paused.id, status: WALK_STATUS.paused });
  });
});
