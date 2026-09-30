import { describe, expect, it } from 'vitest';
import { recordColdShower, summarizeColdShowers, validateColdShowerEntry } from './ColdShower';

const first = new Date('2026-09-28T00:00:00Z');
const later = new Date('2026-09-28T01:00:00Z');

describe('Cold shower journal', () => {
  it('records one completed day without requiring an assessment and preserves repeat timestamps', () => {
    const entries = recordColdShower([], { date: '2026-09-28', status: 'completed' }, first);
    expect(entries).toEqual([
      {
        date: '2026-09-28',
        status: 'completed',
        energy: null,
        feeling: null,
        skipReason: null,
        recordedAt: first,
        updatedAt: first,
      },
    ]);
    expect(recordColdShower(entries, { date: '2026-09-28', status: 'completed' }, later)).toBe(
      entries,
    );
  });

  it('saves assessments independently and corrections replace the same day', () => {
    const entries = recordColdShower(
      [],
      { date: '2026-09-27', status: 'completed', energy: 4 },
      first,
    );
    const assessed = recordColdShower(
      entries,
      { date: '2026-09-27', status: 'completed', feeling: 'better' },
      later,
    );
    expect(assessed[0]).toMatchObject({
      energy: 4,
      feeling: 'better',
      recordedAt: first,
      updatedAt: later,
    });
    const skipped = recordColdShower(
      assessed,
      { date: '2026-09-27', status: 'skipped', skipReason: 'time' },
      later,
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      status: 'skipped',
      energy: null,
      feeling: null,
      skipReason: 'time',
    });
    const corrected = recordColdShower(skipped, { date: '2026-09-27', status: 'completed' }, later);
    expect(corrected[0]).toMatchObject({
      status: 'completed',
      energy: null,
      feeling: null,
      skipReason: null,
    });
  });

  it.each([0, 6, 1.5, Number.NaN])('rejects invalid energy %s', (energy) => {
    expect(() =>
      recordColdShower([], { date: '2026-09-28', status: 'completed', energy }, first),
    ).toThrow();
  });

  it('validates calendar dates and rejects incompatible assessment fields', () => {
    expect(() =>
      recordColdShower([], { date: '2026-02-30', status: 'completed' }, first),
    ).toThrow();
    expect(() =>
      recordColdShower([], { date: '2026-09-28', status: 'skipped', energy: 4 }, first),
    ).toThrow();
    expect(() =>
      recordColdShower(
        [],
        { date: '2026-09-28', status: 'completed', skipReason: 'forgot' },
        first,
      ),
    ).toThrow();
    const entry = recordColdShower([], { date: '2026-09-28', status: 'skipped' }, first)[0]!;
    expect(() => validateColdShowerEntry({ ...entry, updatedAt: new Date('invalid') })).toThrow();
  });

  it('counts Monday weeks and calendar months without counting skips or missing ratings', () => {
    let entries = recordColdShower(
      [],
      { date: '2026-09-27', status: 'completed', energy: 2 },
      first,
    );
    entries = recordColdShower(
      entries,
      { date: '2026-09-28', status: 'completed', energy: 4 },
      first,
    );
    entries = recordColdShower(entries, { date: '2026-09-29', status: 'skipped' }, first);
    entries = recordColdShower(entries, { date: '2026-09-30', status: 'completed' }, first);
    entries = recordColdShower(
      entries,
      { date: '2026-10-01', status: 'completed', energy: 5 },
      first,
    );
    expect(summarizeColdShowers(entries, '2026-10-01', '2026-09')).toEqual({
      weeklyCompleted: 3,
      monthlyCompleted: 3,
      totalCompleted: 4,
      averageEnergy: 3,
      ratedCount: 2,
    });
    expect(summarizeColdShowers([], '2027-01-01', '2026-12').averageEnergy).toBeNull();
  });
});
