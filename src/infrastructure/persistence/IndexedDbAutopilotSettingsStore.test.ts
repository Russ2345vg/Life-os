import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbAutopilotSettingsStore } from './IndexedDbAutopilotSettingsStore';

describe('local autopilot preferences persistence', () => {
  it('reopens focus wishes and explicit edits without creating walks actions or sync mutations', async () => {
    const factory = new IDBFactory();
    const first = new LifeOsIndexedDb(factory);
    const store = new IndexedDbAutopilotSettingsStore(first);
    await store.writePreferences(
      { ...defaultAutopilotPreferences(), focus: { kind: 'direction', id: 'investments' } },
      null,
    );
    await store.writeDraft(
      {
        ...defaultAutopilotDayDraft('2026-10-10'),
        wishes: 'Порядок',
        durationOverrides: [{ actionId: 'a', minutes: 40 }],
      },
      null,
    );
    first.close();
    const reopened = new LifeOsIndexedDb(factory);
    const next = new IndexedDbAutopilotSettingsStore(reopened);
    expect((await next.readPreferences())?.value.focus).toEqual({
      kind: 'direction',
      id: 'investments',
    });
    expect((await next.readDraft('2026-10-10'))?.value).toMatchObject({
      wishes: 'Порядок',
      durationOverrides: [{ actionId: 'a', minutes: 40 }],
    });
    const db = await reopened.open();
    for (const name of ['walks', 'lifeActions', 'sync_outbox'])
      expect(await request(db.transaction(name).objectStore(name).count())).toBe(0);
    reopened.close();
  });
  it('reports corrupted records without replacing the original', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const db = await database.open();
    const tx = db.transaction('sync_settings', 'readwrite');
    const raw = {
      id: 'day-autopilot-preferences:v1',
      schemaVersion: 1,
      version: 3,
      value: { maxActions: -2 },
    };
    tx.objectStore('sync_settings').put(raw);
    await done(tx);
    await expect(new IndexedDbAutopilotSettingsStore(database).readPreferences()).rejects.toThrow();
    expect(
      await request(db.transaction('sync_settings').objectStore('sync_settings').get(raw.id)),
    ).toEqual(raw);
    database.close();
  });
});
