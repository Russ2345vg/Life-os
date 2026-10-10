import { describe, expect, it } from 'vitest';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import { createEmptySleepSchedule, updateSleepSettings } from '../../domain/sleep/SleepSchedule';
import { DayDate, EntityId, Walk } from '../../domain';
import { buildAutopilotConstraints } from './AutopilotConstraints';
const now = new Date('2026-10-10T00:00:00Z');
function input(
  bedtime = '23:00',
  wakeTime = '07:00',
  timeZone = 'Asia/Chita',
  date = '2026-10-10',
) {
  return {
    date,
    now,
    preferences: {
      ...defaultAutopilotPreferences(),
      walk: { enabled: false, minutes: 30, startMinute: null },
    },
    draft: { ...defaultAutopilotDayDraft(date), startMinute: 540, endMinute: 1320 },
    sleep: updateSleepSettings(
      createEmptySleepSchedule(),
      { bedtime, wakeTime, timeZone, enabled: false },
      now,
    ),
    routineBlocks: [],
    walks: [],
    actions: [],
  };
}
describe('autopilot ritual constraints', () => {
  it('protects morning evening and sleep with disabled alarm without mutating settings', () => {
    const source = input();
    const before = structuredClone(source.sleep);
    const blocks = buildAutopilotConstraints(source);
    expect(blocks.find((block) => block.kind === 'morning')).toMatchObject({
      startMinute: 420,
      endMinute: 450,
    });
    expect(blocks.find((block) => block.kind === 'evening')).toMatchObject({
      startMinute: 1335,
      endMinute: 1380,
    });
    expect(
      blocks
        .filter((block) => block.kind === 'sleep')
        .map((block) => [block.startMinute, block.endMinute]),
    ).toEqual([
      [0, 420],
      [1380, 1440],
    ]);
    expect(source.sleep).toEqual(before);
  });
  it('projects preparation from the next night crossing midnight and DST in the configured zone', () => {
    expect(
      buildAutopilotConstraints(input('00:15', '08:00'))
        .filter((block) => block.kind === 'evening')
        .map((block) => [block.startMinute, block.endMinute]),
    ).toEqual([
      [0, 15],
      [1410, 1440],
    ]);
    expect(
      buildAutopilotConstraints(input('23:00', '07:00', 'Europe/Berlin', '2026-10-25')).find(
        (block) => block.kind === 'morning',
      ),
    ).toMatchObject({ startMinute: 420, endMinute: 450 });
  });
  it('requires manual boundaries for missing sleep settings and an explicit standalone walk start', () => {
    expect(() =>
      buildAutopilotConstraints({ ...input(), sleep: createEmptySleepSchedule() }),
    ).toThrow();
    expect(() =>
      buildAutopilotConstraints({ ...input(), preferences: defaultAutopilotPreferences() }),
    ).toThrow();
    const preferences = {
      ...defaultAutopilotPreferences(),
      walk: { enabled: false, startMinute: null, minutes: 30 },
      manualWakeMinute: 420,
      manualBedtimeMinute: 1380,
    };
    expect(
      buildAutopilotConstraints({
        ...input(),
        sleep: createEmptySleepSchedule(),
        preferences,
      }).some((block) => block.kind === 'morning'),
    ).toBe(true);
  });
  it('requires an expected end for an active walk without a timer target', () => {
    const walk = Walk.create({
      id: EntityId.create('w'),
      date: DayDate.create('2026-10-10'),
      type: 'restorative',
      now: new Date('2026-10-09T23:50:00Z'),
    }).start({ startedAt: new Date('2026-10-09T23:55:00Z'), mode: 'stopwatch' });
    expect(() => buildAutopilotConstraints({ ...input(), walks: [walk] })).toThrow();
    const source = input();
    expect(
      buildAutopilotConstraints({
        ...source,
        walks: [walk],
        draft: { ...source.draft, activeWalkEndMinute: 600 },
      }).find((block) => block.kind === 'walk'),
    ).toMatchObject({ startMinute: 540, endMinute: 600, protected: true });
  });
});
