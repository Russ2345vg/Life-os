import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { defaultSunsetWalkSettings, SunsetWalkSettings } from './SunsetWalkSettings';
import { effectiveActionTime, WalkScheduleProjection } from './WalkScheduleProjection';

describe('walk time projection', () => {
  const settings = new SunsetWalkSettings({
    read: async () => defaultSunsetWalkSettings(),
    write: async () => undefined,
  });
  it('resolves different city dates and projects the same instant into the planner zone', async () => {
    const projection = new WalkScheduleProjection(settings);
    const today = await projection.forPlannerDate('2026-10-11', 'Asia/Chita');
    const tomorrow = await projection.forPlannerDate('2026-10-12', 'Asia/Chita');
    expect(today).toMatchObject({ kind: 'available', startMinute: 1096 });
    expect(tomorrow.walkStartAt).not.toBe(today.walkStartAt);
    const berlin = await projection.forPlannerDate('2026-10-11', 'Europe/Berlin');
    expect(berlin.walkStartAt).toBe(today.walkStartAt);
    expect(berlin.startMinute).toBe(676);
  });
  it('projects marked open actions without mutating their times or ordinary actions', async () => {
    const day = await new WalkScheduleProjection(settings).forPlannerDate(
      '2026-10-11',
      'Asia/Chita',
    );
    const action = createLifeActionDraft('w');
    action.setPlan(DayDate.create(day.date), false);
    action.setWalkPlan({ kind: 'walk', targetMinutes: 45 });
    expect(effectiveActionTime(action, day)).toEqual({ startMinute: 1096, durationMinutes: 45 });
    expect(action.scheduledStartMinute).toBeNull();
    const ordinary = createLifeActionDraft('o');
    ordinary.setPlan(DayDate.create(day.date), false);
    expect(effectiveActionTime(ordinary, day).startMinute).toBeNull();
  });
  it('keeps disabled manual times and does not reuse an old polar sunset', async () => {
    let value = { ...defaultSunsetWalkSettings(), enabled: false };
    const projection = new WalkScheduleProjection(
      new SunsetWalkSettings({
        read: async () => value,
        write: async (next) => {
          value = next;
        },
      }),
    );
    expect((await projection.forPlannerDate('2026-10-11', 'Asia/Chita')).kind).toBe('disabled');
    value = {
      ...value,
      enabled: true,
      city: { ...value.city, latitude: 69.6492, longitude: 18.9553, timeZone: 'Europe/Oslo' },
    };
    expect((await projection.forPlannerDate('2026-06-21', 'Europe/Oslo')).kind).toBe('no-sunset');
  });
});
