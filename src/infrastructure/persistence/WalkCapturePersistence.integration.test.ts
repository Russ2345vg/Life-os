import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DayDate, EntityId } from '../../domain';
import { WalkCommands } from '../../application/walk/WalkCommands';
import { WalkCaptureCommands } from '../../application/walk/WalkCaptureCommands';
import { IndexedDbWalkRepository } from './IndexedDbWalkRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
const databases: LifeOsIndexedDb[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
describe('walk thoughts', () => {
  it('persists one thought per request with pause-aware elapsed time and permits later editing', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    databases.push(database);
    const repository = new IndexedDbWalkRepository(database);
    let now = new Date('2026-10-01T10:00:00Z');
    let seq = 0;
    const clock = { now: () => now };
    const ids = { generate: () => EntityId.create(`id-${++seq}`) };
    const walks = new WalkCommands(
      repository,
      clock,
      { getCurrentDate: () => DayDate.create('2026-10-01') },
      ids,
    );
    const captures = new WalkCaptureCommands(repository, clock, ids);
    const walk = await walks.start({
      requestId: 'start',
      intent: 'free',
      type: 'restorative',
      mode: 'stopwatch',
      question: null,
      targetMinutes: null,
      sphereId: null,
      beforeState: null,
    });
    now = new Date('2026-10-01T10:10:00Z');
    const paused = await walks.pause({
      walkId: walk.id.toString(),
      expectedVersion: walk.version,
      requestId: 'pause',
    });
    now = new Date('2026-10-01T10:15:00Z');
    const input = { walkId: walk.id.toString(), content: '  Запомнить  ', requestId: 'thought' };
    const thought = await captures.capture(input);
    expect(thought.content).toBe('Запомнить');
    expect(thought.walkElapsedMs).toBe(600_000);
    database.close();
    expect((await captures.capture(input)).id.toString()).toBe(thought.id.toString());
    expect(await repository.listCaptures()).toHaveLength(1);
    await walks.complete({
      walkId: walk.id.toString(),
      expectedVersion: paused.version,
      requestId: 'finish',
    });
    await expect(captures.capture({ ...input, requestId: 'late' })).rejects.toMatchObject({
      code: 'walk_capture.requires_active',
    });
    const edited = await captures.update({
      captureId: thought.id.toString(),
      expectedVersion: thought.version,
      requestId: 'edit',
      content: 'Исправлено',
    });
    expect(edited.capturedAt).toEqual(thought.capturedAt);
    expect(edited.content).toBe('Исправлено');
    await expect(
      captures.update({
        captureId: thought.id.toString(),
        expectedVersion: thought.version,
        requestId: 'stale',
        content: 'Устарело',
      }),
    ).rejects.toMatchObject({ code: 'persistence.version_conflict' });
  });
});
