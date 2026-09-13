import { describe, expect, it, vi } from 'vitest';
import type { SyncCryptoService } from '../ports/SyncCryptoService';
import type { PilotOutboxItem } from '../ports/PilotSyncStore';
import { DomainError } from '../../../shared/errors/DomainError';
import { PilotPushEngine } from './PilotPushEngine';
import { parsePilotSyncPayload, serializePilotSyncPayload } from './PilotSyncProtocol';

describe('PilotPushEngine', () => {
  it('persists ciphertext before push and retries the same event without rolling back local data', async () => {
    const record = {
      eventId: 'event-1',
      transportObjectId: 'transport-1',
      operation: 'upsert' as const,
      keyEpoch: 3,
      baseRevision: 0,
      proposedRevision: 1,
      hlcWallTime: 1,
      hlcLogical: 0,
      serializedPayload: serializedPayload(),
      encryptedPayload: null,
      encryptedNonce: null,
    };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        currentKeyEpoch: 3,
        deviceId: 'device',
      })),
      prepareOutboxForInstallation: vi.fn(async () => undefined),
      lease: vi.fn(async () => [record]),
      saveEncrypted: vi.fn(async () => record),
      acknowledgePush: vi.fn(async () => undefined),
      retry: vi.fn(async () => undefined),
      quarantineOutbox: vi.fn(async () => undefined),
    };
    const envelope = { metadata: expect.any(Object), ciphertext: 'cipher', nonce: 'nonce' };
    const crypto = {
      encryptPilotPayload: vi.fn(async ({ metadata }) => ({ ...envelope, metadata })),
    } as unknown as SyncCryptoService;
    const transport = {
      push: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const result = await new PilotPushEngine(store as never, crypto, transport as never).run();
    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(store.saveEncrypted).toHaveBeenCalledBefore(store.retry);
    expect(store.acknowledgePush).not.toHaveBeenCalled();
    expect(store.quarantineOutbox).not.toHaveBeenCalled();
  });

  it('quarantines a permanently rejected event without deleting the local record', async () => {
    const record = {
      eventId: 'event-1',
      transportObjectId: 'transport-1',
      operation: 'upsert' as const,
      keyEpoch: 3,
      baseRevision: 0,
      proposedRevision: 1,
      hlcWallTime: 1,
      hlcLogical: 0,
      serializedPayload: serializedPayload(),
      encryptedPayload: 'cipher',
      encryptedNonce: 'nonce',
    };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        currentKeyEpoch: 3,
        deviceId: 'device',
      })),
      prepareOutboxForInstallation: vi.fn(async () => undefined),
      lease: vi.fn(async () => [record]),
      saveEncrypted: vi.fn(),
      acknowledgePush: vi.fn(),
      retry: vi.fn(),
      quarantineOutbox: vi.fn(async () => undefined),
    };
    const transport = {
      push: vi.fn(async () => {
        throw new DomainError('sync.pilot_transport_denied', 'denied');
      }),
    };
    const result = await new PilotPushEngine(
      store as never,
      {} as SyncCryptoService,
      transport as never,
    ).run();
    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(store.quarantineOutbox).toHaveBeenCalledWith('event-1', 'sync.pilot_transport_denied');
    expect(store.retry).not.toHaveBeenCalled();
  });

  it('replays an immutable old envelope, then rematerializes a rejected old-epoch event once', async () => {
    const semanticRecord = { id: 'goal-1', title: 'Preserved user content' };
    const oldPayload = serializePilotSyncPayload({
      protocolVersion: 1,
      schemaVersion: 1,
      entityType: 'goal',
      operation: 'upsert',
      objectId: 'goal-1',
      eventId: 'event-1',
      originDeviceId: 'old-device',
      keyEpoch: 1,
      baseRevision: 4,
      revision: 5,
      hlc: { wallTime: 10, logical: 2 },
      record: semanticRecord,
    });
    let currentRecord: PilotOutboxItem = {
      eventId: 'event-1',
      transportObjectId: 'transport-1',
      operation: 'upsert' as const,
      keyEpoch: 1,
      baseRevision: 4,
      proposedRevision: 5,
      hlcWallTime: 10,
      hlcLogical: 2,
      serializedPayload: oldPayload,
      encryptedPayload: 'old-cipher',
      encryptedNonce: 'old-nonce',
    };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        currentKeyEpoch: 2,
        deviceId: 'new-device',
      })),
      prepareOutboxForInstallation: vi.fn(async () => {
        return undefined;
      }),
      rematerializeOutboxEvent: vi.fn(async () => {
        currentRecord = {
          ...currentRecord,
          keyEpoch: 2,
          serializedPayload: serializePilotSyncPayload({
            ...parsePilotSyncPayload(currentRecord.serializedPayload),
            originDeviceId: 'new-device',
            keyEpoch: 2,
          }),
          encryptedPayload: null,
          encryptedNonce: null,
        };
        return currentRecord;
      }),
      lease: vi.fn(async () => [currentRecord]),
      saveEncrypted: vi.fn(async () => currentRecord),
      acknowledgePush: vi.fn(async () => undefined),
      retry: vi.fn(async () => undefined),
      quarantineOutbox: vi.fn(async () => undefined),
    };
    const encryptPilotPayload = vi.fn(
      async ({ metadata }: Parameters<SyncCryptoService['encryptPilotPayload']>[0]) => ({
        metadata,
        ciphertext: 'new-cipher',
        nonce: 'new-nonce',
      }),
    );
    const crypto = { encryptPilotPayload } as unknown as SyncCryptoService;
    const transport = {
      push: vi
        .fn()
        .mockRejectedValueOnce(
          new DomainError('sync.pilot_event_rejected', 'old epoch is not current'),
        )
        .mockResolvedValueOnce({ sequence: 9, isCurrentWinner: true }),
    };

    await expect(
      new PilotPushEngine(store as never, crypto, transport as never).run(),
    ).resolves.toEqual({ sent: 1, failed: 0 });

    expect(store.prepareOutboxForInstallation).toHaveBeenCalledWith({
      deviceId: 'new-device',
      keyEpoch: 2,
    });
    expect(transport.push).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metadata: expect.objectContaining({ originDeviceId: 'old-device', keyEpoch: 1 }),
        ciphertext: 'old-cipher',
        nonce: 'old-nonce',
      }),
    );
    expect(store.rematerializeOutboxEvent).toHaveBeenCalledWith('event-1', {
      deviceId: 'new-device',
      keyEpoch: 2,
    });
    expect(encryptPilotPayload).toHaveBeenCalledOnce();
    const encryptedInput = encryptPilotPayload.mock.calls[0]?.[0];
    expect(encryptedInput?.metadata).toMatchObject({
      eventId: 'event-1',
      originDeviceId: 'new-device',
      keyEpoch: 2,
    });
    expect(parsePilotSyncPayload(encryptedInput?.plaintext ?? '')).toMatchObject({
      eventId: 'event-1',
      originDeviceId: 'new-device',
      keyEpoch: 2,
      baseRevision: 4,
      revision: 5,
      record: semanticRecord,
    });
    expect(store.quarantineOutbox).not.toHaveBeenCalled();
    expect(store.acknowledgePush).toHaveBeenCalledWith('event-1', 9, true);
  });

  it('rematerializes a rejected old-identity envelope even when its key epoch is current', async () => {
    let currentRecord: PilotOutboxItem = {
      eventId: 'event-1',
      transportObjectId: 'transport-1',
      operation: 'upsert',
      keyEpoch: 3,
      baseRevision: 0,
      proposedRevision: 1,
      hlcWallTime: 1,
      hlcLogical: 0,
      serializedPayload: serializePilotSyncPayload({
        ...parsePilotSyncPayload(serializedPayload()),
        originDeviceId: 'old-device',
      }),
      encryptedPayload: 'old-cipher',
      encryptedNonce: 'old-nonce',
    };
    const store = {
      installation: vi.fn(async () => ({
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        currentKeyEpoch: 3,
        deviceId: 'new-device',
      })),
      prepareOutboxForInstallation: vi.fn(async () => undefined),
      rematerializeOutboxEvent: vi.fn(async () => {
        currentRecord = {
          ...currentRecord,
          serializedPayload: serializePilotSyncPayload({
            ...parsePilotSyncPayload(currentRecord.serializedPayload),
            originDeviceId: 'new-device',
          }),
          encryptedPayload: null,
          encryptedNonce: null,
        };
        return currentRecord;
      }),
      lease: vi.fn(async () => [currentRecord]),
      saveEncrypted: vi.fn(async () => currentRecord),
      acknowledgePush: vi.fn(async () => undefined),
      retry: vi.fn(),
      quarantineOutbox: vi.fn(),
    };
    const crypto = {
      encryptPilotPayload: vi.fn(async ({ metadata }) => ({
        metadata,
        ciphertext: 'new-cipher',
        nonce: 'new-nonce',
      })),
    };
    const transport = {
      push: vi
        .fn()
        .mockRejectedValueOnce(new DomainError('sync.pilot_event_rejected', 'identity mismatch'))
        .mockResolvedValueOnce({ sequence: 10, isCurrentWinner: true }),
    };

    await expect(
      new PilotPushEngine(store as never, crypto as never, transport as never).run(),
    ).resolves.toEqual({ sent: 1, failed: 0 });
    expect(store.rematerializeOutboxEvent).toHaveBeenCalledOnce();
    expect(transport.push).toHaveBeenCalledTimes(2);
    expect(store.quarantineOutbox).not.toHaveBeenCalled();
  });
});

function serializedPayload(): string {
  return serializePilotSyncPayload({
    protocolVersion: 1,
    schemaVersion: 1,
    entityType: 'goal',
    operation: 'upsert',
    objectId: 'goal-1',
    eventId: 'event-1',
    originDeviceId: 'device',
    keyEpoch: 3,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: 1, logical: 0 },
    record: { id: 'goal-1' },
  });
}
