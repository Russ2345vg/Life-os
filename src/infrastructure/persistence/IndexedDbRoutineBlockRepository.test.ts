import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { routineTestBlock } from '../../test/helpers/AutopilotTestFactory';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { IndexedDbRoutineBlockRepository } from './IndexedDbRoutineBlockRepository';
import { IndexedDbPilotMutationRecorder } from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../sync/LifeOsSyncRegistry';
import { request, done } from '../sync/attachments/AttachmentRegistration';
describe('routine block atomic persistence', () => {
  it('writes and deletes existing routine formats with CAS and exactly one sync mutation each', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const connection = await db.open(),
      seed = connection.transaction('sync_settings', 'readwrite');
    seed
      .objectStore('sync_settings')
      .put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        deviceId: 'desktop',
        currentKeyEpoch: 1,
      });
    await done(seed);
    db.configureSyncMutationCapture(new IndexedDbPilotMutationRecorder(), LIFE_OS_SYNC_REGISTRY);
    const unit = new IndexedDbJournalUnitOfWork(db);
    const block = routineTestBlock('day-autopilot:v1:2026-10-10:rest:0');
    await unit.commit({ routineBlocks: [{ block, expectedVersion: null }], journalEntries: [] });
    expect((await new IndexedDbRoutineBlockRepository(db).findAll())[0]?.startTime).toBe('12:00');
    const database = await db.open();
    expect(
      await request(database.transaction('sync_outbox').objectStore('sync_outbox').count()),
    ).toBe(1);
    await expect(
      unit.commit({ routineBlocks: [{ block, expectedVersion: null }], journalEntries: [] }),
    ).rejects.toThrow();
    await unit.commit({
      deletedRoutineBlocks: [{ id: block.id, expectedVersion: 1 }],
      journalEntries: [],
    });
    expect(await new IndexedDbRoutineBlockRepository(db).findAll()).toEqual([]);
    const mutations = await request<Record<string, unknown>[]>(
      database.transaction('sync_outbox').objectStore('sync_outbox').getAll(),
    );
    expect(mutations).toHaveLength(2);
    expect(JSON.parse(String(mutations[1]?.serializedPayload))).toMatchObject({
      operation: 'tombstone',
      entityType: 'routine_block',
    });
    db.close();
  });
});
