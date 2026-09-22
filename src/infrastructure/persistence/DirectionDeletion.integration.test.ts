import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { LIFE_OS_STORE, LIFE_OS_SYNC_STORE } from './indexed-db/LifeOsIndexedDb';
import type { DirectionIndicator } from '../../domain/balance/DirectionIndicator';
import type { SyncOutboxRecord, SyncSettingsRecord } from './records/SyncStoreRecords';
import { parsePilotSyncPayload } from '../../application/sync/pilot/PilotSyncProtocol';
import { DayDate, EntityId, JournalEntry } from '../../domain';
import { IndexedDbDirectionRepository } from './IndexedDbDirectionRepository';
import { IndexedDbGoalRepository } from './IndexedDbGoalRepository';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';

describe('Direction removal with retained history', () => {
  it('removes a Direction from active work while preserving a closed Goal', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'Здоровье' });
      if (!direction.ok) throw direction.error;
      const goal = await app.createGoal.execute({
        title: 'Закрытая цель',
        directionId: direction.value.id,
      });
      if (!goal.ok) throw goal.error;
      const closed = await app.archiveGoal.execute({
        id: goal.value.id,
        expectedVersion: goal.value.version,
      });
      if (!closed.ok) throw closed.error;
      const preview = await app.balance.removeDirectionSafely.inspect(direction.value.id);
      expect(preview.kind).toBe('archived');
      expect(preview.live).toEqual([]);
      expect(preview.historical).toMatchObject([
        { entityType: 'goal', objectId: goal.value.id.toString() },
      ]);
      const result = await app.balance.removeDirectionSafely.execute({
        id: direction.value.id,
        expectedVersion: direction.value.version,
      });
      expect(result.kind).toBe('archived');
      expect(
        await new IndexedDbDirectionRepository(database).findById(direction.value.id),
      ).toMatchObject({
        status: 'archived',
      });
      expect(await new IndexedDbGoalRepository(database).findById(goal.value.id)).toEqual(
        closed.value,
      );
      expect(
        await app.balance.removeDirectionSafely.execute({
          id: direction.value.id,
          expectedVersion: direction.value.version + 1,
        }),
      ).toMatchObject({ kind: 'archived' });
    } finally {
      database.close();
    }
  });
  it('blocks active Goals without deleting or archiving their Direction', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'Работа' });
      if (!direction.ok) throw direction.error;
      const goal = await app.createGoal.execute({
        title: 'Активная цель',
        status: 'active',
        directionId: direction.value.id,
      });
      if (!goal.ok) throw goal.error;
      const result = await app.balance.removeDirectionSafely.execute({
        id: direction.value.id,
        expectedVersion: direction.value.version,
      });
      expect(result).toMatchObject({
        kind: 'blocked',
        live: [{ entityType: 'goal', label: 'Активная цель' }],
      });
      expect(
        await new IndexedDbDirectionRepository(database).findById(direction.value.id),
      ).toMatchObject({
        status: 'active',
      });
      expect(await new IndexedDbGoalRepository(database).findById(goal.value.id)).toEqual(
        goal.value,
      );
    } finally {
      database.close();
    }
  });
  it('rechecks dependencies and version after the confirmation preview', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'Меняющееся' });
      if (!direction.ok) throw direction.error;
      expect((await app.balance.removeDirectionSafely.inspect(direction.value.id)).kind).toBe(
        'deleted',
      );
      const goal = await app.createGoal.execute({
        title: 'Новая связь',
        directionId: direction.value.id,
      });
      if (!goal.ok) throw goal.error;
      expect(
        await app.balance.removeDirectionSafely.execute({
          id: direction.value.id,
          expectedVersion: direction.value.version,
        }),
      ).toMatchObject({ kind: 'blocked', live: [{ label: 'Новая связь' }] });
      const archived = await app.balance.archiveDirection.execute({
        id: direction.value.id,
        expectedVersion: direction.value.version,
      });
      if (!archived.ok) throw archived.error;
      expect(
        await app.balance.removeDirectionSafely.execute({
          id: direction.value.id,
          expectedVersion: direction.value.version,
        }),
      ).toMatchObject({ kind: 'version_conflict' });
    } finally {
      database.close();
    }
  });
  it('uses a tombstone only when no required records point to the Direction', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'Временное' });
      if (!direction.ok) throw direction.error;
      const preview = await app.balance.removeDirectionSafely.inspect(direction.value.id);
      expect(preview).toMatchObject({ kind: 'deleted', live: [], historical: [] });
      const result = await app.balance.removeDirectionSafely.execute({
        id: direction.value.id,
        expectedVersion: direction.value.version,
      });
      expect(result.kind).toBe('deleted');
      expect(
        await new IndexedDbDirectionRepository(database).findById(direction.value.id),
      ).toBeNull();
      expect(
        await app.balance.removeDirectionSafely.execute({
          id: direction.value.id,
          expectedVersion: direction.value.version,
        }),
      ).toMatchObject({ kind: 'not_found' });
    } finally {
      database.close();
    }
  });
  it('treats a removed indicator as history and keeps its record', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'Сон' });
      if (!direction.ok) throw direction.error;
      const id = direction.value.id.toString();
      const stored = await database.open();
      const indicator: DirectionIndicator = {
        id: `indicator:${encodeURIComponent(id)}:0`,
        directionId: id,
        name: 'Исторический показатель',
        type: 'rating',
        value: 3,
        target: null,
        importance: 'normal',
        sourceType: 'manual',
        sourceGoalId: null,
        removed: true,
        version: 2,
        schemaVersion: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      };
      const seed = stored.transaction(LIFE_OS_STORE.directionIndicators, 'readwrite');
      seed.objectStore(LIFE_OS_STORE.directionIndicators).put(indicator);
      await done(seed);
      const result = await app.balance.removeDirectionSafely.execute({
        id: direction.value.id,
        expectedVersion: direction.value.version,
      });
      expect(result).toMatchObject({
        kind: 'archived',
        historical: [{ entityType: 'direction_indicator', objectId: indicator.id }],
      });
      const read = stored.transaction(LIFE_OS_STORE.directionIndicators, 'readonly');
      expect(
        await request(read.objectStore(LIFE_OS_STORE.directionIndicators).get(indicator.id)),
      ).toEqual(indicator);
      await done(read);
    } finally {
      database.close();
    }
  });
  it('keeps a Direction with Journal history in the archive', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'С историей журнала' });
      if (!direction.ok) throw direction.error;
      const now = new Date('2026-09-13T10:00:00.000Z');
      const entry = JournalEntry.create({
        id: EntityId.create('direction-journal'),
        type: 'directionStrategicReviewed',
        subjectType: 'Direction',
        subjectId: direction.value.id,
        labelAtEvent: direction.value.name,
        occurredAt: now,
        createdAt: now,
        effectiveDate: DayDate.create('2026-09-13'),
      });
      const stored = await database.open();
      await writeRecord(stored, LIFE_OS_STORE.journal, JournalEntryRecordMapper.toRecord(entry));
      const result = await app.balance.removeDirectionSafely.execute({
        id: direction.value.id,
        expectedVersion: direction.value.version,
      });
      expect(result).toMatchObject({
        kind: 'archived',
        historical: [{ entityType: 'journal_entry', objectId: entry.id.toString() }],
      });
      expect(
        await new IndexedDbDirectionRepository(database).findById(direction.value.id),
      ).toMatchObject({
        status: 'archived',
      });
      const read = stored.transaction(LIFE_OS_STORE.journal, 'readonly');
      expect(
        await request(read.objectStore(LIFE_OS_STORE.journal).get(entry.id.toString())),
      ).toEqual(JournalEntryRecordMapper.toRecord(entry));
      await done(read);
    } finally {
      database.close();
    }
  });
  it('records an archived upsert and an unlinked tombstone through the existing sync serializer', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const historical = await app.balance.createDirection.execute({ name: 'С историей' });
      const unlinked = await app.balance.createDirection.execute({ name: 'Без связей' });
      if (!historical.ok) throw historical.error;
      if (!unlinked.ok) throw unlinked.error;
      const goal = await app.createGoal.execute({
        title: 'Старая цель',
        directionId: historical.value.id,
      });
      if (!goal.ok) throw goal.error;
      const closed = await app.archiveGoal.execute({
        id: goal.value.id,
        expectedVersion: goal.value.version,
      });
      if (!closed.ok) throw closed.error;
      const stored = await database.open();
      const setup = stored.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
      setup.objectStore(LIFE_OS_SYNC_STORE.settings).put(syncSettings());
      await done(setup);
      expect(
        await app.balance.removeDirectionSafely.execute({
          id: historical.value.id,
          expectedVersion: historical.value.version,
        }),
      ).toMatchObject({ kind: 'archived' });
      expect(
        await app.balance.removeDirectionSafely.execute({
          id: unlinked.value.id,
          expectedVersion: unlinked.value.version,
        }),
      ).toMatchObject({ kind: 'deleted' });
      const read = stored.transaction(LIFE_OS_SYNC_STORE.outbox, 'readonly');
      const entries = await request<SyncOutboxRecord[]>(
        read.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
      );
      await done(read);
      const directionEvents = entries.filter((entry) => entry.entityType === 'direction');
      expect(directionEvents).toHaveLength(2);
      const payloads = directionEvents.map((entry) =>
        parsePilotSyncPayload(entry.serializedPayload),
      );
      expect(payloads).toContainEqual(
        expect.objectContaining({
          operation: 'upsert',
          objectId: historical.value.id.toString(),
          record: expect.objectContaining({ status: 'archived' }),
        }),
      );
      expect(payloads).toContainEqual(
        expect.objectContaining({
          operation: 'tombstone',
          objectId: unlinked.value.id.toString(),
          record: null,
        }),
      );
      expect(await new IndexedDbGoalRepository(database).findById(goal.value.id)).toEqual(
        closed.value,
      );
    } finally {
      database.close();
    }
  });
});

function syncSettings(): SyncSettingsRecord {
  return {
    id: 'sync',
    enabled: false,
    deviceId: 'device',
    deviceName: 'Device',
    platform: 'windows',
    publicKey: 'public',
    createdAt: '',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 3,
    recoveryConfirmedAt: '',
    snapshotId: null,
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '',
  };
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

function writeRecord(database: IDBDatabase, store: string, record: object): Promise<void> {
  const transaction = database.transaction(store, 'readwrite');
  transaction.objectStore(store).put(record);
  return done(transaction);
}
