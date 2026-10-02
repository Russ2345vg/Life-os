import { describe, expect, it } from 'vitest';
import { WalkPreferences, type WalkRegularityPreferences } from './WalkPreferences';

describe('walk regularity preferences', () => {
  it('starts disabled and saves only positive whole weekly targets', async () => {
    let current: WalkRegularityPreferences = { weeklyCount: null, weeklyMinutes: null };
    const preferences = new WalkPreferences({
      read: async () => current,
      write: async (next) => {
        current = next;
      },
    });
    expect(await preferences.get()).toEqual({ weeklyCount: null, weeklyMinutes: null });
    await expect(preferences.save({ weeklyCount: 0, weeklyMinutes: null })).rejects.toMatchObject({
      code: 'walk.invalid_preferences',
    });
    await expect(preferences.save({ weeklyCount: null, weeklyMinutes: 1.5 })).rejects.toMatchObject(
      { code: 'walk.invalid_preferences' },
    );
    expect(await preferences.save({ weeklyCount: 3, weeklyMinutes: 90 })).toEqual({
      weeklyCount: 3,
      weeklyMinutes: 90,
    });
  });
});
