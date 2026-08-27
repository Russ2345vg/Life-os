import { describe, expect, it, vi } from 'vitest';
import * as application from '../index';
import {
  DayDate,
  EntityId,
  PauseInterval,
  WALK_INTENT,
  WALK_MODE,
  WALK_TYPE,
  Walk,
  WalkCapture,
} from '../../domain';
import { FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
import { GetWalkStatistics } from './GetWalkStatistics';

const TODAY = DayDate.create('2026-08-26');
function unexpectedPort(): never {
  throw new Error('Statistics must only read findAll');
}
function queryFor(walks: readonly Walk[] = [], captures: readonly WalkCapture[] = []) {
  expect(application.GetWalkAnalytics).toBeTypeOf('function');
  return new application.GetWalkAnalytics(
    { findAll: async () => walks },
    new FakeCurrentDateProvider(TODAY),
    { findByWalkId: async (id) => captures.filter((capture) => capture.walkId.equals(id)) },
  );
}
function walkOn(id: string, date: string) {
  return historyWalk(id, { date: DayDate.create(date) });
}
function thought(id: string, walkId: string) {
  return WalkCapture.create({
    id: EntityId.create(id),
    walkId: EntityId.create(walkId),
    content: 'Сохранённая мысль',
    capturedAt: new Date('2026-08-26T08:10:00Z'),
    walkElapsedMs: 600000,
  });
}
const PAIRS = [
  historyWalk('a', {
    beforeState: { energy: 2, tension: 8, clarity: 3 },
    afterState: { energy: 4, tension: 5, clarity: 8 },
  }),
  historyWalk('b', {
    beforeState: { energy: 4, tension: 6, clarity: 5 },
    afterState: { energy: 6, tension: 5, clarity: 2 },
  }),
];

describe('GetWalkAnalytics — completed, existing facts only', () => {
  it('defaults to 30 inclusive calendar days, with no invented empty averages', async () => {
    const result = await queryFor().execute();
    expect(result).toMatchObject({
      period: 'last30Days',
      startDate: '2026-07-28',
      endDate: '2026-08-26',
      completedCount: 0,
      daysWithWalks: 0,
      totalDurationMilliseconds: 0,
      averageDurationMilliseconds: null,
      unclassifiedCount: 0,
      withTextResultCount: 0,
      withCapturesCount: 0,
      captureCount: 0,
      impactCounts: { better: 0, same: 0, worse: 0 },
    });
    expect(result.days).toHaveLength(30);
    expect(result.days.every((day) => day.count === 0)).toBe(true);
    expect(result.state.energy).toEqual({
      sampleSize: 0,
      averageBefore: null,
      averageAfter: null,
      averageDelta: null,
    });
    expect(result.byIntent.recovery.averageDurationMilliseconds).toBeNull();
  });

  it.each(['planned', 'running', 'paused', 'abandoned'] as const)(
    'excludes %s walks from all completed aggregates',
    async (status) => {
      const planned = Walk.create({
        id: EntityId.create('unfinished'),
        date: TODAY,
        type: WALK_TYPE.mindful,
        intent: WALK_INTENT.free,
        now: new Date('2026-08-26T07:00:00Z'),
      });
      const running = planned.start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-26T08:00:00Z'),
        reflectionQuestion: 'Что вокруг?',
      });
      const variants = {
        planned,
        running,
        paused: running.pause(new Date('2026-08-26T08:10:00Z')),
        abandoned: running.abandon(new Date('2026-08-26T08:20:00Z')),
      };
      const result = await queryFor(
        [variants[status], historyWalk('done')],
        [thought('ignored', 'unfinished')],
      ).execute();
      expect(result.completedCount).toBe(1);
      expect(result.totalDurationMilliseconds).toBe(1800000);
      expect(result.byIntent.free.count).toBe(1);
      expect(result.withCapturesCount).toBe(0);
    },
  );

  it('counts completed walks, independently of whether they recorded an outcome', async () => {
    expect(
      (await queryFor([historyWalk('a'), historyWalk('b'), historyWalk('c')]).execute())
        .completedCount,
    ).toBe(3);
  });
  it('sums actual time after pauses rather than planned timer targets', async () => {
    const paused = historyWalk('paused-done', {
      mode: WALK_MODE.timer,
      timerTargetMinutes: 90,
      pauseIntervals: [
        PauseInterval.create(new Date('2026-08-26T08:10:00Z'), new Date('2026-08-26T08:20:00Z')),
      ],
    });
    expect(
      (await queryFor([paused, historyWalk('other')]).execute()).totalDurationMilliseconds,
    ).toBe(3000000);
  });
  it('averages actual duration over all completed walks, including a true zero', async () => {
    const zero = historyWalk('zero', { endedAt: new Date('2026-08-26T08:00:00Z') });
    expect(
      (await queryFor([zero, historyWalk('normal')]).execute()).averageDurationMilliseconds,
    ).toBe(900000);
  });
  it('counts distinct saved dates, not the number of sessions or UTC completion days', async () => {
    expect(
      (
        await queryFor([
          walkOn('a', '2026-08-20'),
          walkOn('b', '2026-08-20'),
          walkOn('c', '2026-08-26'),
        ]).execute()
      ).daysWithWalks,
    ).toBe(2);
  });

  const boundaryWalks = [
    walkOn('too-old', '2026-07-27'),
    walkOn('first-30', '2026-07-28'),
    walkOn('before-7', '2026-08-19'),
    walkOn('first-7', '2026-08-20'),
    walkOn('today', '2026-08-26'),
    walkOn('future', '2026-08-27'),
  ];
  it.each([
    ['last7Days', 2, '2026-08-20'],
    ['last30Days', 4, '2026-07-28'],
  ] as const)(
    'selects exact %s boundaries and excludes future Walk dates',
    async (period, count, start) => {
      expect(await queryFor(boundaryWalks).execute(period)).toMatchObject({
        completedCount: count,
        daysWithWalks: count,
        startDate: start,
        endDate: '2026-08-26',
      });
    },
  );
  it('provides a zero-filled chronological daily series whose sum is the completed count', async () => {
    expect((await queryFor(boundaryWalks).execute('last7Days')).days).toEqual([
      { date: '2026-08-20', count: 1 },
      { date: '2026-08-21', count: 0 },
      { date: '2026-08-22', count: 0 },
      { date: '2026-08-23', count: 0 },
      { date: '2026-08-24', count: 0 },
      { date: '2026-08-25', count: 0 },
      { date: '2026-08-26', count: 1 },
    ]);
  });
  it('uses the current date provider on each request, including a leap-day boundary', async () => {
    const dates = new FakeCurrentDateProvider(DayDate.create('2024-03-01'));
    expect(application.GetWalkAnalytics).toBeTypeOf('function');
    const query = new application.GetWalkAnalytics({ findAll: async () => [] }, dates, {
      findByWalkId: async () => [],
    });
    expect((await query.execute('last7Days')).startDate).toBe('2024-02-24');
    dates.setCurrentDate(DayDate.create('2024-03-02'));
    expect((await query.execute('last7Days')).startDate).toBe('2024-02-25');
  });

  it.each(Object.values(WALK_INTENT))(
    'counts %s by intent, not legacy type or timer mode',
    async (intent) => {
      const walks = Object.values(WALK_INTENT).map((value) =>
        historyWalk(value, { intent: value, type: WALK_TYPE.physical }),
      );
      walks.push(historyWalk('legacy', { intent: null, type: WALK_TYPE.restorative }));
      const result = await queryFor(walks).execute();
      expect(result.byIntent[intent].count).toBe(1);
      expect(result.byIntent[intent].averageDurationMilliseconds).toBe(1800000);
      expect(result.completedCount).toBe(4);
      expect(result.unclassifiedCount).toBe(1);
    },
  );

  it.each([
    ['energy', 3, 5, 2],
    ['tension', 7, 5, -2],
    ['clarity', 4, 5, 1],
  ] as const)(
    'computes paired %s before/after averages and signed delta',
    async (metric, before, after, delta) => {
      expect((await queryFor(PAIRS).execute()).state[metric]).toEqual({
        sampleSize: 2,
        averageBefore: before,
        averageAfter: after,
        averageDelta: delta,
      });
    },
  );
  it.each(['beforeState', 'afterState'] as const)(
    'excludes a missing %s from every paired metric',
    async (missing) => {
      const incomplete = historyWalk('incomplete', {
        beforeState: { energy: 10, tension: 10, clarity: 10 },
        afterState: { energy: 0, tension: 0, clarity: 0 },
        [missing]: null,
      });
      const result = await queryFor([...PAIRS, incomplete]).execute();
      expect(result.completedCount).toBe(3);
      expect(result.state.energy).toMatchObject({ sampleSize: 2, averageDelta: 2 });
      expect(result.state.tension).toMatchObject({ sampleSize: 2, averageDelta: -2 });
      expect(result.state.clarity).toMatchObject({ sampleSize: 2, averageDelta: 1 });
    },
  );
  it('retains valid zero scores and zero deltas rather than treating them as missing', async () => {
    const result = await queryFor([
      historyWalk('zeros', {
        beforeState: { energy: 0, tension: 10, clarity: 5 },
        afterState: { energy: 2, tension: 0, clarity: 5 },
      }),
    ]).execute();
    expect(result.state.energy).toMatchObject({ sampleSize: 1, averageBefore: 0, averageDelta: 2 });
    expect(result.state.tension).toMatchObject({
      sampleSize: 1,
      averageAfter: 0,
      averageDelta: -10,
    });
    expect(result.state.clarity).toMatchObject({ sampleSize: 1, averageDelta: 0 });
  });
  it('keeps each intent sample separate from the overall paired sample', async () => {
    const result = await queryFor([
      ...PAIRS,
      historyWalk('recovery', {
        intent: 'recovery',
        beforeState: { energy: 7, tension: 4, clarity: 6 },
        afterState: { energy: 6, tension: 2, clarity: 6 },
      }),
    ]).execute();
    expect(result.state.energy.sampleSize).toBe(3);
    expect(result.byIntent.free.state.energy).toMatchObject({ sampleSize: 2, averageDelta: 2 });
    expect(result.byIntent.recovery.state.energy).toMatchObject({
      sampleSize: 1,
      averageDelta: -1,
    });
    expect(result.byIntent.reflection.state.energy).toMatchObject({
      sampleSize: 0,
      averageDelta: null,
    });
  });
  it('counts only saved impact, even when it differs from numeric state changes', async () => {
    const result = await queryFor([
      historyWalk('better-a', { impact: 'better' }),
      historyWalk('better-b', { impact: 'better' }),
      historyWalk('same', { impact: 'same' }),
      historyWalk('worse', { impact: 'worse' }),
      ...PAIRS,
    ]).execute();
    expect(result.impactCounts).toEqual({ better: 2, same: 1, worse: 1 });
  });
  it('counts nonblank text results independently of impact and captures', async () => {
    expect(
      (
        await queryFor([
          historyWalk('text', { result: '  Есть вывод  ' }),
          historyWalk('blank', { result: '   ' }),
          historyWalk('null', { impact: 'better' }),
        ]).execute()
      ).withTextResultCount,
    ).toBe(1);
  });
  it('counts each walk with thoughts once, includes processed thoughts and excludes out-of-period thoughts', async () => {
    const captures = [
      thought('one', 'a'),
      thought('two', 'a').process(new Date('2026-08-26T09:00:00Z')),
      thought('three', 'b'),
      thought('old', 'old'),
      thought('orphan', 'absent'),
    ];
    const result = await queryFor(
      [historyWalk('a'), historyWalk('b'), historyWalk('no-thought'), walkOn('old', '2026-07-01')],
      captures,
    ).execute();
    expect(result.withCapturesCount).toBe(2);
    expect(result.captureCount).toBe(3);
  });
  it.each(['last7Days', 'last30Days'] as const)(
    'preserves existing basic statistics for %s',
    async (period) => {
      const old = await new GetWalkStatistics(
        {
          findAll: async () => boundaryWalks,
          findById: unexpectedPort,
          findByDate: unexpectedPort,
          findRunning: unexpectedPort,
          findActive: unexpectedPort,
          save: unexpectedPort,
          startIfVersionMatches: unexpectedPort,
          updateIfVersionMatches: unexpectedPort,
          deleteIfVersionMatches: unexpectedPort,
        },
        new FakeCurrentDateProvider(TODAY),
      ).execute(period);
      const result = await queryFor(boundaryWalks).execute(period);
      expect(result.completedCount).toBe(old.completedCount);
      expect(result.totalDurationMilliseconds).toBe(old.totalDurationMilliseconds);
      expect(result.averageDurationMilliseconds).toBe(old.averageDurationMilliseconds);
    },
  );
  it('reads Walks once and never invokes a write port or mutates source entities', async () => {
    expect(application.GetWalkAnalytics).toBeTypeOf('function');
    const source = Object.freeze([...PAIRS]);
    const findAll = vi.fn(async () => source);
    const save = vi.fn();
    const repository = { findAll, save };
    const query = new application.GetWalkAnalytics(repository, new FakeCurrentDateProvider(TODAY), {
      findByWalkId: async () => [],
    });
    await query.execute();
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(source[0]?.version).toBe(3);
    expect(source[0]?.reentry).toBeNull();
  });
  it.each(['walks', 'captures'] as const)(
    'surfaces %s read failures instead of plausible zero facts',
    async (failed) => {
      expect(application.GetWalkAnalytics).toBeTypeOf('function');
      const query = new application.GetWalkAnalytics(
        {
          findAll: async () => {
            if (failed === 'walks') throw new Error('read unavailable');
            return PAIRS;
          },
        },
        new FakeCurrentDateProvider(TODAY),
        {
          findByWalkId: async () => {
            if (failed === 'captures') throw new Error('read unavailable');
            return [];
          },
        },
      );
      await expect(query.execute()).rejects.toThrow('read unavailable');
    },
  );
});
