import { Project, EntityId } from '../../../domain';
import { ProjectRecordMapper } from '../../persistence/mappers/ProjectRecordMapper';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../../persistence/records/SyncStoreRecords';
import { IndexedDbPilotDeleteRepository } from './IndexedDbPilotDeleteRepository';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { DeletePilotGoal } from '../../../application/sync/pilot/DeletePilotGoal';
import { DeletePilotLifeAction } from '../../../application/sync/pilot/DeletePilotLifeAction';
import { DeletePilotSphere } from '../../../application/sync/pilot/DeletePilotSphere';

describe('IndexedDbPilotDeleteRepository', () => {
  it('explains the actual blocking record through the daily workflow commands without deleting data', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    try {
      const database = await indexedDb.open();
      const seed = database.transaction(
        ['goals', 'lifeActions', 'spheres', 'directions'],
        'readwrite',
      );
      seed.objectStore('goals').put({ id: 'g' });
      seed.objectStore('lifeActions').put({ id: 'a', title: 'Прогулка', goalId: 'g' });
      seed
        .objectStore('lifeActions')
        .put({ id: 'child', title: 'Подготовка', parentActionId: 'a' });
      seed.objectStore('spheres').put({ id: 's' });
      seed.objectStore('directions').put({ id: 'd', name: 'Тело', sphereId: 's' });
      await done(seed);
      const repository = new IndexedDbPilotDeleteRepository(
        indexedDb,
        new IndexedDbPilotMutationRecorder(),
      );
      await expect(new DeletePilotGoal(repository).execute('g')).rejects.toMatchObject({
        code: 'sync.delete_blocked',
        message: expect.stringContaining('Прогулка'),
      });
      await expect(new DeletePilotLifeAction(repository).execute('a')).rejects.toMatchObject({
        code: 'sync.delete_blocked',
        message: expect.stringContaining('Подготовка'),
      });
      await expect(new DeletePilotSphere(repository).execute('s')).rejects.toMatchObject({
        code: 'sync.delete_blocked',
        message: expect.stringContaining('Тело'),
      });
      for (const [store, id] of [
        ['goals', 'g'],
        ['lifeActions', 'a'],
        ['lifeActions', 'child'],
        ['spheres', 's'],
      ])
        expect(await read(database, store!, id!)).toBeDefined();
    } finally {
      indexedDb.close();
    }
  });

  it('keeps a canonical goal with linked decisions and does not enqueue deletion', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(['goals', 'decisions'], 'readwrite');
    seed.objectStore('goals').put({ id: 'goal-1' });
    seed
      .objectStore('decisions')
      .put({ id: 'decision-1', projectId: 'goal-1', goalLinksVersion: 1 });
    await done(seed);
    const repository = new IndexedDbPilotDeleteRepository(
      indexedDb,
      new IndexedDbPilotMutationRecorder(),
    );
    await expect(repository.delete('goal', 'goal-1')).resolves.toBe(false);
    expect(await read(database, 'goals', 'goal-1')).toBeDefined();
    indexedDb.close();
  });

  it('atomically removes an entity and records a pilot tombstone without changing archive behavior', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_STORE.projects, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.projects).put(
      ProjectRecordMapper.toRecord(
        Project.create({
          id: EntityId.create('project-1'),
          directionId: EntityId.create('direction-1'),
          title: 'Legacy',
          now: new Date('2026-09-01T00:00:00Z'),
        }),
      ),
    );
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const ids = ['transport-1', 'event-1'];
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: () => ids.shift() ?? 'unexpected',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    await expect(
      new IndexedDbPilotDeleteRepository(indexedDb, recorder).delete('project', 'project-1'),
    ).resolves.toBe(true);

    expect(await read(database, LIFE_OS_STORE.projects, 'project-1')).toBeUndefined();
    expect(await read(database, LIFE_OS_SYNC_STORE.outbox, 'event-1')).toMatchObject({
      entityType: 'project',
      objectId: 'project-1',
      operation: 'tombstone',
      serializedPayload: expect.not.stringContaining('direction-1'),
    });
  });

  it('does not delete a direction while pilot dependants still reference it', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_STORE.goals, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.directions).put({ id: 'direction-1' });
    seed.objectStore(LIFE_OS_STORE.goals).put({ id: 'goal-1', directionId: 'direction-1' });
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);

    const repository = new IndexedDbPilotDeleteRepository(
      indexedDb,
      new IndexedDbPilotMutationRecorder(),
    );
    await expect(repository.delete('direction', 'direction-1')).resolves.toBe(false);
    expect(await read(database, LIFE_OS_STORE.directions, 'direction-1')).toBeDefined();
  });

  it('keeps structural parents and allows tombstones with optional historical Journal references', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [
        LIFE_OS_STORE.spheres,
        LIFE_OS_STORE.directions,
        LIFE_OS_STORE.lifeActions,
        LIFE_OS_STORE.journal,
      ],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.spheres).put({ id: 'sphere-1' });
    seed.objectStore(LIFE_OS_STORE.directions).put({ id: 'direction-1', sphereId: 'sphere-1' });
    seed.objectStore(LIFE_OS_STORE.lifeActions).put({ id: 'parent' });
    seed.objectStore(LIFE_OS_STORE.lifeActions).put({ id: 'child', parentActionId: 'parent' });
    seed.objectStore(LIFE_OS_STORE.lifeActions).put({ id: 'historical' });
    seed
      .objectStore(LIFE_OS_STORE.journal)
      .put({ id: 'event-1', subjectType: 'LifeAction', subjectId: 'historical' });
    await done(seed);
    const repository = new IndexedDbPilotDeleteRepository(
      indexedDb,
      new IndexedDbPilotMutationRecorder(),
    );
    expect(await repository.delete('sphere', 'sphere-1')).toBe(false);
    expect(await repository.delete('life_action', 'parent')).toBe(false);
    expect(await repository.delete('life_action', 'historical')).toBe(true);
    expect(await read(database, LIFE_OS_STORE.lifeActions, 'child')).toBeDefined();
    expect(await read(database, LIFE_OS_STORE.lifeActions, 'historical')).toBeUndefined();
    expect(await read(database, LIFE_OS_STORE.journal, 'event-1')).toBeDefined();
    indexedDb.close();
  });
});

function settings(): SyncSettingsRecord {
  return {
    id: 'sync',
    enabled: false,
    deviceId: 'device',
    deviceName: 'Device',
    platform: 'windows',
    publicKey: 'public',
    createdAt: '',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 3,
    recoveryConfirmedAt: '',
    snapshotId: null,
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '',
  };
}

async function read(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<unknown> {
  const transaction = database.transaction(storeName, 'readonly');
  const result = await request(transaction.objectStore(storeName).get(key));
  await done(transaction);
  return result;
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
    transaction.onabort = () => reject(transaction.error);
  });
}
