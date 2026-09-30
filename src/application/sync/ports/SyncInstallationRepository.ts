export type SyncPlatform = 'windows' | 'android';
export type SyncMembershipStatus = 'pending' | 'active' | 'revoked';
export type SyncSetupState =
  'not_configured' | 'recovery_unconfirmed' | 'configured' | 'rotation_pending';

export type AccountSetupState =
  | 'local_anonymous'
  | 'email_verification_pending'
  | 'account_migration_pending'
  | 'recovery_confirmation_pending'
  | 'sign_in_required'
  | 'device_recovery_required'
  | 'ready'
  | 'sign_out_pending';

export interface SyncAccountMetadata {
  readonly accountSetupState: AccountSetupState;
  readonly accountUserId: string | null;
  readonly accountSessionId: string | null;
  readonly accountEmail: string | null;
  readonly accountMigrationSnapshotId: string | null;
  readonly accountRecoveryDeviceId?: string | null;
}

interface SyncAccountMetadataInput {
  readonly accountSetupState?: unknown;
  readonly accountUserId?: unknown;
  readonly accountSessionId?: unknown;
  readonly accountEmail?: unknown;
  readonly accountMigrationSnapshotId?: unknown;
  readonly accountRecoveryDeviceId?: unknown;
}

export function normalizeSyncAccountMetadata(value: SyncAccountMetadataInput): SyncAccountMetadata {
  const state = value.accountSetupState ?? 'local_anonymous';
  const userId = value.accountUserId ?? null;
  const sessionId = value.accountSessionId ?? null;
  const email = value.accountEmail ?? null;
  const snapshotId = value.accountMigrationSnapshotId ?? null;
  const recoveryDeviceId = value.accountRecoveryDeviceId ?? null;
  const states: readonly AccountSetupState[] = [
    'local_anonymous',
    'email_verification_pending',
    'account_migration_pending',
    'recovery_confirmation_pending',
    'sign_in_required',
    'device_recovery_required',
    'ready',
    'sign_out_pending',
  ];

  if (!states.includes(state as AccountSetupState)) throw invalidAccountMetadata();

  if (state === 'local_anonymous') {
    if (
      userId !== null ||
      sessionId !== null ||
      email !== null ||
      snapshotId !== null ||
      recoveryDeviceId !== null
    ) {
      throw invalidAccountMetadata();
    }
    return {
      accountSetupState: 'local_anonymous',
      accountUserId: null,
      accountSessionId: null,
      accountEmail: null,
      accountMigrationSnapshotId: null,
    };
  }

  if (
    typeof userId !== 'string' ||
    !isUuid(userId) ||
    typeof sessionId !== 'string' ||
    !isUuid(sessionId) ||
    typeof email !== 'string' ||
    !isNormalizedEmail(email) ||
    (snapshotId !== null && (typeof snapshotId !== 'string' || !isUuid(snapshotId))) ||
    ((state === 'account_migration_pending' || state === 'sign_out_pending') &&
      snapshotId === null) ||
    (recoveryDeviceId !== null &&
      (typeof recoveryDeviceId !== 'string' || !isUuid(recoveryDeviceId)))
  ) {
    throw invalidAccountMetadata();
  }

  return {
    accountSetupState: state as Exclude<AccountSetupState, 'local_anonymous'>,
    accountUserId: userId,
    accountSessionId: sessionId,
    accountEmail: email,
    accountMigrationSnapshotId: snapshotId,
    ...(value.accountRecoveryDeviceId === undefined
      ? {}
      : { accountRecoveryDeviceId: recoveryDeviceId }),
  };
}

export interface SyncInstallation extends SyncAccountMetadata {
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isNormalizedEmail(value: string): boolean {
  return (
    value === value.trim().toLowerCase() &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function invalidAccountMetadata(): Error {
  return new Error('Invalid non-secret Sync account metadata.');
}
