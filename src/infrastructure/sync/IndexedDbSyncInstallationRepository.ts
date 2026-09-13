import type {
  SyncInstallation,
  SyncInstallationRepository,
} from '../../application/sync/ports/SyncInstallationRepository';
import type { SyncSettingsRecord } from '../persistence/records';
import {
  LIFE_OS_SYNC_STORE,
  type LifeOsIndexedDb,
} from '../persistence/indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from '../persistence/indexed-db/IndexedDbRequest';

export class IndexedDbSyncInstallationRepository implements SyncInstallationRepository {
  public constructor(private readonly database: LifeOsIndexedDb) {}

  public async find(): Promise<SyncInstallation | null> {
    const database = await this.database.open();
    const record = await executeIndexedDbRequest<SyncSettingsRecord | undefined>(
      database,
      LIFE_OS_SYNC_STORE.settings,
      'readonly',
      (store) => store.get('sync'),
    );
    return record === undefined ? null : toInstallation(record);
  }

  public async save(installation: SyncInstallation): Promise<void> {
    assertInstallation(installation);
    const record: SyncSettingsRecord = {
      id: 'sync',
      enabled: false,
      ...installation,
    };
    const database = await this.database.open();
    await executeIndexedDbRequest<IDBValidKey>(
      database,
      LIFE_OS_SYNC_STORE.settings,
      'readwrite',
      (store) => store.put(record),
    );
  }
}

function toInstallation(record: SyncSettingsRecord): SyncInstallation {
  const installation: SyncInstallation = {
    deviceId: record.deviceId,
    deviceName: record.deviceName,
    platform: record.platform,
    publicKey: record.publicKey,
    createdAt: record.createdAt,
    spaceId: record.spaceId,
    membershipStatus: record.membershipStatus,
    currentKeyEpoch: record.currentKeyEpoch,
    recoveryConfirmedAt: record.recoveryConfirmedAt,
    snapshotId: record.snapshotId,
    setupState: record.setupState,
    pendingRevokedDeviceId: record.pendingRevokedDeviceId,
    updatedAt: record.updatedAt,
  };
  assertInstallation(installation);
  return installation;
}

function assertInstallation(value: SyncInstallation): void {
  if (
    !isUuid(value.deviceId) ||
    value.deviceName.trim().length === 0 ||
    !['windows', 'android'].includes(value.platform) ||
    value.publicKey.length === 0 ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    (value.spaceId !== null && !isUuid(value.spaceId)) ||
    (value.currentKeyEpoch !== null &&
      (!Number.isInteger(value.currentKeyEpoch) || value.currentKeyEpoch < 1))
  ) {
    throw new Error('Invalid non-secret Sync installation metadata.');
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
