import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb, LIFE_OS_STORE, LIFE_OS_SYNC_STORE } from './indexed-db/LifeOsIndexedDb';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../sync/LifeOsSyncRegistry';
import { parsePilotSyncPayload } from '../../application/sync/pilot';
import type { SyncOutboxRecord } from './records/SyncStoreRecords';

describe('Task scenario persistence', () => {
  it('adds the v27 store without changing v26 data', async () => {
    const factory = new IDBFactory();
    const opening = factory.open('lifeos', 26);
    opening.onupgradeneeded = () => {
      for (const name of Object.values(LIFE_OS_STORE).filter((name) => name !== 'taskScenarios'))
        opening.result.createObjectStore(name, { keyPath: 'id' });
    };
    const old = await request(opening);
    const tx = old.transaction('lifeActions', 'readwrite');
    const committed = done(tx);
    tx.objectStore('lifeActions').put({ id: 'old-action', title: 'Не потерять', futureField: 17 });
    await committed;
    old.close();
    const database = new LifeOsIndexedDb(factory);
    try {
      const db = await database.open();
      expect(db.version).toBe(27);
      expect(
        await request(db.transaction('taskScenarios').objectStore('taskScenarios').getAll()),
      ).toEqual([]);
      expect(
        await request(db.transaction('lifeActions').objectStore('lifeActions').get('old-action')),
      ).toEqual({ id: 'old-action', title: 'Не потерять', futureField: 17 });
    } finally {
      database.close();
    }
  });
  it('captures one mutation per save and rolls back a failing outbox write', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const app = await createLifeOsApplication({ database });
      const db = await database.open();
      const setup = db.transaction([...PILOT_MUTATION_STORES], 'readwrite');
      const committed = done(setup);
      setup.objectStore(LIFE_OS_SYNC_STORE.settings).put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: '11111111-1111-4111-8111-111111111111',
        deviceId: 'test',
        currentKeyEpoch: 1,
      });
      await committed;
      const original = await app.plannerScenarios.create('Дома', null);
      const outbox = await request<SyncOutboxRecord[]>(
        db.transaction(LIFE_OS_SYNC_STORE.outbox).objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
      );
      expect(
        outbox
          .map((r) => parsePilotSyncPayload(r.serializedPayload))
          .filter((p) => p.entityType === 'task_scenario'),
      ).toHaveLength(1);
      class FailingRecorder extends IndexedDbPilotMutationRecorder {
        override async recordUpsert(): Promise<boolean> {
          throw new Error('Injected outbox failure');
        }
      }
      database.configureSyncMutationCapture(new FailingRecorder(), LIFE_OS_SYNC_REGISTRY);
      await expect(
        app.plannerScenarios.update(original.id, 'Потерянная правка', null),
      ).rejects.toThrow();
      expect(await app.plannerScenarios.list('2026-09-24')).toEqual([original]);
    } finally {
      database.close();
    }
  });
});
