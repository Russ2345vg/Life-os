import { describe, expect, it } from 'vitest';
import { buildWalkInsights } from './WalkInsightEngine';
import type { WalkObservation } from './WalkInsights';
import * as application from '../index';
import { FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { DayDate } from '../../domain';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';

const modules = import.meta.glob<typeof import('./WalkRecommendationPolicy')>(
  './WalkRecommendationPolicy.ts',
  { eager: true },
);
function policy() {
  const module = Object.values(modules)[0];
  expect(module, 'WALK-13 recommendation policy exists').toBeDefined();
  return module!;
}
function source(recovery: number, reflection: number, high = true) {
  const observations: WalkObservation[] = Array.from({ length: recovery + reflection }, (_, i) => ({
    intent: i < recovery ? 'recovery' : 'reflection',
    durationMilliseconds: 1800000,
    startedAt: null,
    beforeState: { energy: 3, tension: high ? 8 : 6, clarity: 3 },
    afterState: { energy: 5, tension: high ? 6 : 4, clarity: 5 },
  }));
  return {
    startDate: '2026-07-28',
    endDate: '2026-08-26',
    insights: buildWalkInsights(observations),
  };
}
describe('WALK-13 one optional recommendation', () => {
  it('returns neutral with insufficient comparable data despite high current tension', () => {
    expect(
      policy().selectWalkRecommendation(source(2, 2), { energy: 4, tension: 9, clarity: 2 }),
    ).toBeNull();
  });
  it('prioritizes comparable recovery over a larger stable reflection sample', () => {
    expect(
      policy().selectWalkRecommendation(source(3, 8), { energy: 4, tension: 7, clarity: 2 }),
    ).toMatchObject({
      intent: 'recovery',
      durationMinutes: 30,
      sampleSize: 3,
      confidenceLevel: 'preliminary',
      insight: { kind: 'beforeState', evidence: { averageDelta: -2, improvedCount: 3 } },
      currentState: { tension: 7 },
      startDate: '2026-07-28',
      endDate: '2026-08-26',
    });
  });
  it('does not pretend saved before-state is current context', () => {
    expect(policy().selectWalkRecommendation(source(3, 8), null)).toMatchObject({
      intent: 'reflection',
      currentState: null,
      sampleSize: 8,
      confidenceLevel: 'stable',
    });
  });
  it('does not borrow lower-tension recovery samples for a high-tension suggestion', () => {
    expect(
      policy().selectWalkRecommendation(source(3, 8, false), { energy: 4, tension: 8, clarity: 2 })
        ?.intent,
    ).toBe('reflection');
  });
  it('uses sample size then fixed intent order and never a mode-effectiveness score', () => {
    expect(policy().selectWalkRecommendation(source(8, 9), null)?.intent).toBe('reflection');
    expect(policy().selectWalkRecommendation(source(8, 8), null)?.intent).toBe('recovery');
    const input = source(8, 8);
    expect(
      policy().selectWalkRecommendation(
        { ...input, insights: [...input.insights].reverse() },
        null,
      ),
    ).toEqual(policy().selectWalkRecommendation(input, null));
  });
  it('copies optional context rather than modifying caller-owned state', () => {
    const state = { energy: 4, tension: 8, clarity: 2 };
    const before = structuredClone(state);
    const result = policy().selectWalkRecommendation(source(3, 0), state);
    expect(state).toEqual(before);
    expect(result?.currentState).not.toBe(state);
  });
  it('derives evidence through WALK-12 projection with only read capabilities', async () => {
    const analytics = new application.GetWalkAnalytics(
      {
        findAll: async () =>
          Array.from({ length: 8 }, (_, i) =>
            historyWalk(`e${i}`, {
              intent: 'recovery',
              beforeState: { energy: 3, tension: 8, clarity: 3 },
              afterState: { energy: 5, tension: 6, clarity: 5 },
            }),
          ),
      },
      new FakeCurrentDateProvider(DayDate.create('2026-08-26')),
      { findByWalkId: async () => [] },
    );
    expect(application.GetWalkRecommendation).toBeTypeOf('function');
    const result = await new application.GetWalkRecommendation(analytics).execute();
    expect(result).toMatchObject({
      intent: 'recovery',
      sampleSize: 8,
      confidenceLevel: 'stable',
      insight: { evidence: { averageDelta: -2 } },
    });
  });
  it('does not hide storage failures as a neutral recommendation', async () => {
    expect(application.GetWalkRecommendation).toBeTypeOf('function');
    const query = new application.GetWalkRecommendation({
      execute: async () => {
        throw new Error('read failed');
      },
    });
    await expect(query.execute()).rejects.toThrow('read failed');
  });
});
