import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbPlannerRepository } from './IndexedDbPlannerRepository';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { PlannerInbox } from '../../application/planner/PlannerInbox';
import { EntityId } from '../../domain';
import { parsePilotSyncPayload } from '../../application/sync/pilot';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import type { SyncOutboxRecord } from './records/SyncStoreRecords';

describe('planner durable transaction boundary', () => {
  it('captures conversion target, source link and focus through the existing sync outbox', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const db = await database.open();
      const setup = db.transaction([...PILOT_MUTATION_STORES], 'readwrite');
      const completed = done(setup);
      setup.objectStore(LIFE_OS_SYNC_STORE.settings).put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: '11111111-1111-4111-8111-111111111111',
        deviceId: 'test',
        currentKeyEpoch: 1,
      });
      await completed;
      const idea = await app.plannerInbox.capture({ title: 'Синхронизируемая мысль' });
      const result = await app.plannerInbox.convert(idea.id, 'goal');
      await app.plannerFocus.setRole('2026-09-13', result.targetId!, 'primary');
      const records = await request<SyncOutboxRecord[]>(
        db.transaction(LIFE_OS_SYNC_STORE.outbox).objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
      );
      const payloads = records.map((r) => parsePilotSyncPayload(r.serializedPayload));
      expect(payloads.filter((p) => p.entityType === 'goal')).toHaveLength(1);
      expect(
        payloads.find((p) => p.entityType === 'inbox_idea' && p.record?.status === 'converted')
          ?.record?.targetId,
      ).toBe(result.targetId);
      expect(payloads.filter((p) => p.entityType === 'planning_period')).toHaveLength(1);
      expect(payloads.filter((p) => p.entityType === 'period_membership')).toHaveLength(1);
    } finally {
      database.close();
    }
  });
  it('aborts both target and source when outbox recording fails', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const original = await app.plannerInbox.capture({ title: 'Не терять' });
      class FailingRecorder extends IndexedDbPilotMutationRecorder {
        override async recordUpsert(): Promise<boolean> {
          throw new Error('Injected outbox failure');
        }
      }
      const service = new PlannerInbox(
        new IndexedDbPlannerRepository(database, new FailingRecorder()),
        { now: () => new Date('2026-09-13') },
        { generate: () => EntityId.create('test-event') },
      );
      await expect(service.convert(original.id, 'goal')).rejects.toThrow('Injected outbox failure');
      expect((await app.plannerInbox.list())[0]).toEqual(original);
      expect(await app.getGoals.execute()).toHaveLength(0);
    } finally {
      database.close();
    }
  });
});
