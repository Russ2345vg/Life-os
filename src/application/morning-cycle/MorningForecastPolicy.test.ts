import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, MORNING_SHORTENED_ACTION, MorningCycle } from '../../domain';
import { calculateMorningForecast } from './MorningForecastPolicy';

describe('calculateMorningForecast', () => {
  it('uses weighted baseline work instead of equal stage percentages', () => {
    const cycle = startedCycle();
    cycle.completeWater(at('07:01'), 250);
    cycle.completeColdShower(at('07:02'));

    const forecast = calculateMorningForecast({
      cycle,
      physicalEstimatedMinutes: 10,
      mainActionReady: false,
    });

    expect(forecast.remainingMinutes).toBe(22);
    expect(forecast.progressPercent).toBe(16);
    expect(forecast.stages.physical).toMatchObject({ estimatedMinutes: 10, status: 'normal' });
  });

  it('reduces remaining work without moving progress backwards in shortened mode', () => {
    const cycle = startedCycle();
    cycle.completeWater(at('07:01'), 250);
    cycle.completeColdShower(at('07:02'));
    const normal = calculateMorningForecast({
      cycle,
      physicalEstimatedMinutes: 10,
      mainActionReady: false,
    });
    cycle.activateShortened(
      {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.shorten,
        mirror: MORNING_SHORTENED_ACTION.skip,
      },
      at('07:03'),
    );

    const shortened = calculateMorningForecast({
      cycle,
      physicalEstimatedMinutes: 10,
      mainActionReady: false,
    });

    expect(shortened.remainingMinutes).toBe(12);
    expect(shortened.progressPercent).toBeGreaterThanOrEqual(normal.progressPercent);
    expect(shortened.stages.physical.status).toBe('shortened');
    expect(shortened.stages.mirror.status).toBe('skipped');
  });

  it('returns to the normal remaining scenario without erasing the history marker', () => {
    const cycle = startedCycle();
    cycle.shorten(at('07:01'));
    cycle.revertShortened(at('07:02'));

    const forecast = calculateMorningForecast({
      cycle,
      physicalEstimatedMinutes: 10,
      mainActionReady: false,
    });

    expect(forecast.remainingMinutes).toBe(23);
    expect(forecast.stages.physical.status).toBe('normal');
    expect(cycle.wasEverShortened).toBe(true);
  });
});

function startedCycle(): MorningCycle {
  const cycle = MorningCycle.create({
    id: EntityId.create('forecast-cycle'),
    dayId: EntityId.create('forecast-day'),
    dateKey: DayDate.create('2026-08-23'),
    occurredAt: at('06:59'),
  });
  cycle.start(at('07:00'));
  return cycle;
}

function at(hhmm: string): Date {
  return new Date(`2026-08-23T${hhmm}:00.000+09:00`);
}
