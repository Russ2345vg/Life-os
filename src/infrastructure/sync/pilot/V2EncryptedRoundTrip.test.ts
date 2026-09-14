import { describe, expect, it, vi } from 'vitest';
import { structuredSyncFixtures } from './StructuredSyncFixtures';
import { normalizePilotRecord, prepareRemotePilotRecord } from './PilotSyncRegistryAdapters';
import {
  serializePilotSyncPayload,
  parsePilotSyncPayload,
} from '../../../application/sync/pilot/PilotSyncProtocol';
import { SYNC_ENTITY_TYPES } from '../../../application/sync/SyncRegistry';

describe('V2 serialized records and native encrypted round-trip', () => {
  it('preserves actual records through mapper/wire/replay, including quantitative measurement', async () => {
    const { readFileSync, writeFileSync } = await vi.importActual<{
      readFileSync(path: string, encoding: 'utf8'): string;
      writeFileSync(path: string, data: string, encoding: 'utf8'): void;
    }>('node:fs');
    const { join } = await vi.importActual<{ join(...paths: string[]): string }>('node:path');
    const { env } = await vi.importActual<{ env: Record<string, string | undefined> }>(
      'node:process',
    );
    const fixtures = structuredSyncFixtures();
    const payloads = SYNC_ENTITY_TYPES.map((entityType) => {
      const record = normalizePilotRecord(entityType, {
        ...fixtures[entityType],
        ...(entityType === 'sphere'
          ? { importance: 'critical', manualScore: 0, desiredLevel: 8, includeInBalanceWheel: true }
          : {}),
        ...(entityType === 'direction'
          ? {
              importance: 'high',
              manualScore: 7.5,
              currentStateText: 'Текущее',
              desiredState: 'Желаемое',
              mode: 'maintain',
              status: 'paused',
            }
          : {}),
        ...(entityType === 'goal'
          ? {
              measurement: {
                mode: 'recurring',
                target: 3,
                unit: 'раз',
                start: 0,
                direction: 'at_least',
                cycle: 'week',
              },
              dueDate: '2026-12-31',
            }
          : {}),
      });
      const payload = {
        protocolVersion: 1,
        schemaVersion: 1,
        entityType,
        operation: 'upsert',
        objectId: String(record.id),
        eventId: `event:${entityType}`,
        originDeviceId: 'device-a',
        keyEpoch: 1,
        baseRevision: 0,
        revision: 1,
        hlc: { wallTime: 100, logical: 0 },
        record,
      } as const;
      const serialized = serializePilotSyncPayload(payload);
      const decoded = parsePilotSyncPayload(serialized);
      expect(decoded).toEqual(payload);
      expect(
        normalizePilotRecord(entityType, prepareRemotePilotRecord(entityType, record)),
      ).toEqual(record);
      return serialized;
    });
    const directory = env.LIFEOS_NATIVE_ROUNDTRIP_DIR;
    if (directory) {
      if (env.LIFEOS_NATIVE_ROUNDTRIP_PHASE === 'prepare') {
        writeFileSync(join(directory, 'input.json'), JSON.stringify(payloads), 'utf8');
      } else {
        const decrypted: unknown = JSON.parse(readFileSync(join(directory, 'output.json'), 'utf8'));
        expect(decrypted).toEqual(payloads);
        for (const serialized of decrypted as string[]) {
          const payload = parsePilotSyncPayload(serialized);
          expect(
            normalizePilotRecord(
              payload.entityType,
              prepareRemotePilotRecord(payload.entityType, payload.record!),
            ),
          ).toEqual(payload.record);
        }
      }
    }
  });
});
