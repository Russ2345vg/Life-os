import { describe, expect, it } from 'vitest';
import type { WalkObservation } from './WalkInsights';

const modules = import.meta.glob<typeof import('./WalkInsightEngine')>('./WalkInsightEngine.ts', {
  eager: true,
});
function engine() {
  const module = Object.values(modules)[0];
  expect(module, 'WALK-13 insight engine exists').toBeDefined();
  return module!;
}
function pairs(count: number, overrides: Partial<WalkObservation> = {}): WalkObservation[] {
  return Array.from({ length: count }, () => ({
    intent: 'recovery',
    durationMilliseconds: 30 * 60000,
    startedAt: new Date(2026, 7, 26, 9),
    beforeState: { energy: 3, tension: 8, clarity: 3 },
    afterState: { energy: 5, tension: 6, clarity: 5 },
    ...overrides,
  }));
}
describe('WALK-13 comparable observations', () => {
  it.each([0, 1, 2])('does not personalize %i pairs', (count) => {
    expect(engine().buildWalkInsights(pairs(count))).toEqual([]);
  });
  it.each([
    [3, 'preliminary'],
    [7, 'preliminary'],
    [8, 'stable'],
  ] as const)('uses the actual recovery sample %i for confidence', (count, confidenceLevel) => {
    expect(
      engine()
        .buildWalkInsights(pairs(count))
        .find((i) => i.kind === 'mode'),
    ).toMatchObject({
      intent: 'recovery',
      metric: 'tension',
      evidence: { sampleSize: count, confidenceLevel, averageDelta: -2, improvedCount: count },
    });
  });
  it('observes reflection clarity independently of recovery and legacy intent', () => {
    const result = engine().buildWalkInsights([
      ...pairs(3, { intent: 'reflection' }),
      ...pairs(9, { intent: null }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'mode',
      intent: 'reflection',
      metric: 'clarity',
      evidence: { sampleSize: 3, averageDelta: 2 },
    });
  });
  it('excludes missing states, preserves measured zeros and never borrows overall count', () => {
    const source = [
      ...pairs(2),
      ...pairs(9, { beforeState: null }),
      ...pairs(8, { afterState: null }),
    ];
    expect(engine().buildWalkInsights(source)).toEqual([]);
    expect(
      engine().buildWalkInsights(pairs(3, { afterState: { energy: 0, tension: 0, clarity: 0 } }))[0]
        ?.evidence.averageDelta,
    ).toBe(-8);
  });
  it('requires both favorable mean and strict majority, not one outlier', () => {
    expect(
      engine().buildWalkInsights([
        ...pairs(1, { afterState: { energy: 0, tension: 0, clarity: 0 } }),
        ...pairs(2, { afterState: { energy: 3, tension: 8, clarity: 3 } }),
      ]),
    ).toEqual([]);
    expect(
      engine().buildWalkInsights(pairs(3, { afterState: { energy: 3, tension: 9, clarity: 3 } })),
    ).toEqual([]);
    expect(
      engine().buildWalkInsights([
        ...pairs(2, { afterState: { energy: 3, tension: 7, clarity: 3 } }),
        ...pairs(1, { afterState: { energy: 3, tension: 8, clarity: 3 } }),
      ]),
    ).toEqual([]);
  });
  it.each([
    [0, 'short'],
    [1199999, 'short'],
    [1200000, 'medium'],
    [2400000, 'medium'],
    [2400001, 'long'],
    [null, null],
    [-1, null],
    [NaN, null],
  ] as const)('classifies actual duration %s', (value, expected) =>
    expect(engine().walkDurationBucket(value)).toBe(expected),
  );
  it.each([
    [5, null],
    [6, 'morning'],
    [11, 'morning'],
    [12, 'day'],
    [17, 'day'],
    [18, 'evening'],
    [23, 'evening'],
  ] as const)(
    'classifies local start hour %i without inventing morning at night',
    (hour, expected) => expect(engine().walkTimeOfDay(new Date(2026, 7, 26, hour))).toBe(expected),
  );
  it('safely skips missing and invalid timestamps only for time observations', () => {
    expect(engine().walkTimeOfDay(null)).toBeNull();
    expect(engine().walkTimeOfDay(new Date(NaN))).toBeNull();
    expect(
      engine()
        .buildWalkInsights(pairs(3, { startedAt: null }))
        .some((i) => i.kind === 'mode'),
    ).toBe(true);
    expect(
      engine()
        .buildWalkInsights(pairs(3, { startedAt: null }))
        .some((i) => i.kind === 'timeOfDay'),
    ).toBe(false);
  });
  it('compares duration within intent, with weakest-cohort confidence and both samples', () => {
    const result = engine()
      .buildWalkInsights([
        ...pairs(8, { intent: 'reflection' }),
        ...pairs(3, {
          intent: 'reflection',
          durationMilliseconds: 10 * 60000,
          afterState: { energy: 3, tension: 8, clarity: 3 },
        }),
      ])
      .find((i) => i.kind === 'duration');
    expect(result).toMatchObject({
      segment: 'medium',
      intent: 'reflection',
      evidence: {
        sampleSize: 8,
        improvedCount: 8,
        confidenceLevel: 'preliminary',
        comparison: { segment: 'short', sampleSize: 3, improvedCount: 0 },
      },
    });
  });
  it('does not compare insufficient cohorts, equal rates or different intentions', () => {
    for (const other of [
      pairs(2, { durationMilliseconds: 1 }),
      pairs(3, { durationMilliseconds: 1 }),
      pairs(5, { intent: 'reflection', durationMilliseconds: 1 }),
    ]) {
      expect(
        engine()
          .buildWalkInsights([...pairs(8), ...other])
          .filter((i) => i.kind === 'duration'),
      ).toEqual([]);
    }
  });
  it('compares morning with day using saved start, not completion or date alone', () => {
    const result = engine().buildWalkInsights([
      ...pairs(3),
      ...pairs(3, {
        startedAt: new Date(2026, 7, 26, 12),
        afterState: { energy: 3, tension: 8, clarity: 3 },
      }),
    ]);
    expect(result.find((i) => i.kind === 'timeOfDay')).toMatchObject({
      segment: 'morning',
      evidence: { comparison: { segment: 'day', sampleSize: 3 } },
    });
  });
  it('high-tension evidence cannot borrow lower-state samples', () => {
    expect(
      engine()
        .buildWalkInsights([
          ...pairs(2),
          ...pairs(8, {
            beforeState: { energy: 3, tension: 6, clarity: 3 },
            afterState: { energy: 5, tension: 4, clarity: 5 },
          }),
        ])
        .filter((i) => i.kind === 'beforeState'),
    ).toEqual([]);
    expect(
      engine()
        .buildWalkInsights(pairs(3, { beforeState: { energy: 3, tension: 7, clarity: 3 } }))
        .find((i) => i.kind === 'beforeState')?.evidence.sampleSize,
    ).toBe(3);
  });
  it('is deterministic and leaves its observations untouched', () => {
    const source = pairs(8);
    const before = structuredClone(source);
    const first = engine().buildWalkInsights(source);
    expect(engine().buildWalkInsights([...source].reverse())).toEqual(first);
    expect(source).toEqual(before);
    expect(Object.isFrozen(first[0]?.evidence)).toBe(true);
  });
  it('does not cherry-pick a weak duration alternative when a third cohort ties the candidate', () => {
    const result = engine().buildWalkInsights([
      ...pairs(8),
      ...pairs(3, {
        durationMilliseconds: 10 * 60000,
        afterState: { energy: 3, tension: 8, clarity: 3 },
      }),
      ...pairs(3, { durationMilliseconds: 45 * 60000 }),
    ]);
    expect(result.filter((i) => i.kind === 'duration')).toEqual([]);
  });
});
