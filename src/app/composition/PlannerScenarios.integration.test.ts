import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, LifeActionTitle } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { createLifeOsApplication } from './createLifeOsApplication';

describe('Planner scenarios', () => {
  it('shares tasks and completion across saved sets and survives reopening', async () => {
    const factory = new IDBFactory();
    let db = new LifeOsIndexedDb(factory);
    try {
      let app = await createLifeOsApplication({ database: db });
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Разговор'),
        plannedDate: DayDate.create('2026-09-24'),
      });
      if (!created.ok) throw created.error;
      const id = created.value.id.toString();
      const home = await app.plannerScenarios.create('Дома', null);
      const outside = await app.plannerScenarios.create('Среди людей', '2026-09-24');
      await app.plannerScenarios.addAction(home.id, id);
      await app.plannerScenarios.addAction(outside.id, id);
      const completed = await app.completeLifeAction.execute({ lifeActionId: created.value.id });
      expect(completed.ok).toBe(true);
      expect(await app.plannerScenarios.list('2026-09-25')).toHaveLength(1);
      expect(await app.plannerCatalog.actions()).toHaveLength(1);
      await app.plannerScenarios.update(outside.id, 'На улице', null);
      db.close();
      db = new LifeOsIndexedDb(factory);
      app = await createLifeOsApplication({ database: db });
      const sets = await app.plannerScenarios.list('2026-09-25');
      expect(sets.map((s) => s.actionIds)).toEqual([[id], [id]]);
      expect((await app.plannerCatalog.actions())[0]?.status).toBe('completed');
      await app.plannerScenarios.archive(home.id);
      expect(await app.plannerScenarios.list('2026-09-25')).toHaveLength(1);
      expect(await app.plannerCatalog.actions()).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('enforces the limit atomically and rejects unavailable tasks without changing the set', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    try {
      const app = await createLifeOsApplication({ database: db });
      const ids: string[] = [];
      for (const title of ['Один', 'Два', 'Три', 'Четыре']) {
        const result = await app.createLifeActionDraft.execute({
          title: LifeActionTitle.create(title),
        });
        if (!result.ok) throw result.error;
        ids.push(result.value.id.toString());
      }
      const set = await app.plannerScenarios.create('Дома', null);
      const results = await Promise.allSettled(
        ids.map((id) => app.plannerScenarios.addAction(set.id, id)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      const saved = (await app.plannerScenarios.list('2026-09-24'))[0]!;
      expect(saved.actionIds).toHaveLength(3);
      await app.plannerScenarios.addAction(set.id, saved.actionIds[0]!);
      await app.plannerScenarios.removeAction(set.id, saved.actionIds[0]!);
      await expect(app.plannerScenarios.addAction(set.id, 'missing')).rejects.toThrow();
      await app.completeLifeAction.execute({ lifeActionId: EntityId.create(ids[3]!) });
      expect(
        (await app.archiveLifeAction.execute({ lifeActionId: EntityId.create(ids[3]!) })).ok,
      ).toBe(true);
      await expect(app.plannerScenarios.addAction(set.id, ids[3]!)).rejects.toThrow();
      expect((await app.plannerScenarios.list('2026-09-24'))[0]?.actionIds).toHaveLength(2);
    } finally {
      db.close();
    }
  });
});
