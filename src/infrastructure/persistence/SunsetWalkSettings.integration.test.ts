import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { SunsetWalkSettings } from '../../application/walk/SunsetWalkSettings';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbSunsetWalkSettingsStore } from './IndexedDbSunsetWalkSettingsStore';
import { IndexedDbWalkPreferencesStore } from './IndexedDbWalkPreferencesStore';

describe('local sunset settings persistence', () => {
  it('reopens offline without changing weekly sync preferences or planner data', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const weekly = new IndexedDbWalkPreferencesStore(db);
    await weekly.write({ weeklyCount: 3, weeklyMinutes: 90 });
    const settings = new SunsetWalkSettings(new IndexedDbSunsetWalkSettingsStore(db));
    const original = await settings.get();
    await settings.save({
      ...original,
      city: {
        ...original.city,
        id: '2950159',
        name: 'Берлин',
        latitude: 52.52,
        longitude: 13.405,
        timeZone: 'Europe/Berlin',
      },
    });
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    expect(
      (await new SunsetWalkSettings(new IndexedDbSunsetWalkSettingsStore(reopened)).get()).city
        .name,
    ).toBe('Берлин');
    expect(await new IndexedDbWalkPreferencesStore(reopened).read()).toEqual({
      weeklyCount: 3,
      weeklyMinutes: 90,
    });
    reopened.close();
  });
});
