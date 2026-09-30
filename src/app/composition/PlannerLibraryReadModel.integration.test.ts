import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { LifeActionTitle, type Goal } from '../../domain';
import { focusPeriod, focusWeek } from '../../domain/planner/FocusPeriod';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbAccountLocalData } from '../../infrastructure/sync/IndexedDbAccountLocalData';
import { createLifeOsApplication } from './createLifeOsApplication';

async function write(database: LifeOsIndexedDb, store: string, value: unknown) {
  const db = await database.open();
  const tx = db.transaction(store, 'readwrite');
  if (value === null) tx.objectStore(store).clear();
  else tx.objectStore(store).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('abort', () => reject(tx.error));
  });
}

describe('library read composition', () => {
  it('updates from real local commands without sync or explicit refresh', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const model = app.libraryReads.create('2026-09-30');
      const stop = model.subscribe(() => {});
      await model.whenSettled();
      const goals = vi.spyOn(app.getGoals, 'execute');
      const action = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Новое действие'),
      });
      if (!action.ok) throw action.error;
      await model.whenSettled();
      expect(model.getSnapshot().data?.actions[0]?.title.toString()).toBe('Новое действие');
      const result = await app.completeLifeAction.execute({ lifeActionId: action.value.id });
      if (!result.ok) throw result.error;
      await model.whenSettled();
      expect(model.getSnapshot().data?.actions[0]?.status).toBe('completed');
      await app.plannerInbox.capture({ title: 'Мысль' });
      await model.whenSettled();
      expect(model.getSnapshot().data?.ideas[0]?.title).toBe('Мысль');
      await app.timeCapacity.setWeekday(0, 90);
      await model.whenSettled();
      expect(model.getSnapshot().data?.timeCapacity[0]).toBe(90);
      expect(goals).not.toHaveBeenCalled();
      stop();
    } finally {
      app.close();
    }
  });

  it('converges after legacy focus import and recovers when a broken planning record is repaired', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const goal = await app.createGoal.execute({ title: 'Цель', status: 'active' });
      if (!goal.ok) throw goal.error;
      await write(
        database,
        'focusPeriods',
        focusPeriod({
          ...focusWeek('2026-09-30'),
          goals: [{ goalId: goal.value.id.toString(), role: 'primary' }],
          updatedAt: '2026-09-30T10:00:00Z',
          version: 1,
          schemaVersion: 1,
        }),
      );
      const commits = vi.fn();
      const stopCommits = database.subscribeCommits(commits);
      const model = app.libraryReads.create('2026-09-30');
      const stop = model.subscribe(() => {});
      await model.whenSettled();
      expect(model.getSnapshot().error).toBeNull();
      expect(model.getSnapshot().data?.focus?.goals[0]?.goalId).toBe(goal.value.id.toString());
      expect(commits).toHaveBeenCalled();
      commits.mockClear();
      await model.refresh();
      expect(commits).not.toHaveBeenCalled();
      const data = model.getSnapshot().data;
      await write(database, 'recurrenceRules', { id: 'broken' });
      await model.whenSettled();
      expect(model.getSnapshot().error).not.toBeNull();
      expect(model.getSnapshot().data).toBe(data);
      await write(database, 'recurrenceRules', null);
      await model.whenSettled();
      expect(model.getSnapshot().error).toBeNull();
      expect(model.getSnapshot().data?.focus?.goals[0]?.goalId).toBe(goal.value.id.toString());
      stop();
      stopCommits();
    } finally {
      app.close();
    }
  });

  it('discards a previous account snapshot across purge with the same application instance', async () => {
    const indexedDb = new IDBFactory();
    const database = new LifeOsIndexedDb(indexedDb);
    const app = await createLifeOsApplication({ database });
    try {
      await app.plannerInbox.capture({ title: 'Данные старого аккаунта' });
      const model = app.libraryReads.create('2026-09-30');
      const stop = model.subscribe(() => {});
      await model.whenSettled();
      expect(model.getSnapshot().data?.ideas).toHaveLength(1);
      let release!: (value: readonly Goal[]) => void;
      vi.spyOn(app.getGoals, 'execute').mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const pending = model.refresh();
      await Promise.resolve();
      stop();
      await pending;
      await new IndexedDbAccountLocalData(database, indexedDb, { removeItem: () => {} }).purge();
      const next = app.libraryReads.create('2026-09-30');
      const stopNext = next.subscribe(() => {});
      await next.whenSettled();
      release([]);
      await Promise.resolve();
      expect(model.getSnapshot().data).toBeNull();
      expect(next.getSnapshot().data?.ideas).toEqual([]);
      expect(next.getSnapshot().data?.actions).toEqual([]);
      stopNext();
    } finally {
      app.close();
    }
  });

  it('closes pending sessions before database shutdown and reads fresh after reopen', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    await app.plannerInbox.capture({ title: 'Сохранено' });
    let release!: (value: readonly Goal[]) => void;
    vi.spyOn(app.getGoals, 'execute').mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const model = app.libraryReads.create('2026-09-30');
    model.subscribe(() => {});
    await Promise.resolve();
    const pending = model.whenSettled();
    app.close();
    await pending;
    release([]);
    expect(model.getSnapshot().data).toBeNull();
    expect(() => app.libraryReads.create('2026-09-30')).toThrow();
    const reopened = await createLifeOsApplication({ database });
    try {
      const next = reopened.libraryReads.create('2026-09-30');
      next.subscribe(() => {});
      await next.whenSettled();
      expect(next.getSnapshot().data?.ideas[0]?.title).toBe('Сохранено');
    } finally {
      reopened.close();
    }
  });
});
