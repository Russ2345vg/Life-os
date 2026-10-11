import { describe, expect, it } from 'vitest';
import {
  BORZYA_CITY,
  calculateSunsetWalk,
  cityDateAt,
  validateWalkCity,
} from './SunsetWalkSchedule';

// Independent US Naval Observatory observations, fetched 2026-10-12.
// https://aa.usno.navy.mil/api/rstt/oneday?date=<date>&coords=50.39138,116.53355&tz=0
const reference = [
  ['2026-01-15', '2026-01-15T08:38:00Z'],
  ['2026-06-21', '2026-06-21T12:29:00Z'],
  ['2026-10-11', '2026-10-11T09:31:00Z'],
] as const;

describe('sunset walk schedule', () => {
  it.each(reference)('matches an independent seasonal sunset on %s', (date, sunset) => {
    const day = calculateSunsetWalk(date, BORZYA_CITY);
    expect(day.kind).toBe('available');
    if (day.kind !== 'available') throw new Error('Missing sunset');
    expect(Math.abs(day.sunsetAt - Date.parse(sunset))).toBeLessThanOrEqual(120_000);
    expect(day.sunsetAt % 60_000).toBe(0);
    expect(day.sunsetAt - day.walkStartAt).toBe(900_000);
    expect(cityDateAt(day.sunsetAt, BORZYA_CITY.timeZone)).toBe(date);
  });

  it('uses Borzya in Zabaykalsky Krai as the offline default', () => {
    expect(BORZYA_CITY).toMatchObject({
      id: '2026126',
      latitude: 50.39138,
      longitude: 116.53355,
      timeZone: 'Asia/Chita',
    });
  });

  it.each([
    ['Europe/Berlin', 52.52, 13.405, '2026-03-29'],
    ['Pacific/Kiritimati', 1.8721, -157.4278, '2026-10-11'],
    ['Etc/GMT+12', 0, -179, '2026-10-11'],
  ] as const)(
    'keeps the sunset on the selected city date in %s',
    (timeZone, latitude, longitude, date) => {
      const day = calculateSunsetWalk(date, { ...BORZYA_CITY, timeZone, latitude, longitude });
      expect(day.kind).toBe('available');
      if (day.kind === 'available') expect(cityDateAt(day.sunsetAt, timeZone)).toBe(date);
    },
  );

  it.each(['2026-06-21', '2026-12-21'])(
    'does not invent a sunset in polar day/night %s',
    (date) => {
      expect(
        calculateSunsetWalk(date, {
          ...BORZYA_CITY,
          latitude: 69.6492,
          longitude: 18.9553,
          timeZone: 'Europe/Oslo',
        }),
      ).toEqual({ kind: 'no-sunset', cityDate: date });
    },
  );

  it('rejects invalid coordinates, timezone and impossible dates', () => {
    expect(() => validateWalkCity({ ...BORZYA_CITY, latitude: NaN })).toThrow();
    expect(() => validateWalkCity({ ...BORZYA_CITY, longitude: 181 })).toThrow();
    expect(() => validateWalkCity({ ...BORZYA_CITY, timeZone: 'Borzya' })).toThrow();
    expect(() => calculateSunsetWalk('2026-02-30', BORZYA_CITY)).toThrow();
  });
});
