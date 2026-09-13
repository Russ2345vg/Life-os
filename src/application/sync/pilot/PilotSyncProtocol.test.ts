import { describe, expect, it } from 'vitest';
import {
  parsePilotSyncPayload,
  serializePilotSyncPayload,
  type PilotSyncPayload,
} from './PilotSyncProtocol';

const base: PilotSyncPayload = {
  protocolVersion: 1,
  schemaVersion: 1,
  entityType: 'goal',
  operation: 'upsert',
  objectId: 'legacy-goal-id',
  eventId: 'event-1',
  originDeviceId: 'device-1',
  keyEpoch: 3,
  baseRevision: 0,
  revision: 1,
  hlc: { wallTime: 100, logical: 0 },
  record: { title: 'Synthetic', id: 'legacy-goal-id', directionId: 'direction-1' },
};

describe('PilotSyncProtocol', () => {
  it('serializes canonically independent of record property order', () => {
    const first = serializePilotSyncPayload(base);
    const second = serializePilotSyncPayload({
      ...base,
      record: { directionId: 'direction-1', id: 'legacy-goal-id', title: 'Synthetic' },
    });
    expect(second).toBe(first);
    expect(parsePilotSyncPayload(first)).toEqual(base);
  });

  it('preserves legacy object IDs and real Goal to Direction relationship', () => {
    expect(parsePilotSyncPayload(serializePilotSyncPayload(base)).objectId).toBe('legacy-goal-id');
    expect(() =>
      serializePilotSyncPayload({ ...base, record: { id: base.objectId, projectId: 'invented' } }),
    ).toThrow(/Direction/u);
  });

  it('accepts every SYNC-04 structured type without changing the encrypted envelope', () => {
    for (const entityType of [
      'decision',
      'journal_entry',
      'morning_cycle',
      'user_settings',
    ] as const) {
      const objectId = `${entityType}-1`;
      expect(
        parsePilotSyncPayload(
          serializePilotSyncPayload({
            ...base,
            entityType,
            objectId,
            record: { id: objectId, schemaVersion: 1 },
          }),
        ).entityType,
      ).toBe(entityType);
    }
  });

  it('rejects attachments, invalid revisions, future schemas, and unsupported entity types', () => {
    expect(() =>
      serializePilotSyncPayload({
        ...base,
        record: { id: base.objectId, coverImage: { dataUrl: 'no' } },
      }),
    ).toThrow(/вложение/u);
    expect(() => serializePilotSyncPayload({ ...base, revision: 4 })).toThrow(/ревизий/u);
    expect(() => serializePilotSyncPayload({ ...base, schemaVersion: 2 as 1 })).toThrow(/верс/iu);
    expect(() =>
      parsePilotSyncPayload(JSON.stringify({ ...base, entityType: 'unknown_record' })),
    ).toThrow(/тип/iu);
  });
});
