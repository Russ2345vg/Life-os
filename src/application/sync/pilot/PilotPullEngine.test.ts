import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../../shared/errors/DomainError';
import type { PilotSyncPayload } from './PilotSyncProtocol';
import { serializePilotSyncPayload } from './PilotSyncProtocol';
import { PilotPullEngine } from './PilotPullEngine';

describe('PilotPullEngine', () => {
  it('decrypts, validates and applies once while advancing the caller-owned cursor', async () => {
    const payload: PilotSyncPayload = {
      protocolVersion: 1,
      schemaVersion: 1,
      entityType: 'direction',
      operation: 'upsert',
      objectId: 'direction-1',
      eventId: 'event-1',
      originDeviceId: 'device-b',
      keyEpoch: 3,
      baseRevision: 0,
      revision: 1,
      hlc: { wallTime: 10, logical: 0 },
      record: { schemaVersion: 1, id: 'direction-1' },
    };
    const metadata = {
      protocolVersion: 1 as const,
      purpose: 'pilot_event' as const,
      spaceId: 'space',
      eventId: 'event-1',
      objectId: 'opaque-1',
      originDeviceId: 'device-b',
      keyEpoch: 3,
      operation: 'upsert' as const,
      baseRevision: 0,
      revision: 1,
      hlcWallTime: 10,
      hlcLogical: 0,
    };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
      })),
      cursor: vi.fn(async () => 0),
      hasApplied: vi.fn(async () => false),
      localState: vi.fn(async () => ({ meta: null, record: null })),
      hasSameSemanticContent: vi.fn(async () => false),
      applyPulled: vi.fn(async () => undefined),
      advanceAppliedDuplicate: vi.fn(),
      deferRemoteEvent: vi.fn(),
      deferredRemoteEvents: vi.fn(async () => []),
      removeDeferredRemoteEvent: vi.fn(),
      quarantine: vi.fn(),
    };
    const transport = {
      pull: vi.fn(async () => [{ sequence: 5, metadata, ciphertext: 'cipher', nonce: 'nonce' }]),
      acknowledge: vi.fn(async () => undefined),
    };
    const crypto = { decryptPilotPayload: vi.fn(async () => serializePilotSyncPayload(payload)) };
    await expect(
      new PilotPullEngine(store as never, crypto as never, transport as never).run(),
    ).resolves.toEqual({ applied: 1, quarantined: 0 });
    expect(store.applyPulled).toHaveBeenCalledOnce();
    expect(transport.acknowledge).toHaveBeenCalledWith(5);
  });

  it('applies same-ID normalized bootstrap content as equivalent without creating a conflict', async () => {
    const localRecord = {
      schemaVersion: 1,
      id: 'direction-1',
      name: 'Health',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 1,
    };
    const payload: PilotSyncPayload = {
      protocolVersion: 1,
      schemaVersion: 1,
      entityType: 'direction',
      operation: 'upsert',
      objectId: 'direction-1',
      eventId: 'remote-bootstrap',
      originDeviceId: 'android',
      keyEpoch: 3,
      baseRevision: 0,
      revision: 1,
      hlc: { wallTime: 20, logical: 0 },
      record: {
        ...localRecord,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-03T00:00:00.000Z',
        version: 8,
      },
    };
    const metadata = {
      protocolVersion: 1 as const,
      purpose: 'pilot_event' as const,
      spaceId: 'space',
      eventId: payload.eventId,
      objectId: 'direction-1',
      originDeviceId: payload.originDeviceId,
      keyEpoch: payload.keyEpoch,
      operation: payload.operation,
      baseRevision: payload.baseRevision,
      revision: payload.revision,
      hlcWallTime: payload.hlc.wallTime,
      hlcLogical: payload.hlc.logical,
    };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
      })),
      cursor: vi.fn(async () => 0),
      hasApplied: vi.fn(async () => false),
      localState: vi.fn(async () => ({
        meta: {
          eventId: 'local-bootstrap',
          revision: 1,
          baseRevision: 0,
          modifiedByDevice: 'windows',
          deleted: false,
          hlcWallTime: 10,
          hlcLogical: 0,
        },
        record: localRecord,
      })),
      hasSameSemanticContent: vi.fn(async () => true),
      applyPulled: vi.fn(async () => undefined),
      advanceAppliedDuplicate: vi.fn(),
      deferRemoteEvent: vi.fn(),
      deferredRemoteEvents: vi.fn(async () => []),
      removeDeferredRemoteEvent: vi.fn(),
      quarantine: vi.fn(),
    };
    const transport = {
      pull: vi.fn(async () => [{ sequence: 10, metadata, ciphertext: 'cipher', nonce: 'nonce' }]),
      acknowledge: vi.fn(async () => undefined),
    };
    const crypto = { decryptPilotPayload: vi.fn(async () => serializePilotSyncPayload(payload)) };

    await expect(
      new PilotPullEngine(store as never, crypto as never, transport as never).run(),
    ).resolves.toEqual({ applied: 1, quarantined: 0 });
    expect(store.applyPulled).toHaveBeenCalledWith('space', 10, payload, 'direction-1', {
      kind: 'equivalent',
    });
    expect(store.quarantine).not.toHaveBeenCalled();
  });

  it('defers a child at sequence 10, applies its parent at 11, then retries the child', async () => {
    const child: PilotSyncPayload = {
      protocolVersion: 1,
      schemaVersion: 1,
      entityType: 'goal',
      operation: 'upsert',
      objectId: 'goal-1',
      eventId: 'child-event',
      originDeviceId: 'android',
      keyEpoch: 3,
      baseRevision: 0,
      revision: 1,
      hlc: { wallTime: 10, logical: 0 },
      record: { id: 'goal-1', directionId: 'direction-1' },
    };
    const parent: PilotSyncPayload = {
      ...child,
      entityType: 'direction',
      objectId: 'direction-1',
      eventId: 'parent-event',
      hlc: { wallTime: 11, logical: 0 },
      record: { id: 'direction-1' },
    };
    const remote = (sequence: number, payload: PilotSyncPayload) => ({
      sequence,
      metadata: {
        protocolVersion: 1 as const,
        purpose: 'pilot_event' as const,
        spaceId: 'space',
        eventId: payload.eventId,
        objectId: payload.objectId,
        originDeviceId: payload.originDeviceId,
        keyEpoch: payload.keyEpoch,
        operation: payload.operation,
        baseRevision: payload.baseRevision,
        revision: payload.revision,
        hlcWallTime: payload.hlc.wallTime,
        hlcLogical: payload.hlc.logical,
      },
      ciphertext: `${payload.eventId}-cipher`,
      nonce: `${payload.eventId}-nonce`,
    });
    const childRemote = remote(10, child);
    const parentRemote = remote(11, parent);
    const deferred: (typeof childRemote)[] = [];
    let parentApplied = false;
    const applyPulled = vi.fn(async (_spaceId, _sequence, payload: PilotSyncPayload) => {
      if (payload.eventId === 'child-event' && !parentApplied) {
        throw new DomainError('sync.pilot_dependency_missing', 'parent missing');
      }
      if (payload.eventId === 'parent-event') parentApplied = true;
    });
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
      })),
      cursor: vi.fn(async () => 9),
      hasApplied: vi.fn(async () => false),
      localState: vi.fn(async () => ({ meta: null, record: null })),
      hasSameSemanticContent: vi.fn(async () => false),
      applyPulled,
      advanceAppliedDuplicate: vi.fn(),
      deferRemoteEvent: vi.fn(async (_spaceId, event) => {
        deferred.push(event);
      }),
      deferredRemoteEvents: vi.fn(async () => [...deferred]),
      removeDeferredRemoteEvent: vi.fn(async (_spaceId, sequence) => {
        const index = deferred.findIndex((event) => event.sequence === sequence);
        if (index >= 0) deferred.splice(index, 1);
      }),
      quarantine: vi.fn(),
    };
    const transport = {
      pull: vi.fn(async () => [childRemote, parentRemote]),
      acknowledge: vi.fn(async () => undefined),
    };
    const crypto = {
      decryptPilotPayload: vi.fn(async (event) =>
        serializePilotSyncPayload(event.metadata.eventId === 'child-event' ? child : parent),
      ),
    };

    await expect(
      new PilotPullEngine(store as never, crypto as never, transport as never).run(),
    ).resolves.toEqual({ applied: 2, quarantined: 0 });
    expect(store.deferRemoteEvent).toHaveBeenCalledWith('space', childRemote);
    expect(applyPulled.mock.calls.map((call) => call[2].eventId)).toEqual([
      'child-event',
      'parent-event',
      'child-event',
    ]);
    expect(store.removeDeferredRemoteEvent).toHaveBeenCalledWith('space', 10);
    expect(store.quarantine).not.toHaveBeenCalled();
    expect(transport.acknowledge).toHaveBeenCalledWith(11);
  });

  it('quarantines an unknown future entity as requiring a client update before local apply', async () => {
    const metadata = {
      protocolVersion: 1 as const,
      purpose: 'pilot_event' as const,
      spaceId: 'space',
      eventId: 'future-event',
      objectId: 'future-object',
      originDeviceId: 'new-client',
      keyEpoch: 3,
      operation: 'upsert' as const,
      baseRevision: 0,
      revision: 1,
      hlcWallTime: 10,
      hlcLogical: 0,
    };
    const event = { sequence: 5, metadata, ciphertext: 'cipher', nonce: 'nonce' };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
      })),
      cursor: vi.fn(async () => 0),
      hasApplied: vi.fn(async () => false),
      localState: vi.fn(),
      hasSameSemanticContent: vi.fn(),
      applyPulled: vi.fn(),
      advanceAppliedDuplicate: vi.fn(),
      deferRemoteEvent: vi.fn(),
      deferredRemoteEvents: vi.fn(async () => []),
      removeDeferredRemoteEvent: vi.fn(),
      quarantine: vi.fn(),
    };
    const transport = {
      pull: vi.fn(async () => [event]),
      acknowledge: vi.fn(async () => undefined),
    };
    const plaintext = JSON.stringify({
      protocolVersion: 1,
      schemaVersion: 1,
      entityType: 'future_entry',
      operation: 'upsert',
      objectId: metadata.objectId,
      eventId: metadata.eventId,
      originDeviceId: metadata.originDeviceId,
      keyEpoch: metadata.keyEpoch,
      baseRevision: metadata.baseRevision,
      revision: metadata.revision,
      hlc: { wallTime: metadata.hlcWallTime, logical: metadata.hlcLogical },
      record: { id: metadata.objectId },
    });
    const crypto = { decryptPilotPayload: vi.fn(async () => plaintext) };

    await expect(
      new PilotPullEngine(store as never, crypto as never, transport as never).run(),
    ).resolves.toEqual({ applied: 0, quarantined: 1 });
    expect(store.quarantine).toHaveBeenCalledWith(5, 'sync.client_update_required', 'cipher');
    expect(store.localState).not.toHaveBeenCalled();
    expect(store.applyPulled).not.toHaveBeenCalled();
  });
});
