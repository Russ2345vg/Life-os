import { describe, expect, it } from 'vitest';
import { BORZYA_CITY } from '../../domain/walk/SunsetWalkSchedule';
import { defaultSunsetWalkSettings, SunsetWalkSettings } from './SunsetWalkSettings';

describe('sunset walk settings', () => {
  it('defaults to Borzya and revises only an actual change', async () => {
    let current = defaultSunsetWalkSettings();
    const settings = new SunsetWalkSettings({
      read: async () => current,
      write: async (next) => {
        current = next;
      },
    });
    expect(await settings.get()).toMatchObject({
      city: BORZYA_CITY,
      enabled: true,
      remindersEnabled: true,
      revision: 1,
    });
    expect((await settings.save(current)).revision).toBe(1);
    expect((await settings.save({ ...current, remindersEnabled: false })).revision).toBe(2);
    await expect(
      settings.save({ ...current, city: { ...BORZYA_CITY, latitude: 100 } }),
    ).rejects.toThrow();
    expect(current.revision).toBe(2);
  });
});
