import type { LifeAction } from '../../domain';
import {
  calculateSunsetWalk,
  cityDateAt,
  type WalkCity,
} from '../../domain/walk/SunsetWalkSchedule';
import type { SunsetWalkSettings, SunsetWalkSettingsValue } from './SunsetWalkSettings';
import { autopilotLocalTime, shiftAutopilotDate } from '../planner/AutopilotConstraints';

export interface WalkScheduleDay {
  readonly date: string;
  readonly settingsRevision: number;
  readonly kind: 'available' | 'no-sunset' | 'disabled';
  readonly city: WalkCity;
  readonly sunsetAt: number | null;
  readonly walkStartAt: number | null;
  readonly startMinute: number | null;
  readonly previousStartMinute?: number | null;
}
export class WalkScheduleProjection {
  public constructor(private readonly settings: SunsetWalkSettings) {}
  public async forPlannerDate(date: string, plannerTimeZone: string): Promise<WalkScheduleDay> {
    return projectWalkSchedule(await this.settings.get(), date, plannerTimeZone);
  }
}
export function projectWalkSchedule(
  settings: SunsetWalkSettingsValue,
  date: string,
  plannerTimeZone: string,
): WalkScheduleDay {
  const day = projectSingleWalkDay(settings, date, plannerTimeZone);
  return {
    ...day,
    previousStartMinute: projectSingleWalkDay(
      settings,
      shiftAutopilotDate(date, -1),
      plannerTimeZone,
    ).startMinute,
  };
}
function projectSingleWalkDay(
  settings: SunsetWalkSettingsValue,
  date: string,
  plannerTimeZone: string,
): WalkScheduleDay {
  const base = {
    date,
    settingsRevision: settings.revision,
    city: settings.city,
    sunsetAt: null,
    walkStartAt: null,
    startMinute: null,
  };
  if (!settings.enabled) return { ...base, kind: 'disabled' };
  // Anchor at planner noon; extreme timezone pairs may differ by two calendar dates.
  const noon = Date.parse(`${date}T12:00:00Z`);
  const anchor = cityDateAt(noon, settings.city.timeZone);
  for (const offset of [0, -1, 1, -2, 2]) {
    const day = calculateSunsetWalk(shiftAutopilotDate(anchor, offset), settings.city);
    if (day.kind !== 'available') continue;
    const local = autopilotLocalTime(new Date(day.walkStartAt), plannerTimeZone);
    if (local.date === date)
      return {
        ...base,
        kind: 'available',
        sunsetAt: day.sunsetAt,
        walkStartAt: day.walkStartAt,
        startMinute: local.minute,
      };
  }
  return { ...base, kind: 'no-sunset' };
}
export interface EffectiveActionTime {
  readonly startMinute: number | null;
  readonly durationMinutes: number | null;
}
export function effectiveActionTime(
  action: LifeAction,
  day?: WalkScheduleDay | null,
): EffectiveActionTime {
  const stored = {
    startMinute: action.scheduledStartMinute,
    durationMinutes: action.scheduledDurationMinutes,
  };
  if (
    !day ||
    day.kind === 'disabled' ||
    !action.walkPlan ||
    action.plannedDate?.toString() !== day.date ||
    action.isArchived() ||
    action.isDeleted() ||
    !['draft', 'ready'].includes(action.status)
  )
    return stored;
  return {
    startMinute: day.startMinute,
    durationMinutes:
      day.kind === 'available'
        ? (action.scheduledDurationMinutes ?? action.walkPlan.targetMinutes ?? 30)
        : null,
  };
}
