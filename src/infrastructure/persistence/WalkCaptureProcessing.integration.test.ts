import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { done, request } from '../sync/attachments/AttachmentRegistration';
describe('thought to action', () => {
  it('keeps the original thought when connected clients cannot preserve its action link', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const walks = app.walks!;
      const walk = await walks.commands.start({
        requestId: 'sync-start',
        intent: 'free',
        type: 'restorative',
        mode: 'stopwatch',
        question: 'Вопрос',
        targetMinutes: null,
        sphereId: null,
        beforeState: null,
      });
      const capture = await walks.captures.capture({
        walkId: walk.id.toString(),
        requestId: 'sync-thought',
        content: 'Сохранить мысль',
      });
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
        walks.processing.createAction({
          captureId: capture.id.toString(),
          expectedVersion: capture.version,
          requestId: 'sync-convert',
          title: 'Сделать',
        }),
      ).rejects.toMatchObject({ code: 'sync.client_update_required' });
      expect((await walks.queries.listCaptures())[0]?.content).toBe('Сохранить мысль');
      expect((await walks.queries.listCaptures())[0]?.resultActionId).toBeNull();
      expect(
        await request<unknown[]>(db.transaction('lifeActions').objectStore('lifeActions').getAll()),
      ).toHaveLength(0);
    } finally {
      app.close();
    }
  });
  it('creates one draft atomically and retains the full thought on repeated requests', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const walks = app.walks!;
      const walk = await walks.commands.start({
        requestId: 'start',
        intent: 'free',
        type: 'restorative',
        mode: 'stopwatch',
        question: null,
        targetMinutes: null,
        sphereId: null,
        beforeState: null,
      });
      const capture = await walks.captures.capture({
        walkId: walk.id.toString(),
        requestId: 'thought',
        content: 'я'.repeat(500),
      });
      const input = {
        captureId: capture.id.toString(),
        expectedVersion: capture.version,
        requestId: 'convert',
        title: 'Проверить мысль',
      };
      const first = await walks.processing.createAction(input);
      const second = await walks.processing.createAction(input);
      expect(first).toEqual(second);
      const db = await database.open();
      const actions = await request<Array<{ id: string; description: string; status: string }>>(
        db.transaction('lifeActions').objectStore('lifeActions').getAll(),
      );
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        id: first.actionId,
        description: 'я'.repeat(500),
        status: 'draft',
      });
      const thoughts = await walks.queries.listCaptures();
      expect(thoughts[0]?.resultActionId?.toString()).toBe(first.actionId);
      expect(thoughts[0]?.content).toHaveLength(500);
      expect((await walks.queries.get(walk.id.toString()))?.status).toBe('running');
    } finally {
      app.close();
    }
  });
});
