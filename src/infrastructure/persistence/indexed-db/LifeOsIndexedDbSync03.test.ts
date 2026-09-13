import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from './LifeOsIndexedDb';

describe('LifeOsIndexedDb SYNC-03 migration', () => {
  it('upgrades v20 technical stores additively and preserves pending Outbox rows', async () => {
    const factory = new IDBFactory();
    const legacy = await openVersionTwenty(factory);
    const transaction = legacy.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    transaction.objectStore(LIFE_OS_SYNC_STORE.outbox).put({
      eventId: 'existing-event',
      state: 'pending',
      objectId: 'object-1',
      createdAt: '2026-09-04T00:00:00.000Z',
    });
    await done(transaction);
    legacy.close();

    const database = await new LifeOsIndexedDb(factory).open();
    expect(database.version).toBe(LIFE_OS_DATABASE_VERSION);
    const outbox = database
      .transaction(LIFE_OS_SYNC_STORE.outbox)
      .objectStore(LIFE_OS_SYNC_STORE.outbox);
    expect([...outbox.indexNames]).toEqual([
      'byCreatedAt',
      'byLeaseUntil',
      'byNextAttemptAt',
      'byObjectId',
      'byState',
    ]);
    expect(await request(outbox.get('existing-event'))).toMatchObject({ state: 'pending' });
    expect([
      ...database
        .transaction(LIFE_OS_SYNC_STORE.appliedEvents)
        .objectStore(LIFE_OS_SYNC_STORE.appliedEvents).indexNames,
    ]).toContain('bySequence');
    expect([
      ...database
        .transaction(LIFE_OS_SYNC_STORE.quarantine)
        .objectStore(LIFE_OS_SYNC_STORE.quarantine).indexNames,
    ]).toContain('byState');
    database.close();
  });
});

function openVersionTwenty(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(LIFE_OS_DATABASE_NAME, 20);
    open.onupgradeneeded = () => {
      // Literal domain and technical stores already present in a real v20 database.
      // v22 migration stores and goals.bySphereId must be created by the upgrade.
      for (const name of [
        'days',
        'decisions',
        'lifeActions',
        'actionSessions',
        'routineBlocks',
        'routineOccurrenceOverrides',
        'routineOccurrenceExecutions',
        'walks',
        'walkCaptures',
        'spheres',
        'journal',
        'directions',
        'projects',
        'eveningCycles',
        'exerciseDefinitions',
        'tomorrowPlans',
        'preparationPlans',
        'preparationRules',
        'recommendationApplications',
        'morningCycles',
        'goals',
      ])
        open.result.createObjectStore(name, { keyPath: 'id' });
      for (const [name, keyPath] of [
        ['sync_object_meta', 'objectId'],
        ['sync_cursor', 'spaceId'],
        ['sync_conflicts', 'conflictId'],
        ['sync_device_cache', 'deviceId'],
        ['sync_attachment_queue', 'attachmentId'],
        ['sync_snapshot_meta', 'snapshotId'],
        ['sync_settings', 'id'],
      ] as const)
        open.result.createObjectStore(name, { keyPath });
      const outbox = open.result.createObjectStore(LIFE_OS_SYNC_STORE.outbox, {
        keyPath: 'eventId',
      });
      outbox.createIndex('byState', 'state');
      outbox.createIndex('byObjectId', 'objectId');
      const applied = open.result.createObjectStore(LIFE_OS_SYNC_STORE.appliedEvents, {
        keyPath: 'eventId',
      });
      applied.createIndex('byAppliedAt', 'appliedAt');
      const quarantine = open.result.createObjectStore(LIFE_OS_SYNC_STORE.quarantine, {
        keyPath: 'quarantineId',
      });
      quarantine.createIndex('byEntityType', 'entityType');
      quarantine.createIndex('byCreatedAt', 'createdAt');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
