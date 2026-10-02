import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Walk } from '../../domain';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import { IndexedDbWalkRepository } from './IndexedDbWalkRepository';
import { done } from '../sync/attachments/AttachmentRegistration';
const now = new Date('2026-10-01T10:00:00Z');
describe('walk history', () => {
  it('pages identical timestamps without duplicates, projects photos and restores deleted facts', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const db = await database.open();
      const tx = db.transaction('walks', 'readwrite');
      const completion = done(tx);
      for (let i = 0; i < 35; i++) {
        const walk = Walk.create({
          id: EntityId.create(`walk-${i.toString().padStart(2, '0')}`),
          date: DayDate.create('2026-10-01'),
          type: 'restorative',
          now,
        })
          .start({ mode: 'stopwatch', startedAt: now })
          .complete({ endedAt: new Date(now.getTime() + 600_000), result: 'Спокойствие' });
        tx.objectStore('walks').put(WalkRecordMapper.toRecord(walk));
      }
      await completion;
      const repository = new IndexedDbWalkRepository(database);
      const first = await repository.list();
      const second = await repository.list({ cursor: first.nextCursor! });
      expect(first.items).toHaveLength(30);
      expect(second.items).toHaveLength(5);
      expect(new Set([...first.items, ...second.items].map((w) => w.id.toString())).size).toBe(35);
      const original = first.items[0]!;
      const deleted = original.remove(new Date(now.getTime() + 700_000));
      await repository.run(
        { requestId: 'delete', operation: 'remove', inputHash: 'delete' },
        async (unit) => {
          await unit.saveWalk(deleted, original.version);
          return deleted;
        },
      );
      expect((await repository.list({ deleted: true })).items).toHaveLength(1);
      expect((await repository.list()).items.some((w) => w.id.equals(deleted.id))).toBe(false);
      expect((await repository.get(deleted.id.toString()))?.deletedAt).not.toBeNull();
      const restored = deleted.restore(new Date(now.getTime() + 800_000));
      expect(restored.endedAt).toEqual(original.endedAt);
      expect(restored.result).toBe(original.result);
      expect(WalkRecordMapper.fromRecord(WalkRecordMapper.toRecord(deleted)).deletedAt).toEqual(
        deleted.deletedAt,
      );
      expect(() =>
        Walk.create({
          id: EntityId.create('active'),
          date: DayDate.create('2026-10-01'),
          type: 'restorative',
          now,
        })
          .start({ mode: 'stopwatch', startedAt: now })
          .remove(now),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});
