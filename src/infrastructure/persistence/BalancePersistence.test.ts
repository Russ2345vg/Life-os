import { describe, expect, it } from 'vitest';
import { Sphere, Direction, EntityId } from '../../domain';
import { SphereRecordMapper } from './mappers/SphereRecordMapper';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import {
  DirectionIndicatorRecordMapper,
  BalanceMonthlySnapshotRecordMapper,
} from './BalanceRecordMappers';
import { structuredSyncFixtures } from '../sync/pilot/StructuredSyncFixtures';
import {
  normalizePilotRecord,
  prepareRemotePilotRecord,
} from '../sync/pilot/PilotSyncRegistryAdapters';

const now = new Date('2026-09-14T00:00:00Z');
describe('balance persistence compatibility', () => {
  it('rejects new records with absent required score or importance fields', () => {
    const fixtures = structuredSyncFixtures();
    for (const field of ['value', 'importance']) {
      const record = { ...fixtures.direction_indicator };
      delete record[field];
      expect(() => DirectionIndicatorRecordMapper.fromRecord(record)).toThrow();
    }
    for (const field of ['automaticScore', 'manualScore', 'effectiveScore', 'desiredLevel']) {
      const record = { ...fixtures.balance_monthly_snapshot };
      delete record[field];
      expect(() => BalanceMonthlySnapshotRecordMapper.fromRecord(record)).toThrow();
    }
  });
  it('roundtrips Sphere state settings, and old wire omission cannot clear them', () => {
    const current = {
      ...SphereRecordMapper.toRecord(
        Sphere.create({
          id: EntityId.create('s'),
          name: 'Сфера',
          now,
          desiredLevel: 8,
          manualScore: 0,
          importance: 'critical',
          includeInBalanceWheel: true,
        }),
      ),
      futureField: 'keep',
    };
    expect(SphereRecordMapper.fromRecord(current).desiredLevel).toBe(8);
    const old = { ...current } as Record<string, unknown>;
    for (const field of ['desiredLevel', 'manualScore', 'importance', 'includeInBalanceWheel'])
      delete old[field];
    expect(SphereRecordMapper.fromRecord(old).manualScore).toBeNull();
    const remote = prepareRemotePilotRecord('sphere', normalizePilotRecord('sphere', old), current);
    expect(remote.desiredLevel).toBe(8);
    expect(remote.manualScore).toBe(0);
    expect(remote.futureField).toBe('keep');
    expect(
      prepareRemotePilotRecord(
        'sphere',
        { ...normalizePilotRecord('sphere', current), manualScore: null },
        current,
      ).manualScore,
    ).toBeNull();
  });
  it('roundtrips paused maintain with current/desired text and preserves fields from old payload', () => {
    const direction = Direction.create({
      id: EntityId.create('d'),
      name: 'Сон',
      now,
      mode: 'maintain',
      currentStateText: 'Устаю',
      desiredState: 'Высыпаюсь',
      manualScore: 7.5,
      importance: 'high',
    }).update({ name: 'Сон', status: 'paused' }, now);
    const record = DirectionRecordMapper.toRecord(direction);
    const restored = DirectionRecordMapper.fromRecord(record);
    expect(restored.mode).toBe('maintain');
    expect(restored.currentStateText).toBe('Устаю');
    expect(restored.status).toBe('paused');
    const old = { ...record } as Record<string, unknown>;
    for (const field of ['mode', 'manualScore', 'importance', 'currentStateText'])
      delete old[field];
    expect(
      prepareRemotePilotRecord(
        'direction',
        normalizePilotRecord('direction', old),
        record as unknown as Record<string, unknown>,
      ).mode,
    ).toBe('maintain');
  });
});
