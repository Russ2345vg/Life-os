import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from './IndexedDbPlanningRepository';
import { automaticPeriod } from '../../domain/planner/PlanningPeriod';
describe('planning transactions', () => {
  it('persists period records and rolls back failed operations', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbPlanningRepository(db);
    try {
      await repository.change((s) => {
        s.periods.push(automaticPeriod('week', '2026-09-14'));
      });
      expect((await repository.read()).periods).toHaveLength(1);
      await expect(
        repository.change((s) => {
          s.periods.push(automaticPeriod('year', '2026-09-14'));
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect((await repository.read()).periods).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
