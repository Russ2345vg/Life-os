import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import sample from '../../../tests/fixtures/annual-plan.json';
import { createLifeOsApplication } from './createLifeOsApplication';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbGoalRepository } from '../../infrastructure/persistence/IndexedDbGoalRepository';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';
import { IndexedDbSphereRepository } from '../../infrastructure/persistence/IndexedDbSphereRepository';
import { IndexedDbDirectionRepository } from '../../infrastructure/persistence/IndexedDbDirectionRepository';

describe('Plan import through production composition', () => {
  it('previews without writes, imports linked dates and survives reopen and repeat', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const text = JSON.stringify(sample);
      const preview = app.planImport!.preview(text);
      expect(preview.goals).toHaveLength(1);
      const goals = new IndexedDbGoalRepository(database);
      const actions = new IndexedDbLifeActionRepository(database);
      expect(await goals.findAll()).toHaveLength(0);
      const result = await app.planImport!.execute(text);
      expect(result.error).toBeNull();
      expect(result.created.goals).toBe(1);
      const goal = (await goals.findAll())[0]!;
      expect(goal.dueDate).toBe('2026-12-31');
      const action = (await actions.findAll())[0]!;
      expect(action.goalId?.toString()).toBe(goal.id.toString());
      expect(action.plannedDate?.toString()).toBe('2026-10-03');
      database.close();
      const reopened = await createLifeOsApplication({ database });
      try {
        const repeated = await reopened.planImport!.execute(text);
        expect(repeated.error).toBeNull();
        expect(repeated.created).toEqual({ spheres: 0, directions: 0, goals: 0, actions: 0 });
        expect(await goals.findAll()).toHaveLength(1);
        expect(await actions.findAll()).toHaveLength(1);
      } finally {
        reopened.close();
      }
    } finally {
      app.close();
    }
  });

  it('rejects an invalid last action before creating any goal or direction', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const invalid = {
        ...sample,
        actions: [...sample.actions, { key: 'bad', goalKey: 'missing', title: 'Ошибка' }],
      };
      await expect(app.planImport!.execute(JSON.stringify(invalid))).rejects.toThrow();
      expect(await new IndexedDbGoalRepository(database).findAll()).toHaveLength(0);
      expect(await app.getDirections.execute()).toEqual([]);
    } finally {
      app.close();
    }
  });

  it.each([
    { ...sample, version: 2 },
    { ...sample, goals: [...sample.goals, ...sample.goals] },
    { ...sample, goals: [{ ...sample.goals[0], dueDate: '2026-02-30' }] },
    { ...sample, actions: [{ ...sample.actions[0], date: '2027-01-01' }] },
    { ...sample, actions: [{ ...sample.actions[0], title: ' ' }] },
    { ...sample, unexpected: 'silently lost data' },
  ])('validates the complete source before any write: %j', async (invalid) => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      await expect(app.planImport!.execute(JSON.stringify(invalid))).rejects.toThrow();
      expect(await app.getDirections.execute()).toEqual([]);
      expect(await new IndexedDbGoalRepository(database).findAll()).toHaveLength(0);
    } finally {
      app.close();
    }
  });

  it('reuses existing spheres and preserves edited goals on repeat', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const before = await new IndexedDbSphereRepository(database).findAll();
      const existing = before[0]!;
      const text = JSON.stringify({
        ...sample,
        spheres: [{ ...sample.spheres[0], name: existing.name }],
      });
      const first = await app.planImport!.execute(text);
      expect(first.created.spheres).toBe(0);
      const repo = new IndexedDbGoalRepository(database);
      const goal = (await repo.findAll())[0]!;
      const changed = await app.updateGoal.execute({
        id: goal.id,
        expectedVersion: goal.version,
        title: 'Моё новое название',
      });
      expect(changed.ok).toBe(true);
      expect((await app.planImport!.execute(text)).error).toBeNull();
      expect((await repo.findAll())[0]!.title).toBe('Моё новое название');
      expect((await repo.findAll())[0]!.version).toBe(goal.version + 1);
      expect(await new IndexedDbSphereRepository(database).findAll()).toHaveLength(before.length);
    } finally {
      app.close();
    }
  });

  it.each([false, true])(
    'stops before adding records after a direction loses its original sphere (null: %s)',
    async (detach) => {
      const database = new LifeOsIndexedDb(new IDBFactory());
      const app = await createLifeOsApplication({ database });
      try {
        const source = {
          ...sample,
          spheres: [{ ...sample.spheres[0], name: 'Особая сфера плана' }],
        };
        expect((await app.planImport!.execute(JSON.stringify(source))).error).toBeNull();
        const directions = new IndexedDbDirectionRepository(database);
        const direction = (await directions.findAll())[0]!;
        const otherSphere = (await new IndexedDbSphereRepository(database).findAll()).find(
          (sphere) => !sphere.id.equals(direction.sphereId!),
        )!;
        const moved = direction.update(
          { name: direction.name, sphereId: detach ? null : otherSphere.id },
          app.clock.now(),
        );
        expect(await directions.updateIfVersionMatches(moved, direction.version)).toBe(true);
        const retry = await app.planImport!.execute(
          JSON.stringify({
            ...source,
            directions: [...source.directions, { ...source.directions[0], key: 'another' }],
          }),
        );
        expect(retry.error).toContain('перемещена');
        expect(retry.created).toEqual({ spheres: 0, directions: 0, goals: 0, actions: 0 });
        expect(await directions.findAll()).toHaveLength(1);
      } finally {
        app.close();
      }
    },
  );

  it('resumes after a failed action write without duplicating saved goals', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const fail = vi
        .spyOn(IndexedDbJournalUnitOfWork.prototype, 'commit')
        .mockRejectedValueOnce(new Error('Нет места'));
      const first = await app.planImport!.execute(JSON.stringify(sample));
      fail.mockRestore();
      expect(first.created.goals).toBe(1);
      expect(first.created.actions).toBe(0);
      expect(first.error).toContain('Нет места');
      const retry = await app.planImport!.execute(JSON.stringify(sample));
      expect(retry.error).toBeNull();
      expect(retry.created.goals).toBe(0);
      expect(retry.created.actions).toBe(1);
    } finally {
      vi.restoreAllMocks();
      app.close();
    }
  });

  it('does not restore deleted actions when repeating an import', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const text = JSON.stringify(sample);
      await app.planImport!.execute(text);
      const actions = new IndexedDbLifeActionRepository(database);
      const action = (await actions.findAll())[0]!;
      action.softDelete(app.clock.now());
      await actions.save(action);
      const repeat = await app.planImport!.execute(text);
      expect(repeat.created.actions).toBe(0);
      expect(await actions.findAll()).toHaveLength(0);
    } finally {
      app.close();
    }
  });

  it('stops at a deleted goal without recreating it or its steps', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const text = JSON.stringify({ ...sample, actions: [] });
      await app.planImport!.execute(text);
      const goals = new IndexedDbGoalRepository(database);
      const goal = (await goals.findAll())[0]!;
      expect(
        await goals.updateIfVersionMatches(goal.softDelete(app.clock.now()), goal.version),
      ).toBe(true);
      const repeat = await app.planImport!.execute(JSON.stringify(sample));
      expect(repeat.error).toContain('удалена');
      expect(await goals.findAll()).toHaveLength(0);
      expect(await new IndexedDbLifeActionRepository(database).findAll()).toHaveLength(0);
    } finally {
      app.close();
    }
  });

  it('create-only commands prevent duplicates from concurrent application instances', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    const other = await createLifeOsApplication({ database });
    try {
      const text = JSON.stringify(sample);
      const results = await Promise.all([
        app.planImport!.execute(text),
        other.planImport!.execute(text),
      ]);
      expect(results.map((result) => result.error)).toEqual([null, null]);
      expect(await new IndexedDbGoalRepository(database).findAll()).toHaveLength(1);
      expect(await new IndexedDbLifeActionRepository(database).findAll()).toHaveLength(1);
      expect(await new IndexedDbDirectionRepository(database).findAll()).toHaveLength(1);
    } finally {
      other.close();
      app.close();
    }
  });
});
