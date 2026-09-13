export type SyncPlatform = 'windows' | 'android';
export type SyncMembershipStatus = 'pending' | 'active' | 'revoked';
export type SyncSetupState =
  'not_configured' | 'recovery_unconfirmed' | 'configured' | 'rotation_pending';

export interface SyncInstallation {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly platform: SyncPlatform;
  readonly publicKey: string;
  readonly createdAt: string;
  readonly spaceId: string | null;
  readonly membershipStatus: SyncMembershipStatus | null;
  readonly currentKeyEpoch: number | null;
  readonly recoveryConfirmedAt: string | null;
  readonly snapshotId: string | null;
  readonly setupState: SyncSetupState;
  readonly pendingRevokedDeviceId: string | null;
  readonly updatedAt: string;
}

export interface SyncInstallationRepository {
  find(): Promise<SyncInstallation | null>;
  save(installation: SyncInstallation): Promise<void>;
}
