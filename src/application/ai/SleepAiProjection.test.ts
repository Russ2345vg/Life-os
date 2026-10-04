import { describe, expect, it } from 'vitest';
import {
  confirmSleepObservation,
  createWakeObservationDraft,
} from '../../domain/sleep/SleepObservation';
import { projectSleepForAi } from './SleepAiProjection';

describe('projectSleepForAi', () => {
  it('projects only confirmed facts with dates and no alarm emergency text', () => {
    const confirmed = confirmSleepObservation(null, {
      id: 'sleep-observation:2026-10-02',
      cycleDate: '2026-10-02',
      nightCycleId: 'night-2',
      wentToBedAt: new Date('2026-10-02T14:30:00.000Z'),
      wokeAt: new Date('2026-10-03T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-10-03T00:05:00.000Z'),
    });
    const draft = createWakeObservationDraft({
      id: 'sleep-observation:2026-10-03',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-3',
      wakeOccurrenceId: 'wake-3',
      wakeKind: 'EMERGENCY',
      wokeAt: new Date('2026-10-04T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-10-04T00:01:00.000Z'),
    });

    const projection = projectSleepForAi({ observations: [draft, confirmed], plans: [] });
    const serialized = JSON.stringify(projection);

    expect(projection.sources).toHaveLength(1);
    expect(projection.sources[0]).toMatchObject({
      id: 'sleep-observation:2026-10-02',
      date: '2026-10-02',
    });
    expect(projection.sources[0]?.detail).toContain('время в постели: 570 мин');
    expect(projection.facts.join(' ')).toContain('Подтверждено ночей: 1');
    expect(serialized).not.toMatch(/2026-10-03|EMERGENCY|аварийн|комментар/iu);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(20_000);
  });
});
