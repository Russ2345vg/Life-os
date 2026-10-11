import { describe, expect, it } from 'vitest';
import { confirmSleepObservation } from '../../../domain/sleep/SleepObservation';
import { loadSleepObservationHistory } from './sleepObservationHistoryLoader';

describe('sleep history windows', () => {
  it('loads all saved neighbors in an old calendar window and keeps current drafts', async () => {
    const observation = (cycleDate: string) =>
      confirmSleepObservation(null, {
        id: cycleDate,
        cycleDate,
        nightCycleId: null,
        timeZone: 'UTC',
        wentToBedAt: new Date(`${cycleDate}T22:00:00Z`),
        wokeAt: new Date(new Date(`${cycleDate}T08:00:00Z`).getTime() + 86400000),
        confirmedAt: new Date('2026-10-10T08:00:00Z'),
      });
    const all = [observation('2026-09-05'), observation('2026-09-06'), observation('2026-10-09')];
    const calls: string[][] = [];
    const service = {
      history: async (from: string, to: string) => {
        calls.push([from, to]);
        return all.filter((item) => item.cycleDate >= from && item.cycleDate <= to);
      },
    };
    const result = await loadSleepObservationHistory(
      service,
      new Date('2026-10-10T09:00:00Z'),
      'UTC',
      '2026-09-07',
    );
    expect(result.map((item) => item.cycleDate)).toEqual([
      '2026-10-09',
      '2026-09-06',
      '2026-09-05',
    ]);
    expect(calls).toContainEqual(['2026-08-08', '2026-09-06']);
    const withinRecent = await loadSleepObservationHistory(
      service,
      new Date('2026-10-10T09:00:00Z'),
      'UTC',
      '2026-10-03',
    );
    expect(withinRecent.map((item) => item.cycleDate)).toContain('2026-09-05');
    expect(calls).toContainEqual(['2026-09-03', '2026-10-02']);
  });
});
