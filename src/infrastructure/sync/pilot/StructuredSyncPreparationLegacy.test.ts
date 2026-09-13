import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '../../../domain';
import { PreparationService } from '../../../application/preparation/PreparationService';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { IndexedDbDecisionRepository } from '../../persistence/IndexedDbDecisionRepository';
import { IndexedDbEveningCycleRepository } from '../../persistence/IndexedDbEveningCycleRepository';
import { IndexedDbLifeActionRepository } from '../../persistence/IndexedDbLifeActionRepository';
import { IndexedDbPreparationPlanRepository } from '../../persistence/IndexedDbPreparationPlanRepository';
import { IndexedDbPreparationRuleRepository } from '../../persistence/IndexedDbPreparationRuleRepository';
import { IndexedDbPreparationUnitOfWork } from '../../persistence/IndexedDbPreparationUnitOfWork';
import { IndexedDbProjectRepository } from '../../persistence/IndexedDbProjectRepository';
import { IndexedDbTomorrowPlanRepository } from '../../persistence/IndexedDbTomorrowPlanRepository';
import { LIFE_OS_SYNC_STORE, LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncOutboxRecord } from '../../persistence/records';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';
import { structuredSyncFixtures } from './StructuredSyncFixtures';

const date = DayDate.create('2026-09-07');
const now = new Date('2026-09-07T12:00:00.000Z');

describe('SYNC-04 preparation legacy completion policy', () => {
  it.each(['Synthetic rule', 'Different receiver rule'])(
    'preserves incoming completion across application reads and restart with receiver rule %s',
    async (receiverTitle) => {
      const a = await device('a', 7, receiverTitle);
      const b = await device('b', 2);
      try {
        await receiveCompleted(a, b);
        const stored = (await a.plans.findByCycleId(EntityId.create('a-evening_cycle')))!;
        expect(stored.status).toBe('COMPLETED');
        expect(stored.completedAt).toEqual(now);
        const before = await outbox(a.db);

        const loaded = await a.service.getOrGenerate(date);
        expect(loaded.plan.status).toBe('COMPLETED');
        expect(loaded.plan.completedAt).toEqual(now);
        expect(loaded.plan.version).toBe(stored.version);
        expect(loaded.plan.items).toEqual(stored.items);
        expect(loaded.plan.generationSignature).toBe(stored.generationSignature);
        expect(await outbox(a.db)).toEqual(before);

        a.db.close();
        const restarted = new LifeOsIndexedDb(a.factory);
        try {
          capture(restarted);
          const recovered = await service(restarted, 'restart').getOrGenerate(date);
          expect(recovered.plan.status).toBe('COMPLETED');
          expect(recovered.plan.completedAt).toEqual(now);
          expect(recovered.plan.version).toBe(stored.version);
          expect(recovered.plan.items).toEqual(stored.items);
          expect(await outbox(restarted)).toEqual(before);
          const rules = await new IndexedDbPreparationRuleRepository(restarted).findActive();
          expect(rules[0]).toMatchObject({ title: receiverTitle, version: 7 });
        } finally {
          restarted.close();
        }
      } finally {
        a.db.close();
        b.db.close();
      }
    },
  );

  it('still applies an explicit item edit to a completed legacy plan', async () => {
    const a = await device('a', 7);
    const b = await device('b', 2);
    try {
      await receiveCompleted(a, b);
      const stored = (await a.plans.findByCycleId(EntityId.create('a-evening_cycle')))!;
      const before = await outbox(a.db);
      const item = stored.activeItems.find((candidate) => candidate.status === 'SKIPPED')!;
      const edited = await a.service.completeItem(date, item.id);
      expect(edited.plan.status).toBe('IN_PROGRESS');
      expect(edited.plan.completedAt).toBeNull();
      expect(edited.plan.version).toBe(stored.version + 1);
      expect(edited.plan.items.find((candidate) => candidate.id.equals(item.id))?.status).toBe(
        'COMPLETED',
      );
      expect(await outbox(a.db)).toHaveLength(before.length + 1);
    } finally {
      a.db.close();
      b.db.close();
    }
  });

  it('continues regenerating an unfinished plan when generation inputs change', async () => {
    const a = await device('a', 2);
    try {
      const before = (await a.service.getOrGenerate(date)).plan;
      await a.service.createRule({
        condition: 'FIRST_ACTION_CONTAINS',
        conditionValue: 'new input',
        title: 'New rule',
        category: 'COGNITIVE',
        required: false,
      });
      const regenerated = (await a.service.getOrGenerate(date)).plan;
      expect(regenerated.status).toBe('IN_PROGRESS');
      expect(regenerated.version).toBe(before.version + 1);
      expect(regenerated.generationSignature).not.toBe(before.generationSignature);
    } finally {
      a.db.close();
    }
  });
});

async function receiveCompleted(
  a: Awaited<ReturnType<typeof device>>,
  b: Awaited<ReturnType<typeof device>>,
) {
  const generated = await b.service.getOrGenerate(date);
  const configured = await b.service.configureRequiredCore(date, generated.recommendedCoreKeys);
  for (const item of configured.plan.activeItems.filter((candidate) => candidate.required)) {
    await b.service.skipItem(date, item.id, 'Synthetic accepted outcome');
  }
  await b.service.continueToRelaxation(date);
  const latest = (await outbox(b.db))
    .filter((event) => event.entityType === 'preparation_plan')
    .sort((left, right) => right.proposedRevision - left.proposedRevision)[0]!;
  await new IndexedDbPilotSyncStore(a.db).applyPulled(
    'space',
    1,
    parsePilotSyncPayload(latest.serializedPayload),
    'opaque-preparation',
    { kind: 'fast_forward', winner: 'incoming' },
  );
}

async function device(prefix: string, ruleVersion: number, title = 'Synthetic rule') {
  const factory = new IDBFactory();
  const db = new LifeOsIndexedDb(factory);
  const connection = await db.open();
  const fixtures = JSON.parse(
    JSON.stringify(structuredSyncFixtures()).replaceAll('sync04-', `${prefix}-`),
  ) as ReturnType<typeof structuredSyncFixtures>;
  const tx = connection.transaction(
    ['days', 'eveningCycles', 'tomorrowPlans', 'preparationRules', LIFE_OS_SYNC_STORE.settings],
    'readwrite',
  );
  tx.objectStore('days').put(fixtures.day);
  tx.objectStore('days').put({ ...fixtures.day, id: `${prefix}-target-day`, date: '2026-09-08' });
  tx.objectStore('eveningCycles').put({
    ...fixtures.evening_cycle,
    state: 'PREPARING',
    mode: 'NORMAL',
    startedAt: now.toISOString(),
  });
  tx.objectStore('tomorrowPlans').put(fixtures.tomorrow_plan);
  tx.objectStore('preparationRules').put({
    ...fixtures.preparation_rule,
    id: 'shared-rule',
    version: ruleVersion,
    title,
  });
  tx.objectStore(LIFE_OS_SYNC_STORE.settings).put({
    id: 'sync',
    setupState: 'configured',
    membershipStatus: 'active',
    spaceId: 'space',
    currentKeyEpoch: 1,
    deviceId: prefix,
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  capture(db);
  const application = service(db, prefix);
  await application.getOrGenerate(date);
  return { db, factory, service: application, plans: new IndexedDbPreparationPlanRepository(db) };
}

function capture(db: LifeOsIndexedDb) {
  db.configureSyncMutationCapture(
    new IndexedDbPilotMutationRecorder({ now: () => now }),
    LIFE_OS_SYNC_REGISTRY,
  );
}

function service(db: LifeOsIndexedDb, prefix: string) {
  return new PreparationService(
    new IndexedDbEveningCycleRepository(db),
    new IndexedDbTomorrowPlanRepository(db),
    new IndexedDbPreparationPlanRepository(db),
    new IndexedDbPreparationRuleRepository(db),
    new IndexedDbDecisionRepository(db),
    new IndexedDbLifeActionRepository(db),
    new IndexedDbProjectRepository(db),
    new FakeClock(now),
    new FakeIdGenerator(prefix),
    new IndexedDbPreparationUnitOfWork(db),
  );
}

async function outbox(db: LifeOsIndexedDb): Promise<SyncOutboxRecord[]> {
  const connection = await db.open();
  const request = connection
    .transaction(LIFE_OS_SYNC_STORE.outbox)
    .objectStore(LIFE_OS_SYNC_STORE.outbox)
    .getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
