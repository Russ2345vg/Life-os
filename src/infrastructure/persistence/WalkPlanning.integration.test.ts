import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { done, request } from '../sync/attachments/AttachmentRegistration';
describe('planner-owned walks', () => {
  it('queues a recurring walk plan after confirming format 2 for this device', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const db = await database.open();
      const tx = db.transaction('sync_settings', 'readwrite');
      tx.objectStore('sync_settings').put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        deviceId: 'device',
        currentKeyEpoch: 1,
      });
      tx.objectStore('sync_settings').put({
        id: 'walk-data-format:v2',
        spaceId: 'space',
        deviceId: 'device',
        minimumDataFormat: 2,
      });
      await done(tx);
      await app.walks!.planning.plan({
        requestId: 'plan-format-two',
        date: app.currentDate.toString(),
        targetMinutes: 20,
        recurrence: 'daily',
      });
      expect(await app.walks!.planning.list()).toHaveLength(1);
      expect(
        (
          await request<unknown[]>(
            db.transaction('sync_outbox').objectStore('sync_outbox').getAll(),
          )
        ).length,
      ).toBeGreaterThan(0);
    } finally {
      app.close();
    }
  });
  it('does not save a plan or outbox entry when connected clients cannot preserve its metadata', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const db = await database.open();
      const tx = db.transaction('sync_settings', 'readwrite');
      tx.objectStore('sync_settings').put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        deviceId: 'device',
        currentKeyEpoch: 1,
      });
      await done(tx);
      await expect(
        app.walks!.planning.plan({
          requestId: 'plan-connected',
          date: app.currentDate.toString(),
          targetMinutes: 20,
          recurrence: 'daily',
        }),
      ).rejects.toMatchObject({ code: 'sync.client_update_required' });
      expect(await app.walks!.planning.list()).toHaveLength(0);
      expect(
        await request<unknown[]>(db.transaction('sync_outbox').objectStore('sync_outbox').getAll()),
      ).toHaveLength(0);
    } finally {
      app.close();
    }
  });
  it('persists typed walk metadata in recurring occurrences and starts without completing the action', async () => {
    const app = await createLifeOsApplication({ database: new LifeOsIndexedDb(new IDBFactory()) });
    try {
      const today = app.currentDate.toString();
      const input = {
        requestId: 'plan',
        date: today,
        targetMinutes: 20,
        recurrence: 'daily' as const,
      };
      const plan = await app.walks!.planning.plan(input);
      expect(await app.walks!.planning.plan(input)).toEqual(plan);
      await app.planning!.recurrence.materialize(today, addDays(today, 1));
      const actions = await app.walks!.planning.list();
      expect(actions.length).toBeGreaterThanOrEqual(2);
      expect(actions.every((action) => action.walkPlan?.targetMinutes === 20)).toBe(true);
      const walk = await app.walks!.planning.startPlanned({
        actionId: plan.actionId,
        requestId: 'start-plan',
      });
      expect(walk.linkedEntity?.id.toString()).toBe(plan.actionId);
      expect(walk.timerTargetMinutes).toBe(20);
      expect(
        (await app.walks!.planning.list()).find((action) => action.id.toString() === plan.actionId)
          ?.status,
      ).toBe('draft');
    } finally {
      app.close();
    }
  });
});
