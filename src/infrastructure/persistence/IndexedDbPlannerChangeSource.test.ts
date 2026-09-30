import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbPlannerChangeSource } from './IndexedDbPlannerChangeSource';

const collections = [
  'goals',
  'directions',
  'spheres',
  'lifeActions',
  'inboxIdeas',
  'timeCapacity',
  'focusPeriods',
  'planningPeriods',
  'periodMemberships',
  'periodDecisions',
  'recurrenceRules',
  'contributionLinks',
  'progressContributions',
] as const;

const completed = (tx: IDBTransaction, event = 'complete') =>
  new Promise<void>((resolve) => tx.addEventListener(event, () => resolve(), { once: true }));

describe('committed planner changes', () => {
  it('publishes all mapped collections once after commit, then unsubscribes', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const listener = vi.fn();
      const stop = new IndexedDbPlannerChangeSource(database).subscribe(listener);
      const db = await database.open();
      const tx = db.transaction([...collections, 'sync_settings'], 'readwrite');
      for (const name of collections) tx.objectStore(name).clear();
      tx.objectStore('goals').clear();
      tx.objectStore('sync_settings').clear();
      expect(listener).not.toHaveBeenCalled();
      await completed(tx);
      expect(listener).toHaveBeenCalledExactlyOnceWith([...collections]);
      stop();
      const next = db.transaction('goals', 'readwrite');
      next.objectStore('goals').clear();
      await completed(next);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      database.close();
    }
  });

  it('ignores aborted, readonly and unrelated transactions', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const listener = vi.fn();
      const stop = new IndexedDbPlannerChangeSource(database).subscribe(listener);
      const db = await database.open();
      const aborted = db.transaction('goals', 'readwrite');
      aborted.objectStore('goals').clear();
      aborted.abort();
      await completed(aborted, 'abort');
      const read = db.transaction('goals', 'readonly');
      read.objectStore('goals').getAll();
      await completed(read);
      const metadata = db.transaction(['sync_settings', 'actionSessions'], 'readwrite');
      metadata.objectStore('sync_settings').clear();
      metadata.objectStore('actionSessions').clear();
      await completed(metadata);
      expect(listener).not.toHaveBeenCalled();
      stop();
    } finally {
      database.close();
    }
  });
});
