import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { DayDate } from '../../../domain';
import { LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbBalanceRepository } from '../../persistence/IndexedDbBalanceRepository';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';
import { normalizePilotRecord } from './PilotSyncRegistryAdapters';
import { structuredSyncFixtures } from './StructuredSyncFixtures';
import type { PilotSyncPayload } from '../../../application/sync/pilot';
const fixtures = structuredSyncFixtures();
const now = new Date('2026-09-14T12:00:00Z');
describe('balance synchronized history and indicator identity', () => {
  it('reconciles current snapshots with visible sources, preserves closed incoming history, and replays without duplicates or echo', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbBalanceRepository(
        db,
        { now: () => now },
        { getCurrentDate: () => DayDate.create('2026-09-14') },
      ),
      sync = new IndexedDbPilotSyncStore(db);
    let sequence = 0;
    const apply = async (
      entityType: PilotSyncPayload['entityType'],
      record: Readonly<Record<string, unknown>>,
      eventId = `event${++sequence}`,
    ) =>
      sync.applyPulled(
        'space',
        sequence,
        {
          protocolVersion: 1,
          schemaVersion: 1,
          entityType,
          operation: 'upsert',
          objectId: String(record.id),
          eventId,
          originDeviceId: 'android',
          keyEpoch: 1,
          baseRevision: 0,
          revision: 1,
          hlc: { wallTime: sequence, logical: 0 },
          record: normalizePilotRecord(entityType, record),
        },
        `transport:${record.id}`,
        { kind: 'fast_forward', winner: 'incoming' },
      );
    try {
      await apply('sphere', fixtures.sphere);
      await apply('direction', { ...fixtures.direction, manualScore: 8 });
      const snapshot = {
        ...fixtures.balance_monthly_snapshot,
        id: String(fixtures.balance_monthly_snapshot.id),
        automaticScore: 4,
        effectiveScore: 4,
      };
      await apply('balance_monthly_snapshot', snapshot);
      expect((await repo.read()).snapshots.find((s) => s.id === snapshot.id)?.effectiveScore).toBe(
        8,
      );
      const future = {
        ...snapshot,
        id: 'monthly:direction:sync04-direction:2026-09',
        entityType: 'direction',
        entityId: 'sync04-direction',
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };
      await apply('balance_monthly_snapshot', future);
      expect((await repo.read()).snapshots.find((s) => s.id === future.id)).toMatchObject({
        effectiveScore: 8,
        updatedAt: '2026-09-15T00:00:00.000Z',
      });
      const closed = { ...snapshot, id: 'monthly:sphere:sync04-sphere:2026-08', month: '2026-08' };
      await apply('balance_monthly_snapshot', closed);
      expect((await repo.read()).snapshots.find((s) => s.id === closed.id)?.effectiveScore).toBe(4);
      for (let slot = 0; slot < 5; slot++)
        await apply('direction_indicator', {
          ...fixtures.direction_indicator,
          id: `indicator:sync04-direction:${slot}`,
          name: `Показатель ${slot}`,
        });
      await apply('direction_indicator', fixtures.direction_indicator, 'replay');
      db.close();
      expect((await repo.read()).indicators).toHaveLength(5);
      expect(
        (await repo.read()).snapshots.filter(
          (s) => s.entityType === 'sphere' && s.month === '2026-09',
        ),
      ).toHaveLength(1);
      expect((await sync.counts()).pending).toBe(0);
    } finally {
      db.close();
    }
  });
});
