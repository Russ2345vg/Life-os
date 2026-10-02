import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DayDate, EntityId, Walk } from '../../domain';
import { WalkCommands } from '../../application/walk/WalkCommands';
import { IndexedDbWalkRepository } from './IndexedDbWalkRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { IndexedDbPilotMutationRecorder } from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../sync/LifeOsSyncRegistry';
import { IndexedDbRecoveryStore } from '../sync/recovery/IndexedDbRecoveryStore';

const databases: LifeOsIndexedDb[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup() {
  const database = new LifeOsIndexedDb(new IDBFactory());
  databases.push(database);
  const repository = new IndexedDbWalkRepository(database);
  let time = new Date('2026-10-01T10:00:00Z');
  let sequence = 0;
  const commands = new WalkCommands(
    repository,
    { now: () => time },
    { getCurrentDate: () => DayDate.create('2026-10-01') },
    { generate: () => EntityId.create(`walk-${++sequence}`) },
  );
  return {
    database,
    repository,
    commands,
    setTime: (value: string) => {
      time = new Date(value);
    },
  };
}
const start = (requestId: string) => ({
  requestId,
  intent: 'free' as const,
  type: 'restorative' as const,
  mode: 'stopwatch' as const,
  question: null,
  targetMinutes: null,
  sphereId: null,
  beforeState: null,
});
const target = (walk: Walk, requestId: string) => ({
  walkId: walk.id.toString(),
  expectedVersion: walk.version,
  requestId,
});

describe('durable walk commands', () => {
  it('records a free walk after format 2 is confirmed for its active device', async () => {
    const { database, commands } = setup();
    database.configureSyncMutationCapture(
      new IndexedDbPilotMutationRecorder(),
      LIFE_OS_SYNC_REGISTRY,
    );
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
    const walk = await commands.start(start('format-two'));
    expect(walk.status).toBe('running');
    expect(
      await request<unknown[]>(db.transaction('sync_outbox').objectStore('sync_outbox').getAll()),
    ).toHaveLength(1);
  });
  it('blocks incompatible mixed-version sync and rolls back a failing outbox', async () => {
    const { database, commands, repository } = setup();
    database.configureSyncMutationCapture(
      new IndexedDbPilotMutationRecorder(),
      LIFE_OS_SYNC_REGISTRY,
    );
    const db = await database.open();
    const tx = db.transaction('sync_settings', 'readwrite');
    const completion = done(tx);
    tx.objectStore('sync_settings').put({
      id: 'sync',
      setupState: 'configured',
      membershipStatus: 'active',
      spaceId: 'space',
      deviceId: 'device',
      currentKeyEpoch: 1,
    });
    await completion;
    await expect(commands.start(start('incompatible'))).rejects.toMatchObject({
      code: 'sync.client_update_required',
    });
    expect(await repository.getActive()).toHaveLength(0);
    const walk = await commands.start({ ...start('compatible'), question: 'О чём подумать?' });
    expect(walk.status).toBe('running');
    const events = await request<unknown[]>(
      db.transaction('sync_outbox').objectStore('sync_outbox').getAll(),
    );
    expect(events).toHaveLength(1);
    class FailingRecorder extends IndexedDbPilotMutationRecorder {
      override async recordUpsert(): Promise<boolean> {
        throw new Error('Injected failure');
      }
    }
    database.configureSyncMutationCapture(new FailingRecorder(), LIFE_OS_SYNC_REGISTRY);
    await expect(commands.pause(target(walk, 'failed-pause'))).rejects.toThrow();
    expect((await repository.get(walk.id.toString()))?.status).toBe('running');
    expect(
      await request(
        db
          .transaction('sync_settings')
          .objectStore('sync_settings')
          .get('walk-command:v1:failed-pause'),
      ),
    ).toBeUndefined();
  });

  it('invalidates old requests after exact restore even when timestamps are unchanged', async () => {
    const { database, commands } = setup();
    const input = { ...start('before-restore'), question: 'Мой вопрос' };
    await commands.start(input);
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
    const recovery = new IndexedDbRecoveryStore(database, new IndexedDbPilotMutationRecorder());
    const state = await recovery.readState();
    await recovery.apply(state, JSON.stringify(state), true);
    await expect(commands.start(input)).rejects.toMatchObject({ code: 'walk.request_invalidated' });
  });
  it('serializes two starts and replays a request after the response was lost', async () => {
    const { commands, repository } = setup();
    const results = await Promise.allSettled([
      commands.start(start('one')),
      commands.start(start('two')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const active = await repository.getActive();
    expect(active).toHaveLength(1);
    const retry = await commands.start(start('one'));
    expect(retry.id.toString()).toBe(active[0]!.id.toString());
    await expect(commands.start({ ...start('one'), intent: 'recovery' })).rejects.toMatchObject({
      code: 'walk.request_reused',
    });
  });

  it('persists timestamp duration, version conflicts and immutable completion receipts', async () => {
    const { commands, repository, database, setTime } = setup();
    const walk = await commands.start(start('start'));
    setTime('2026-10-01T10:10:00Z');
    const paused = await commands.pause(target(walk, 'pause'));
    await expect(commands.complete(target(walk, 'stale'))).rejects.toMatchObject({
      code: 'persistence.version_conflict',
    });
    setTime('2026-10-01T10:15:00Z');
    const resumed = await commands.resume(target(paused, 'resume'));
    setTime('2026-10-01T10:25:00Z');
    const completed = await commands.complete(target(resumed, 'complete'));
    expect(completed.actualDurationMilliseconds).toBe(20 * 60_000);
    expect(completed.version).toBe(resumed.version + 1);
    database.close();
    setTime('2026-10-01T12:00:00Z');
    const replay = await commands.complete(target(resumed, 'complete'));
    expect(replay.endedAt).toEqual(completed.endedAt);
    const reflected = await commands.saveReflection({
      ...target(completed, 'reflection'),
      reflection: { result: 'Отдохнул' },
    });
    expect(reflected.impact).toBeNull();
    expect((await repository.get(walk.id.toString()))?.result).toBe('Отдохнул');
    expect((await commands.complete(target(resumed, 'complete'))).version).toBe(reflected.version);
  });

  it('rolls back writes and receipts without notifying subscribers', async () => {
    const { repository } = setup();
    const listener = vi.fn();
    const unsubscribe = repository.subscribe(listener);
    await expect(
      repository.run({ requestId: 'rollback', operation: 'test', inputHash: 'a' }, async (tx) => {
        const walk = Walk.create({
          id: EntityId.create('rollback'),
          date: DayDate.create('2026-10-01'),
          type: 'restorative',
          now: new Date(),
        });
        await tx.saveWalk(walk, null);
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(await repository.get('rollback')).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('starts a saved planned walk with the same ID and exposes imported active conflicts', async () => {
    const { commands, repository, database } = setup();
    const planned = Walk.create({
      id: EntityId.create('planned'),
      date: DayDate.create('2026-09-30'),
      type: 'mindful',
      now: new Date('2026-09-30T10:00:00Z'),
    });
    const db = await database.open();
    const tx = db.transaction('walks', 'readwrite');
    const completion = done(tx);
    await request(tx.objectStore('walks').put(WalkRecordMapper.toRecord(planned)));
    await completion;
    const started = await commands.startExisting({
      ...target(planned, 'existing'),
      mode: 'stopwatch',
      targetMinutes: null,
      question: null,
    });
    expect(started.date.toString()).toBe('2026-09-30');
    expect(started.id.toString()).toBe('planned');
    expect(await repository.getActive()).toHaveLength(1);
  });
});
