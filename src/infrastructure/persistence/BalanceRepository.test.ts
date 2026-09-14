import { describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Direction, Sphere, EntityId } from '../../domain';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbBalanceRepository } from './IndexedDbBalanceRepository';
import { IndexedDbSphereRepository } from './IndexedDbSphereRepository';
import { IndexedDbDirectionRepository } from './IndexedDbDirectionRepository';
import { BalanceIndicators } from '../../application/balance/BalanceIndicators';
import { projectLifeBalance } from '../../application/balance/GetLifeBalance';
import { DayDate } from '../../domain/day/DayDate';
import { BALANCE_TRANSACTION_STORES, balanceRequest } from './BalanceSnapshotTransaction';

describe('atomic balance indicator and monthly history storage', () => {
  it('rolls back direction and an already queued snapshot if refresh fails', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      now = new Date('2026-09-14T12:00:00Z');
    const repo = new IndexedDbBalanceRepository(
      db,
      { now: () => now },
      { getCurrentDate: () => DayDate.create('2026-09-14') },
    );
    const directions = new IndexedDbDirectionRepository(db);
    try {
      const direction = Direction.create({ id: EntityId.create('d'), name: 'Сон', now });
      await directions.create(direction);
      const before = await repo.read();
      db.configureBalanceSnapshots(BALANCE_TRANSACTION_STORES, async (tx) => {
        await balanceRequest(
          tx
            .objectStore('balanceMonthlySnapshots')
            .put({ ...before.snapshots[0]!, automaticScore: 9, effectiveScore: 9 }),
        );
        throw new Error('calculation failed');
      });
      await expect(
        directions.updateIfVersionMatches(
          direction.update({ name: 'Изменённое' }, now),
          direction.version,
        ),
      ).rejects.toThrow('calculation failed');
      expect((await directions.findById(direction.id))?.name).toBe('Сон');
      expect((await repo.read()).snapshots).toEqual(before.snapshots);
    } finally {
      db.close();
    }
  });
  it('enforces five slots, distinguishes null, freezes previous months and survives reload', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    let now = new Date('2026-09-14T12:00:00Z');
    const clock = { now: () => now },
      date = { getCurrentDate: () => DayDate.create(now.toISOString().slice(0, 10)) };
    const repo = new IndexedDbBalanceRepository(db, clock, date);
    const service = new BalanceIndicators(repo, clock);
    try {
      const s = Sphere.create({
        id: EntityId.create('s'),
        name: 'Здоровье',
        desiredLevel: 8,
        importance: 'high',
        now,
      });
      await new IndexedDbSphereRepository(db).createIfNameAvailable(s);
      await new IndexedDbDirectionRepository(db).create(
        Direction.create({
          id: EntityId.create('d'),
          sphereId: s.id,
          name: 'Сон',
          mode: 'maintain',
          now,
        }),
      );
      const first = await service.save(
        'd',
        {
          type: 'rating',
          target: null,
          value: 4,
          name: 'Самочувствие',
          sourceType: 'manual',
          sourceGoalId: null,
          importance: 'normal',
        },
        null,
      );
      let state = await repo.read();
      expect(projectLifeBalance(state, '2026-09-14').spheres[0]?.effectiveScore).toBe(4);
      expect(state.snapshots.find((v) => v.entityType === 'sphere')?.attentionNeed).toBe(12);
      const count = state.snapshots.length;
      await repo.refreshSnapshots();
      expect((await repo.read()).snapshots).toEqual(state.snapshots);
      for (let n = 0; n < 4; n++)
        await service.save(
          'd',
          {
            type: 'rating',
            target: null,
            value: null,
            name: `Empty ${n}`,
            sourceType: 'manual',
            sourceGoalId: null,
            importance: 'critical',
          },
          null,
        );
      await expect(
        service.save(
          'd',
          {
            type: 'rating',
            target: null,
            value: 10,
            name: 'Sixth',
            sourceType: 'manual',
            sourceGoalId: null,
            importance: 'normal',
          },
          null,
        ),
      ).rejects.toThrow('пяти');
      expect((await repo.read()).indicators).toHaveLength(5);
      now = new Date('2026-10-01T12:00:00Z');
      await service.save(
        'd',
        { ...first, type: 'rating', target: null, value: 8 },
        { id: first.id, version: first.version },
      );
      db.close();
      state = await repo.read();
      expect(state.snapshots).toHaveLength(count * 2);
      expect(
        state.snapshots.find((v) => v.entityType === 'sphere' && v.month === '2026-09')
          ?.effectiveScore,
      ).toBe(4);
      expect(
        state.snapshots.find((v) => v.entityType === 'sphere' && v.month === '2026-10')
          ?.effectiveScore,
      ).toBe(8);
      expect(projectLifeBalance(state, '2026-10-01').directions[0]?.activeGoals).toHaveLength(0);
      const closedHistory = state.snapshots;
      const refresh = vi
        .spyOn(db, 'refreshBalanceSnapshots')
        .mockRejectedValueOnce(new Error('snapshot failure'));
      await expect(service.remove(first.id, 2)).rejects.toThrow('snapshot failure');
      expect((await repo.read()).indicators.find((i) => i.id === first.id)?.removed).toBe(false);
      expect((await repo.read()).snapshots).toEqual(closedHistory);
      refresh.mockRestore();
      const previousDate = { getCurrentDate: () => DayDate.create('2026-09-30') };
      new IndexedDbBalanceRepository(db, clock, previousDate);
      await service.save(
        'd',
        { ...first, type: 'rating', target: null, value: 2 },
        { id: first.id, version: 2 },
      );
      expect((await repo.read()).snapshots).toEqual(closedHistory);
    } finally {
      db.close();
    }
  });
});
