import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { CompleteLifeAction } from '../../application/commands/CompleteLifeAction';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { EntityId, Goal, LifeActionTitle } from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LIFE_OS_SYNC_REGISTRY } from '../sync/LifeOsSyncRegistry';
import { IndexedDbPilotMutationRecorder } from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { IndexedDbPlanningRepository } from './IndexedDbPlanningRepository';
import { IndexedDbPilotSyncStore } from '../sync/pilot/IndexedDbPilotSyncStore';
import { PilotPushEngine, PilotSyncCoordinator } from '../../application/sync/pilot';
import { SyncTransferGate } from '../../application/sync/account/SyncTransferGate';
import type { SyncCryptoService } from '../../application/sync/ports/SyncCryptoService';
import type { PilotSyncTransport } from '../../application/sync/ports/PilotSyncTransport';

async function setup() {
  const database = new LifeOsIndexedDb(new IDBFactory());
  const clock = new FakeClock(new Date('2026-09-30T23:55:00+09:00'));
  const app = await createLifeOsApplication({ database, clock });
  const created = await app.createLifeActionDraft.execute({ title: LifeActionTitle.create('Шаг') });
  if (!created.ok) throw created.error;
  const planning = new IndexedDbPlanningRepository(database);
  await planning.change((state) => {
    state.goals.push(
      Goal.create({
        id: EntityId.create('goal'),
        title: 'Цель',
        status: 'active',
        now: clock.now(),
      }),
    );
  });
  await app.planning.progress.configure('goal', {
    mode: 'count',
    target: 10,
    unit: 'раз',
    start: 0,
    direction: 'at_least',
    cycle: null,
  });
  await app.planning.progress.setLink('action', created.value.id.toString(), 'goal', 'actual', 0);
  const db = await database.open();
  const tx = db.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
  tx.objectStore(LIFE_OS_SYNC_STORE.settings).put({
    id: 'sync',
    setupState: 'configured',
    membershipStatus: 'active',
    spaceId: '11111111-1111-4111-8111-111111111111',
    deviceId: 'device',
    currentKeyEpoch: 1,
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  const recorder = new IndexedDbPilotMutationRecorder({ now: () => clock.now() });
  database.configureSyncMutationCapture(recorder, LIFE_OS_SYNC_REGISTRY, [
    'direction',
    'project',
    'goal',
  ]);
  const repository = new IndexedDbLifeActionRepository(database);
  const command = new CompleteLifeAction(
    repository,
    clock,
    new FakeIdGenerator('complete'),
    new IndexedDbJournalUnitOfWork(database, recorder),
  );
  const input = {
    lifeActionId: created.value.id,
    expectedCompletionKey: created.value.completionKey,
  };
  const records = async () => {
    const names = ['lifeActions', 'journal', 'progressContributions', LIFE_OS_SYNC_STORE.outbox];
    const read = db.transaction(names);
    return Promise.all(
      names.map(
        (store) =>
          new Promise<readonly Record<string, unknown>[]>((resolve, reject) => {
            const request = read.objectStore(store).getAll();
            request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
  };
  return { app, database, clock, repository, recorder, command, input, records };
}

describe('durable completion recovery', () => {
  it('delivers the same committed completion after offline retry and preserves authorization and pause gates', async () => {
    const c = await setup();
    let authorized = false,
      online = false,
      sequence = 0;
    const gate = new SyncTransferGate(async () => authorized);
    const store = new IndexedDbPilotSyncStore(
      c.database,
      () => 'unused',
      () => c.clock.now(),
      () => 0,
    );
    const crypto: Pick<SyncCryptoService, 'encryptPilotPayload'> = {
      encryptPilotPayload: async ({ metadata, plaintext }) => ({
        metadata,
        ciphertext: plaintext,
        nonce: 'test-nonce',
      }),
    };
    const transport: Pick<PilotSyncTransport, 'push'> = {
      push: vi.fn(async () => {
        if (!online) throw new Error('offline');
        return { sequence: ++sequence, isCurrentWinner: true };
      }),
    };
    const coordinator = new PilotSyncCoordinator({
      transferGate: gate,
      isOnline: () => online,
      bootstrap: { run: async () => {} },
      push: new PilotPushEngine(
        store,
        crypto as SyncCryptoService,
        transport as PilotSyncTransport,
      ),
      pull: { run: async () => ({ quarantined: 0 }) },
      metrics: store,
      now: () => c.clock.now(),
    });
    try {
      expect((await c.command.execute(c.input)).ok).toBe(true);
      const before = await c.records();
      const pending = before[3]!.length;
      expect((await coordinator.runAndReport()).pending).toBe(pending);
      expect(transport.push).not.toHaveBeenCalled();
      authorized = true;
      await coordinator.run();
      expect(coordinator.status().state).toBe('offline');
      expect((await store.counts()).pending).toBe(pending);
      online = true;
      c.clock.setTime(new Date('2026-10-01T12:00:00+09:00'));
      await gate.pauseAndDrain();
      const calls = vi.mocked(transport.push).mock.calls.length;
      await coordinator.run();
      expect(transport.push).toHaveBeenCalledTimes(calls);
      gate.resume();
      expect((await coordinator.runAndReport()).pending).toBe(0);
      await coordinator.run();
      expect(sequence).toBe(pending);
      expect((await c.records()).slice(0, 3)).toEqual(before.slice(0, 3));
    } finally {
      await coordinator.close();
      c.app.close();
    }
  });
  it('reconciles concurrent completion and retains one journal fact, contribution and outbox set across midnight', async () => {
    const c = await setup();
    try {
      const find = c.repository.findById.bind(c.repository);
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reads = 0;
      vi.spyOn(c.repository, 'findById').mockImplementation(async (id) => {
        const action = await find(id);
        if (++reads <= 2) {
          if (reads === 2) release();
          await barrier;
        }
        return action;
      });
      const results = await Promise.all([c.command.execute(c.input), c.command.execute(c.input)]);
      expect(results.every((r) => r.ok)).toBe(true);
      const before = await c.records();
      expect(before[1]!.filter((e) => e.type === 'actionCompleted')).toHaveLength(1);
      expect(before[2]!.filter((c) => c.source === 'completion')).toHaveLength(1);
      expect(before[2]!.find((c) => c.source === 'completion')?.amount).toBeNull();
      expect(before[3]!.length).toBeGreaterThan(0);
      c.clock.setTime(new Date('2026-10-01T00:05:00+09:00'));
      expect((await c.command.execute(c.input)).ok).toBe(true);
      expect(await c.records()).toEqual(before);
    } finally {
      c.app.close();
    }
  });
  it('rolls back action, journal, contribution and outbox when recording fails, then completes once', async () => {
    const c = await setup();
    try {
      const before = await c.records();
      const injected = vi
        .spyOn(c.recorder, 'recordUpsert')
        .mockRejectedValue(new Error('outbox unavailable'));
      expect((await c.command.execute(c.input)).ok).toBe(false);
      expect(await c.records()).toEqual(before);
      injected.mockRestore();
      expect((await c.command.execute(c.input)).ok).toBe(true);
      const after = await c.records();
      expect(after[1]!.filter((e) => e.type === 'actionCompleted')).toHaveLength(1);
      expect(after[2]!.filter((c) => c.source === 'completion')).toHaveLength(1);
    } finally {
      c.app.close();
    }
  });
  it('keeps a committed completion and its queue if the wake notification throws', async () => {
    const c = await setup();
    try {
      c.recorder.setNotify(() => {
        throw new Error('wake failed');
      });
      expect(() => c.recorder.notifyCommitted(false)).not.toThrow();
      expect(() => c.recorder.notifyCommitted(true)).not.toThrow();
      expect((await c.command.execute(c.input)).ok).toBe(true);
      const records = await c.records();
      expect(records[1]!.filter((e) => e.type === 'actionCompleted')).toHaveLength(1);
      expect(records[2]!.filter((c) => c.source === 'completion')).toHaveLength(1);
      expect(records[3]!.length).toBeGreaterThan(0);
    } finally {
      c.app.close();
    }
  });
});
