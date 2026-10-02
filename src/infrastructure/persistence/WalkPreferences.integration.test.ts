import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { WalkPreferences } from '../../application/walk/WalkPreferences';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbWalkPreferencesStore } from './IndexedDbWalkPreferencesStore';

describe('walk preferences persistence', () => {
  it('reopens nullable goals without creating a walk or planner action', async () => {
    const factory = new IDBFactory();
    const first = new LifeOsIndexedDb(factory);
    const preferences = new WalkPreferences(new IndexedDbWalkPreferencesStore(first));
    expect(await preferences.get()).toEqual({ weeklyCount: null, weeklyMinutes: null });
    await preferences.save({ weeklyCount: 3, weeklyMinutes: 90 });
    first.close();
    const reopened = new LifeOsIndexedDb(factory);
    expect(await new WalkPreferences(new IndexedDbWalkPreferencesStore(reopened)).get()).toEqual({
      weeklyCount: 3,
      weeklyMinutes: 90,
    });
    const db = await reopened.open();
    expect(
      await new Promise<unknown[]>((resolve, reject) => {
        const r = db.transaction('walks').objectStore('walks').getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
    ).toHaveLength(0);
    reopened.close();
  });
});
