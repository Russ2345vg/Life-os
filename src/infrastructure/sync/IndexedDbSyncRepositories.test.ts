import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { CachedSyncDevice } from '../../application/sync/ports/SyncDeviceCacheRepository';
import type { SyncInstallation } from '../../application/sync/ports/SyncInstallationRepository';
import { LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbSyncDeviceCacheRepository } from './IndexedDbSyncDeviceCacheRepository';
import { IndexedDbSyncInstallationRepository } from './IndexedDbSyncInstallationRepository';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const SPACE_ID = '20000000-0000-4000-8000-000000000001';

describe('SYNC-02 IndexedDB repositories', () => {
  it('persists one stable non-secret installation identity across repository recreation', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const installation: SyncInstallation = {
      deviceId: DEVICE_ID,
      deviceName: 'Windows PC',
      platform: 'windows',
      publicKey: 'public-key-base64',
      createdAt: '2026-09-04T00:00:00.000Z',
      spaceId: null,
      membershipStatus: null,
      currentKeyEpoch: null,
      recoveryConfirmedAt: null,
      snapshotId: null,
      setupState: 'not_configured',
      pendingRevokedDeviceId: null,
      updatedAt: '2026-09-04T00:00:00.000Z',
    };

    await new IndexedDbSyncInstallationRepository(database).save(installation);

    expect(await new IndexedDbSyncInstallationRepository(database).find()).toEqual(installation);
    database.close();
  });

  it('replaces only one space device cache and keeps membership metadata non-secret', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSyncDeviceCacheRepository(database);
    const device: CachedSyncDevice = {
      deviceId: DEVICE_ID,
      spaceId: SPACE_ID,
      encryptedName: 'ciphertext',
      encryptedNameNonce: 'nonce',
      encryptedNameKeyEpoch: 1,
      displayName: 'Windows PC',
      platform: 'windows',
      publicKey: 'public-key-base64',
      status: 'active',
      createdAt: '2026-09-04T00:00:00.000Z',
      activatedAt: '2026-09-04T00:00:01.000Z',
      lastSeenAt: null,
      revokedAt: null,
      updatedAt: '2026-09-04T00:00:01.000Z',
    };

    await repository.replaceForSpace(SPACE_ID, [device]);
    expect(await repository.list(SPACE_ID)).toEqual([device]);
    await repository.replaceForSpace(SPACE_ID, []);
    expect(await repository.list(SPACE_ID)).toEqual([]);
    database.close();
  });

  it('rejects corrupt installation metadata instead of inventing another identity', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSyncInstallationRepository(database);
    await expect(
      repository.save({
        deviceId: 'not-a-uuid',
        deviceName: 'Device',
        platform: 'android',
        publicKey: 'public',
        createdAt: '2026-09-04T00:00:00.000Z',
        spaceId: null,
        membershipStatus: null,
        currentKeyEpoch: null,
        recoveryConfirmedAt: null,
        snapshotId: null,
        setupState: 'not_configured',
        pendingRevokedDeviceId: null,
        updatedAt: '2026-09-04T00:00:00.000Z',
      }),
    ).rejects.toThrow('Invalid non-secret Sync installation metadata.');
    database.close();
  });
});
