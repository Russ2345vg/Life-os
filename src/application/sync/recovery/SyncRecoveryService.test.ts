import { describe, expect, it } from 'vitest';
import { SyncRecoveryService } from './SyncRecoveryService';
import type { RecoveryDataStore, RecoverySnapshot, RecoveryState } from './SyncRecovery';
import type { SyncBinaryCrypto, EncryptedBlobTransport } from '../attachments/AttachmentContracts';

describe('safe encrypted recovery snapshots', () => {
  it('verifies manual snapshots, previews and requires verified pre-restore before apply', async () => {
    let state: RecoveryState = { schemaVersion: 1, items: [] };
    const snapshots: RecoverySnapshot[] = [];
    let applied = 0;
    let cryptoFail = false;
    const store: RecoveryDataStore = {
      context: async () => ({ spaceId: 'space', keyEpoch: 1 }),
      readState: async () => state,
      validate: (value: unknown): asserts value is RecoveryState => {
        if (!value) throw new Error('Invalid recovery state.');
      },
      apply: async (next) => {
        state = next;
        applied++;
      },
      history: async () => [],
      inspect: async () => {
        throw new Error();
      },
      snapshots: async () => snapshots,
      saveSnapshot: async (snapshot) => {
        const i = snapshots.findIndex((s) => s.snapshotId === snapshot.snapshotId);
        if (i < 0) snapshots.push(snapshot);
        else snapshots[i] = snapshot;
      },
      attachments: async () => [],
    };
    const crypto: SyncBinaryCrypto = {
      encryptBinary: async (metadata, plaintext) => {
        if (cryptoFail) throw new Error('secure store unavailable');
        return { metadata, ciphertext: btoa(plaintext), nonce: 'test' };
      },
      decryptBinary: async (e) => atob(e.ciphertext),
    };
    let remote = '';
    const transport: EncryptedBlobTransport = {
      upload: async (_b, _p, bytes) => {
        remote = bytes;
      },
      download: async () => remote,
      listSnapshots: async () => [],
    };
    const service = new SyncRecoveryService(
      store,
      crypto,
      transport,
      { retry: async () => {} },
      () => new Date('2026-09-07T00:00:00Z'),
    );
    const snapshot = await service.createSnapshot();
    expect(snapshot.verifiedAt).not.toBeNull();
    expect(snapshot.cloudVerifiedAt).toBeNull();
    const preview = await service.preview(snapshot.snapshotId);
    expect(preview.added).toBe(0);
    await store.saveSnapshot({ ...snapshot, encryptedBlob: snapshot.encryptedBlob + 'corruption' });
    await expect(service.preview(snapshot.snapshotId)).rejects.toThrow('verification');
    await store.saveSnapshot({ ...snapshot, metadata: { ...snapshot.metadata, schemaVersion: 2 } });
    await expect(service.preview(snapshot.snapshotId)).rejects.toThrow('verification');
    await store.saveSnapshot(snapshot);
    cryptoFail = true;
    await expect(service.restore(preview)).rejects.toThrow();
    expect(applied).toBe(0);
    cryptoFail = false;
    await service.restore(preview);
    expect(applied).toBe(1);
    expect(snapshots.some((s) => s.kind === 'pre-restore' && s.verifiedAt !== null)).toBe(true);
    await service.runMaintenance();
    await service.runMaintenance();
    expect(snapshots.filter((s) => s.kind === 'daily')).toHaveLength(1);
    expect(snapshots.filter((s) => s.kind === 'weekly')).toHaveLength(1);
  });
});
