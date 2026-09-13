import type { SyncMembershipStatus, SyncPlatform } from './SyncInstallationRepository';

export interface CachedSyncDevice {
  readonly deviceId: string;
  readonly spaceId: string;
  readonly encryptedName: string | null;
  readonly encryptedNameNonce: string | null;
  readonly encryptedNameKeyEpoch: number | null;
  readonly displayName: string;
  readonly platform: SyncPlatform;
  readonly publicKey: string;
  readonly status: SyncMembershipStatus;
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
  readonly updatedAt: string;
}

export interface SyncDeviceCacheRepository {
  list(spaceId: string): Promise<readonly CachedSyncDevice[]>;
  replaceForSpace(spaceId: string, devices: readonly CachedSyncDevice[]): Promise<void>;
}
