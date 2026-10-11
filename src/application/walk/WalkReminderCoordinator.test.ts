import { describe, expect, it } from 'vitest';
import { defaultSunsetWalkSettings, SunsetWalkSettings } from './SunsetWalkSettings';
import { WalkReminderCoordinator } from './WalkReminderCoordinator';
import type { WalkReminderConfiguration, WalkReminderReceipt } from '../ports/WalkReminderGateway';

describe('walk reminder coordination', () => {
  it('saves 400 city dates with exactly 15 minutes between sunset and reminder', async () => {
    const settings = new SunsetWalkSettings({
      read: async () => defaultSunsetWalkSettings(),
      write: async () => undefined,
    });
    let written: WalkReminderConfiguration | undefined;
    const receipt: WalkReminderReceipt = {
      revision: 1,
      state: 'scheduled',
      nextTriggerAt: Date.parse('2026-10-11T09:16:00Z'),
      throughCityDate: '2027-11-14',
      checkedAt: Date.parse('2026-10-11T00:00:00Z'),
      message: null,
    };
    const coordinator = new WalkReminderCoordinator(
      settings,
      {
        reconcile: async (config) => {
          written = config;
          return receipt;
        },
        status: async () => receipt,
      },
      () => Date.parse('2026-10-11T00:00:00Z'),
    );
    expect((await coordinator.reconcile()).state).toBe('scheduled');
    expect(written?.days).toHaveLength(400);
    expect(written?.days[0]).toMatchObject({ cityDate: '2026-10-11' });
    expect(
      written!.days.every((d) => d.sunsetAt === null || d.sunsetAt - d.walkStartAt! === 900000),
    ).toBe(true);
    expect(written!.throughCityDate).toBe(written!.days.at(-1)!.cityDate);
  });
  it('reconciles the current revision again when settings change during a native reply', async () => {
    let value = defaultSunsetWalkSettings();
    const settings = new SunsetWalkSettings({
      read: async () => value,
      write: async (next) => {
        value = next;
      },
    });
    const revisions: number[] = [];
    const coordinator = new WalkReminderCoordinator(
      settings,
      {
        reconcile: async (config) => {
          revisions.push(config.revision);
          if (config.revision === 1) await settings.save({ ...value, remindersEnabled: false });
          return {
            revision: config.revision,
            state: config.enabled ? 'scheduled' : 'disabled',
            nextTriggerAt: null,
            throughCityDate: config.throughCityDate,
            checkedAt: 1,
            message: null,
          };
        },
        status: async () => ({
          revision: 0,
          state: 'unsupported',
          nextTriggerAt: null,
          throughCityDate: null,
          checkedAt: 1,
          message: null,
        }),
      },
      () => Date.parse('2026-10-11T00:00:00Z'),
    );
    expect((await coordinator.reconcile()).state).toBe('disabled');
    expect(revisions).toEqual([1, 2]);
  });
});
