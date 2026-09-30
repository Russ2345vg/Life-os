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
      accountSetupState: 'local_anonymous',
      accountUserId: null,
      accountSessionId: null,
      accountEmail: null,
      accountMigrationSnapshotId: null,
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
        accountSetupState: 'local_anonymous',
        accountUserId: null,
        accountSessionId: null,
        accountEmail: null,
        accountMigrationSnapshotId: null,
      }),
    ).rejects.toThrow('Invalid non-secret Sync installation metadata.');
    database.close();
  });

  it('normalizes a legacy record without rewriting account metadata on read', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const db = await database.open();
    const legacy = installationRecord();
    const write = db.transaction('sync_settings', 'readwrite');
    write.objectStore('sync_settings').put(legacy);
    await transactionComplete(write);

    await expect(new IndexedDbSyncInstallationRepository(database).find()).resolves.toMatchObject({
      accountSetupState: 'local_anonymous',
      accountUserId: null,
      accountSessionId: null,
      accountEmail: null,
      accountMigrationSnapshotId: null,
    });

    const read = db.transaction('sync_settings', 'readonly');
    const stored = await request<Record<string, unknown> | undefined>(
      read.objectStore('sync_settings').get('sync'),
    );
    expect(stored).not.toHaveProperty('accountSetupState');
    expect(stored).not.toHaveProperty('accountUserId');
    database.close();
  });

  it.each([
    {
      accountSetupState: 'local_anonymous' as const,
      accountUserId: null,
      accountSessionId: null,
      accountEmail: null,
      accountMigrationSnapshotId: null,
    },
    accountMetadata('email_verification_pending'),
    accountMetadata('account_migration_pending', SNAPSHOT_ID),
    accountMetadata('recovery_confirmation_pending'),
    accountMetadata('sign_in_required'),
    {
      ...accountMetadata('device_recovery_required'),
      accountRecoveryDeviceId: '10000000-0000-4000-8000-000000000002',
    },
    accountMetadata('ready'),
    accountMetadata('sign_out_pending', SNAPSHOT_ID),
  ])('survives restart in account state $accountSetupState', async (account) => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const installation: SyncInstallation = { ...baseInstallation(), ...account };
    await new IndexedDbSyncInstallationRepository(database).save(installation);
    database.close();

    const restored = await new IndexedDbSyncInstallationRepository(database).find();

    expect(restored).toEqual(installation);
    if (account.accountSetupState === 'account_migration_pending') {
      expect(restored).toMatchObject({
        spaceId: SPACE_ID,
        accountMigrationSnapshotId: SNAPSHOT_ID,
      });
    }
    database.close();
  });

  it.each([
    { accountUserId: 'not-a-uuid' },
    { accountEmail: 'invalid-email' },
    { accountSetupState: 'ready' as const, accountEmail: null },
    { accountSetupState: 'sign_out_pending' as const, accountMigrationSnapshotId: null },
    { accountSetupState: 'local_anonymous' as const, accountUserId: ACCOUNT_USER_ID },
  ])('rejects impossible account metadata %#', async (invalid) => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSyncInstallationRepository(database);
    await expect(
      repository.save({
        ...baseInstallation(),
        ...accountMetadata('ready'),
        ...invalid,
      }),
    ).rejects.toThrow('Invalid non-secret Sync installation metadata.');
    database.close();
  });
});

const ACCOUNT_USER_ID = '30000000-0000-4000-8000-000000000001';
const ACCOUNT_SESSION_ID = '40000000-0000-4000-8000-000000000001';
const SNAPSHOT_ID = '50000000-0000-4000-8000-000000000001';

function baseInstallation(): SyncInstallation {
  return {
    deviceId: DEVICE_ID,
    deviceName: 'Windows PC',
    platform: 'windows',
    publicKey: 'public-key-base64',
    createdAt: '2026-09-04T00:00:00.000Z',
    spaceId: SPACE_ID,
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: '2026-09-04T00:00:00.000Z',
    snapshotId: null,
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '2026-09-04T00:00:00.000Z',
    ...localAccountMetadata(),
  };
}

function localAccountMetadata(): Pick<
  SyncInstallation,
  | 'accountSetupState'
  | 'accountUserId'
  | 'accountSessionId'
  | 'accountEmail'
  | 'accountMigrationSnapshotId'
> {
  return {
    accountSetupState: 'local_anonymous',
    accountUserId: null,
    accountSessionId: null,
    accountEmail: null,
    accountMigrationSnapshotId: null,
  };
}

function accountMetadata(
  accountSetupState: Exclude<SyncInstallation['accountSetupState'], 'local_anonymous'>,
  accountMigrationSnapshotId: string | null = null,
): Pick<
  SyncInstallation,
  | 'accountSetupState'
  | 'accountUserId'
  | 'accountSessionId'
  | 'accountEmail'
  | 'accountMigrationSnapshotId'
> {
  return {
    accountSetupState,
    accountUserId: ACCOUNT_USER_ID,
    accountSessionId: ACCOUNT_SESSION_ID,
    accountEmail: 'person@example.com',
    accountMigrationSnapshotId,
  };
}

function installationRecord(): Record<string, unknown> {
  const legacy: Record<string, unknown> = { ...baseInstallation() };
  delete legacy.accountSetupState;
  delete legacy.accountUserId;
  delete legacy.accountSessionId;
  delete legacy.accountEmail;
  delete legacy.accountMigrationSnapshotId;
  return { id: 'sync', enabled: false, ...legacy };
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result), { once: true });
    value.addEventListener('error', () => reject(value.error), { once: true });
  });
}
