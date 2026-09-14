import { describe, expect, it } from 'vitest';
import {
  indicatorScore,
  weightedScore,
  effectiveScore,
  sphereScore,
  attentionNeed,
} from './BalanceScoring';
import { recommendFocus } from './BalanceRecommendations';
import { validateIndicator, indicatorId, type DirectionIndicator } from './DirectionIndicator';

const base = {
  id: indicatorId('d', 0),
  directionId: 'd',
  name: 'Сон',
  importance: 'normal',
  sourceType: 'manual',
  sourceGoalId: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  schemaVersion: 1,
  removed: false,
} as const;
const rating = (value: number | null): DirectionIndicator => ({
  ...base,
  type: 'rating',
  value,
  target: null,
});
describe('balance scores never substitute missing data with zero', () => {
  it('normalizes rating, boolean and linked quantitative goal progress', () => {
    expect(indicatorScore(rating(null), null)).toBeNull();
    expect(indicatorScore(rating(7.5), null)).toBe(7.5);
    expect(indicatorScore({ ...base, type: 'boolean', value: false, target: null }, null)).toBe(0);
    expect(indicatorScore({ ...base, type: 'boolean', value: true, target: null }, null)).toBe(10);
    const linked = { ...rating(null), sourceType: 'quantitativeGoal' as const, sourceGoalId: 'g' };
    expect(indicatorScore(linked, 69)).toBe(6.9);
    expect(indicatorScore(linked, 200)).toBe(10);
    expect(indicatorScore(linked, null)).toBeNull();
  });
  it.each([
    ['atLeast', 3, 6, null, 5],
    ['atLeast', 12, 6, null, 10],
    ['atMost', 12, 6, null, 5],
    ['atMost', 0, 0, null, 10],
    ['atMost', 6, 0, null, 0],
    ['range', 6, 7.5, 9, 8],
    ['range', 8, 7.5, 9, 10],
    ['range', 12, 7.5, 9, 7.5],
    ['range', 0, 0, 0, 10],
  ] as const)('%s current %s target %s..%s = %s', (kind, value, min, max, expected) => {
    const target = kind === 'range' ? { kind, min, max: max! } : { kind, value: min };
    expect(indicatorScore({ ...base, type: 'numeric', value, target }, null)).toBeCloseTo(expected);
  });
  it('uses only available weighted scores and preserves auto behind manual override', () => {
    expect(weightedScore([{ score: null, importance: 'critical' }])).toBeNull();
    const auto = weightedScore([
      { score: 4, importance: 'high' },
      { score: 8, importance: 'low' },
      { score: null, importance: 'critical' },
    ]);
    expect(auto).toBe(5);
    expect(effectiveScore(0, auto)).toBe(0);
    expect(effectiveScore(null, auto)).toBe(5);
  });
  it('includes active maintain directions and excludes paused/archived/missing', () => {
    expect(
      sphereScore([
        { status: 'active', score: 4, importance: 'high' },
        { status: 'active', score: 8, importance: 'low' },
        { status: 'active', score: null, importance: 'critical' },
        { status: 'paused', score: 0, importance: 'critical' },
        { status: 'archived', score: 0, importance: 'critical' },
      ]),
    ).toBe(5);
    expect(sphereScore([])).toBeNull();
  });
  it('keeps unknown attention unavailable and applies importance only to known gaps', () => {
    expect(attentionNeed(null, 8, 'high')).toEqual({ gap: null, attentionNeed: null });
    expect(attentionNeed(4, null, 'high')).toEqual({ gap: null, attentionNeed: null });
    expect(attentionNeed(9, 8, 'high')).toEqual({ gap: 0, attentionNeed: 0 });
    expect(attentionNeed(4.8, 8, 'high').attentionNeed).toBeCloseTo(9.6);
    expect(attentionNeed(4, 8, 'critical').attentionNeed).toBe(16);
  });
  it('validates fixed slots and rejects invalid numeric definitions', () => {
    expect(() => indicatorId('d', 5)).toThrow();
    expect(() => validateIndicator({ ...rating(7), id: 'random' })).toThrow();
    expect(() =>
      validateIndicator({
        ...base,
        type: 'numeric',
        value: 0,
        target: { kind: 'atLeast', value: 0 },
      }),
    ).toThrow();
    expect(() =>
      validateIndicator({
        ...base,
        type: 'numeric',
        value: 0,
        target: { kind: 'range', min: 9, max: 7 },
      }),
    ).toThrow();
    expect(validateIndicator(rating(null)).value).toBeNull();
  });
});
describe('deterministic read-only focus recommendations', () => {
  it('uses largest remainders with stable IDs independent of input order', () => {
    const input = [
      { id: 'c', attentionNeed: 1 },
      { id: 'a', attentionNeed: 1 },
      { id: 'b', attentionNeed: 1 },
    ];
    expect(recommendFocus(input, 'quarter')).toEqual({ a: 2, b: 1, c: 1 });
    expect(recommendFocus([...input].reverse(), 'quarter')).toEqual(
      recommendFocus(input, 'quarter'),
    );
    expect(
      Object.values(recommendFocus(input, 'year')).reduce<number>((sum, n) => sum + (n ?? 0), 0),
    ).toBe(5);
    expect(input[0]?.attentionNeed).toBe(1);
  });
  it('does not allocate unavailable or zero need and never invents slots', () => {
    expect(
      recommendFocus(
        [
          { id: 'a', attentionNeed: null },
          { id: 'b', attentionNeed: 0 },
        ],
        'week',
      ),
    ).toEqual({ a: null, b: 0 });
    expect(recommendFocus([], 'thirty_days')).toEqual({});
  });
});
