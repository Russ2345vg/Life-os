import { describe, expect, it } from 'vitest';
import * as application from '../index';
import { DayDate, EntityId, WALK_INTENT, WALK_MODE, WALK_TYPE, Walk } from '../../domain';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';

function query(walks: readonly Walk[] = []) {
  expect(application.GetWalkHistory).toBeTypeOf('function');
  return new application.GetWalkHistory({ findAll: async () => walks });
}

describe('GetWalkHistory — completed facts only', () => {
  it('includes completed walks across dates, newest completion first rather than update order', async () => {
    const old = historyWalk('old', { updatedAt: new Date('2026-08-29T09:00:00Z') });
    const recent = historyWalk('new', {
      date: DayDate.create('2026-08-27'),
      startedAt: new Date('2026-08-27T23:55:00Z'),
      endedAt: new Date('2026-08-28T00:05:00Z'),
      updatedAt: new Date('2026-08-28T00:05:00Z'),
    });
    expect((await query([old, recent]).execute()).map((walk) => walk.id.toString())).toEqual([
      'new',
      'old',
    ]);
  });

  it('excludes planned, running, paused and abandoned walks', async () => {
    const planned = Walk.create({
      id: EntityId.create('planned'),
      date: DayDate.create('2026-08-26'),
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-26T07:00:00Z'),
    });
    const running = planned.start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-26T08:00:00Z'),
      reflectionQuestion: 'Что вокруг?',
    });
    for (const excluded of [
      planned,
      running,
      running.pause(new Date('2026-08-26T08:10:00Z')),
      running.abandon(new Date('2026-08-26T08:15:00Z')),
    ]) {
      expect(
        (await query([excluded, historyWalk('done')]).execute()).map((walk) => walk.id.toString()),
      ).toEqual(['done']);
    }
  });

  it.each([WALK_INTENT.free, WALK_INTENT.recovery, WALK_INTENT.reflection])(
    'filters by stored %s intent, not legacy type',
    async (intent) => {
      const walks = Object.values(WALK_INTENT).map((mode) => historyWalk(mode, { intent: mode }));
      walks.push(historyWalk('legacy', { intent: null, type: WALK_TYPE.restorative }));
      expect((await query(walks).execute(intent)).map((walk) => walk.id.toString())).toEqual([
        intent,
      ]);
    },
  );

  it('keeps a legacy completed walk without intent or outcome in All', async () => {
    expect(await query([historyWalk('legacy', { intent: null })]).execute()).toMatchObject([
      { intent: null, result: null, impact: null },
    ]);
  });

  it('uses deterministic id order for equal completion times', async () => {
    expect(
      (await query([historyWalk('z'), historyWalk('a')]).execute()).map((walk) =>
        walk.id.toString(),
      ),
    ).toEqual(['a', 'z']);
  });

  it.each([0, 1, 21, 100])(
    'reads %i records without modifying repository contents',
    async (count) => {
      const walks = Array.from({ length: count }, (_, i) => historyWalk(`walk-${i}`));
      const repository = { findAll: async () => walks };
      const before = [...walks];
      expect(application.GetWalkHistory).toBeTypeOf('function');
      expect(await new application.GetWalkHistory(repository).execute()).toHaveLength(count);
      expect(await repository.findAll()).toEqual(before);
    },
  );

  it('does not turn a storage failure into an empty history', async () => {
    expect(application.GetWalkHistory).toBeTypeOf('function');
    const history = new application.GetWalkHistory({
      findAll: async () => {
        throw new Error('storage offline');
      },
    });
    await expect(history.execute()).rejects.toThrow('storage offline');
  });
});
