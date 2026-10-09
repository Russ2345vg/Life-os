import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Walk } from '../../domain';
import { createMemoryEvent } from '../../domain/memory/MemoryEvent';
import { done } from '../sync/attachments/AttachmentRegistration';
import { IndexedDbMemoryRepository } from './IndexedDbMemoryRepository';
import { IndexedDbConnectionReadRepository } from './IndexedDbConnectionReadRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';

const now = new Date('2026-10-05T10:00:00.000Z');

describe('IndexedDbConnectionReadRepository', () => {
  it('pages only exact saved walk and memory links without copying private text or photos', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const db = await database.open();
      const tx = db.transaction('walks', 'readwrite');
      const completion = done(tx);
      const walkId = (index: number) =>
        index === 0 ? 'walk-A' : index === 1 ? 'walk-a' : `walk-${String(index).padStart(2, '0')}`;
      for (let index = 0; index < 32; index++) {
        const walk = Walk.create({
          id: EntityId.create(walkId(index)),
          date: DayDate.create('2026-10-05'),
          type: 'restorative',
          linkedEntity: { type: 'goal', id: EntityId.create(index === 31 ? 'other' : 'goal-1') },
          now,
        })
          .start({ mode: 'stopwatch', startedAt: now })
          .complete({ endedAt: new Date(now.getTime() + 600_000), result: 'private walk note' });
        tx.objectStore('walks').put({
          ...WalkRecordMapper.toRecord(walk),
          photo: { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 1 },
        });
      }
      await completion;

      const memory = new IndexedDbMemoryRepository(database);
      const memoryId = (index: number) =>
        index === 0
          ? 'memory-A'
          : index === 1
            ? 'memory-a'
            : `memory-${String(index).padStart(2, '0')}`;
      for (let index = 0; index < 32; index++) {
        await memory.save(
          createMemoryEvent(
            {
              id: EntityId.create(memoryId(index)),
              occurredOn: DayDate.create('2026-10-05'),
              title: `Memory ${index}`,
              body: 'private memory body',
              kind: 'moment',
              isHighlight: false,
              context: {
                sphereId: null,
                sphereTitle: null,
                directionId: null,
                directionTitle: null,
                goalId: index === 31 ? 'other' : 'goal-1',
                goalTitle: 'Goal',
              },
              diarySource: null,
              photo: { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 1 },
            },
            now,
          ),
          null,
        );
      }

      const connections = new IndexedDbConnectionReadRepository(database);
      const firstWalks = await connections.listWalksBySource({ type: 'goal', id: 'goal-1' });
      const lastWalks = await connections.listWalksBySource(
        { type: 'goal', id: 'goal-1' },
        firstWalks.nextCursor!,
      );
      expect(firstWalks.items).toHaveLength(30);
      expect(lastWalks.items).toHaveLength(1);
      expect(new Set([...firstWalks.items, ...lastWalks.items].map((item) => item.id)).size).toBe(
        31,
      );
      expect([...firstWalks.items, ...lastWalks.items].map((item) => item.id)).toEqual(
        Array.from({ length: 31 }, (_, index) => walkId(index)).sort((a, b) =>
          a < b ? 1 : a > b ? -1 : 0,
        ),
      );
      expect(JSON.stringify(firstWalks.items)).not.toMatch(/private walk note|data:image/);

      const firstMemories = await connections.listMemoriesByGoal('goal-1');
      const lastMemories = await connections.listMemoriesByGoal(
        'goal-1',
        firstMemories.nextCursor!,
      );
      expect(firstMemories.items).toHaveLength(30);
      expect(lastMemories.items).toHaveLength(1);
      expect(
        new Set([...firstMemories.items, ...lastMemories.items].map((item) => item.id)).size,
      ).toBe(31);
      expect([...firstMemories.items, ...lastMemories.items].map((item) => item.id)).toEqual(
        Array.from({ length: 31 }, (_, index) => memoryId(index)).sort((a, b) =>
          a < b ? 1 : a > b ? -1 : 0,
        ),
      );
      expect(JSON.stringify(firstMemories.items)).not.toMatch(/private memory body|data:image/);
    } finally {
      database.close();
    }
  });

  it('reads only assigned routine blocks and the five needed planning collections', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const db = await database.open();
      const tx = db.transaction('routineBlocks', 'readwrite');
      const completion = done(tx);
      for (const [id, actionId] of [
        ['linked', 'action-1'],
        ['unrelated', 'action-2'],
      ]) {
        tx.objectStore('routineBlocks').put({
          schemaVersion: 1,
          id,
          anchorDate: '2026-10-05',
          title: `Block ${id}`,
          startTime: '08:00',
          endTime: '08:30',
          category: 'practice',
          recurrence: 'daily',
          selectedWeekdays: [],
          required: false,
          assignment: 'existingAction',
          actionId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          version: 1,
        });
      }
      await completion;
      const connections = new IndexedDbConnectionReadRepository(database);
      expect(
        (await connections.listRoutineAssignments('action-1')).map((item) => item.title),
      ).toEqual(['Block linked']);
      expect(Object.keys(await connections.readPlanning()).sort()).toEqual([
        'actions',
        'contributions',
        'goals',
        'links',
        'rules',
      ]);
    } finally {
      database.close();
    }
  });
});
