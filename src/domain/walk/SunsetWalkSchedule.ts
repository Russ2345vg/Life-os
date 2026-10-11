import { DayDate } from '../day/DayDate';
import { DomainError } from '../../shared/errors/DomainError';

export interface WalkCity {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly country: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZone: string;
}
export const BORZYA_CITY: WalkCity = Object.freeze({
  id: '2026126',
  name: 'Борзя',
  region: 'Забайкальский край',
  country: 'Россия',
  latitude: 50.39138,
  longitude: 116.53355,
  timeZone: 'Asia/Chita',
});
export type SunsetWalkDay =
  | {
      readonly kind: 'available';
      readonly cityDate: string;
      readonly sunsetAt: number;
      readonly walkStartAt: number;
    }
  | { readonly kind: 'no-sunset'; readonly cityDate: string };

function invalid(): DomainError {
  return new DomainError('walk.invalid_city', 'Выберите город с координатами и часовым поясом.');
}
export function validateWalkCity(value: unknown): WalkCity {
  if (typeof value !== 'object' || value === null) throw invalid();
  const v = value as Record<string, unknown>;
  for (const field of ['id', 'name', 'region', 'country', 'timeZone'])
    if (
      typeof v[field] !== 'string' ||
      (v[field] as string).length > 200 ||
      (field !== 'region' && !(v[field] as string).trim())
    )
      throw invalid();
  if (
    typeof v.latitude !== 'number' ||
    !Number.isFinite(v.latitude) ||
    Math.abs(v.latitude) > 90 ||
    typeof v.longitude !== 'number' ||
    !Number.isFinite(v.longitude) ||
    Math.abs(v.longitude) > 180
  )
    throw invalid();
  try {
    new Intl.DateTimeFormat('en', { timeZone: v.timeZone as string }).format(0);
  } catch {
    throw invalid();
  }
  return Object.freeze({
    id: v.id as string,
    name: v.name as string,
    region: v.region as string,
    country: v.country as string,
    latitude: v.latitude,
    longitude: v.longitude,
    timeZone: v.timeZone as string,
  });
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
export function cityDateAt(instant: number, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // Bounded cache: city search may expose arbitrary valid zones over a long session.
    if (dateFormatters.size >= 32) dateFormatters.clear();
    dateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const rad = Math.PI / 180;
const sin = (angle: number) => Math.sin(angle * rad);
const cos = (angle: number) => Math.cos(angle * rad);

/** NOAA/Meeus solar coordinates; https://gml.noaa.gov/grad/solcalc/calcdetails.html */
function solar(julianDay: number): { declination: number; equation: number } {
  const t = (julianDay - 2451545) / 36525;
  const longitude = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
  const anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center =
    sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    sin(2 * anomaly) * (0.019993 - 0.000101 * t) +
    sin(3 * anomaly) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const apparent = longitude + center - 0.00569 - 0.00478 * sin(omega);
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * cos(omega);
  const y = Math.tan((obliquity * rad) / 2) ** 2;
  const equation =
    (4 / rad) *
    (y * sin(2 * longitude) -
      2 * eccentricity * sin(anomaly) +
      4 * eccentricity * y * sin(anomaly) * cos(2 * longitude) -
      0.5 * y * y * sin(4 * longitude) -
      1.25 * eccentricity * eccentricity * sin(2 * anomaly));
  return { declination: Math.asin(sin(obliquity) * sin(apparent)) / rad, equation };
}

function sunsetForUtcDay(midnight: number, city: WalkCity): number | null {
  const julian = midnight / 86400000 + 2440587.5;
  let minute = 720 - 4 * city.longitude;
  for (let iteration = 0; iteration < 4; iteration++) {
    const { declination, equation } = solar(julian + minute / 1440);
    const hourAngle =
      (cos(90.833) - sin(city.latitude) * sin(declination)) /
      (cos(city.latitude) * cos(declination));
    if (!Number.isFinite(hourAngle) || hourAngle < -1 || hourAngle > 1) return null;
    minute = 720 - 4 * city.longitude - equation + (4 * Math.acos(hourAngle)) / rad;
  }
  return Math.round((midnight + minute * 60000) / 60000) * 60000;
}

export function calculateSunsetWalk(cityDate: string, cityInput: WalkCity): SunsetWalkDay {
  DayDate.create(cityDate);
  const city = validateWalkCity(cityInput);
  const midnight = Date.parse(`${cityDate}T00:00:00Z`);
  // Search neighbouring UTC dates: a civil city day need not share its UTC date.
  for (const offset of [0, -1, 1, -2, 2]) {
    const sunsetAt = sunsetForUtcDay(midnight + offset * 86400000, city);
    if (sunsetAt !== null && cityDateAt(sunsetAt, city.timeZone) === cityDate)
      return { kind: 'available', cityDate, sunsetAt, walkStartAt: sunsetAt - 900000 };
  }
  return { kind: 'no-sunset', cityDate };
}
