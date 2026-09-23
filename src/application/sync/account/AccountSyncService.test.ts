import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../../shared/errors/DomainError';
import type { SnapshotService } from '../SnapshotService';
import type { SyncApplication, SyncOverview } from '../SyncApplicationService';
import type { CachedSyncDevice } from '../ports/SyncDeviceCacheRepository';
import type {
  SyncInstallation,
  SyncInstallationRepository,
} from '../ports/SyncInstallationRepository';
import type { SyncTrustTransport } from '../ports/SyncTrustTransport';
import type { AccountAuth, AccountSession } from './AccountAuth';
import { AccountSyncService } from './AccountSyncService';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const SPACE_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';
const SESSION_ID = '40000000-0000-4000-8000-000000000001';
const SNAPSHOT_ID = '50000000-0000-4000-8000-000000000001';
const EMAIL = 'person@example.com';
const PASSWORD = 'correct horse battery';
const RECOVERY = 'LIFEOS-RECOVERY-V1:private-material';
const TIMESTAMP = '2026-09-22T10:00:00.000Z';

describe('AccountSyncService', () => {
  it('loads a local-only installation without creating an account session', async () => {
    const fixture = createFixture(localInstallation());

    await expect(fixture.service.load()).resolves.toMatchObject({
      state: 'local_anonymous',
      email: null,
      connection: 'local',
      recoveryMaterial: null,
      pendingMutations: 2,
      conflicts: 1,
      devices: [],
    });
    expect(fixture.auth.current).not.toHaveBeenCalled();
    expect(fixture.auth.ensureAnonymous).not.toHaveBeenCalled();
  });

  it('persists registration and verified email transitions without secrets', async () => {
    const fixture = createFixture(localInstallation());

    await expect(fixture.service.beginRegistration(' PERSON@Example.COM ')).resolves.toMatchObject({
      state: 'email_verification_pending',
      email: EMAIL,
    });
    await fixture.service.resendVerification();
    await expect(fixture.service.verifyEmail('123456')).resolves.toMatchObject({
      state: 'email_verification_pending',
      email: EMAIL,
    });

    expect(fixture.auth.beginRegistration).toHaveBeenCalledWith(' PERSON@Example.COM ');
    expect(fixture.auth.resendVerification).toHaveBeenCalledWith(EMAIL);
    expect(fixture.auth.verifyEmail).toHaveBeenCalledWith(EMAIL, '123456');
    expect(JSON.stringify(fixture.installations.savedStates)).not.toMatch(/123456|correct horse/i);
  });

  it('resumes password setup when the pending email was confirmed outside the app', async () => {
    const fixture = createFixture(registrationInstallation());

    await expect(fixture.service.load()).resolves.toMatchObject({
      state: 'email_verification_pending',
      email: EMAIL,
      emailVerified: true,
    });

    expect(fixture.auth.current).toHaveBeenCalledOnce();
    expect(fixture.installations.value).toMatchObject({
      accountUserId: USER_ID,
      accountSessionId: SESSION_ID,
      accountEmail: EMAIL,
    });
  });

  it('keeps an unverified pending session on email verification', async () => {
    const fixture = createFixture(registrationInstallation());
    fixture.auth.current.mockResolvedValue(
      session({ anonymous: true, email: EMAIL, verified: false }),
    );

    await expect(fixture.service.load()).resolves.toMatchObject({
      state: 'email_verification_pending',
      email: EMAIL,
      emailVerified: false,
    });
  });

  it('snapshots before first-space setup, starts initial push and waits for recovery confirmation', async () => {
    const fixture = createFixture(registrationInstallation());
    const setupInstallation = {
      ...registrationInstallation(),
      spaceId: SPACE_ID,
      membershipStatus: 'active' as const,
      currentKeyEpoch: 1,
      snapshotId: SNAPSHOT_ID,
      setupState: 'recovery_unconfirmed' as const,
      accountSetupState: 'account_migration_pending' as const,
      accountUserId: USER_ID,
      accountSessionId: SESSION_ID,
      accountEmail: EMAIL,
      accountMigrationSnapshotId: SNAPSHOT_ID,
    };
    fixture.sync.setupFirstSpace.mockImplementation(async () => {
      await fixture.installations.save(setupInstallation);
      return { overview: syncOverview(setupInstallation, 'online'), recoveryMaterial: RECOVERY };
    });

    const result = await fixture.service.setPasswordAndAdopt(PASSWORD);

    expect(result).toMatchObject({
      state: 'recovery_confirmation_pending',
      recoveryMaterial: RECOVERY,
    });
    expect(fixture.snapshots.createPreSyncSnapshot).toHaveBeenCalledOnce();
    expect(fixture.snapshots.verifySnapshot).toHaveBeenCalledWith(SNAPSHOT_ID);
    expect(fixture.sync.setupFirstSpace).toHaveBeenCalledOnce();
    expect(fixture.sync.syncPilotNow).toHaveBeenCalledOnce();
    const pending = fixture.installations.savedStates.find(
      (state) => state.accountSetupState === 'account_migration_pending',
    );
    expect(pending).toMatchObject({
      accountMigrationSnapshotId: SNAPSHOT_ID,
      accountUserId: USER_ID,
      accountSessionId: SESSION_ID,
    });
    expect(JSON.stringify(fixture.installations.savedStates)).not.toContain(PASSWORD);
    expect(JSON.stringify(fixture.installations.savedStates)).not.toContain(RECOVERY);
  });

  it('adopts the exact existing anonymous space and key epoch without creating another space', async () => {
    const fixture = createFixture(
      registrationInstallation({ spaceId: SPACE_ID, currentKeyEpoch: 4 }),
    );
    fixture.transport.adoptCurrentSpace.mockResolvedValue({
      spaceId: SPACE_ID,
      currentKeyEpoch: 4,
    });

    await expect(fixture.service.setPasswordAndAdopt(PASSWORD)).resolves.toMatchObject({
      state: 'ready',
      recoveryMaterial: null,
    });

    expect(fixture.transport.adoptCurrentSpace).toHaveBeenCalledWith(DEVICE_ID);
    expect(fixture.sync.setupFirstSpace).not.toHaveBeenCalled();
    expect(fixture.sync.syncPilotNow).toHaveBeenCalledOnce();
    expect(fixture.installations.value).toMatchObject({
      spaceId: SPACE_ID,
      currentKeyEpoch: 4,
      accountSetupState: 'ready',
    });
  });

  it('resumes an interrupted adoption with the same snapshot and idempotent RPC', async () => {
    const fixture = createFixture(migrationInstallation());
    fixture.transport.adoptCurrentSpace.mockResolvedValue({
      spaceId: SPACE_ID,
      currentKeyEpoch: 4,
    });

    await expect(fixture.service.load()).resolves.toMatchObject({ state: 'ready' });

    expect(fixture.snapshots.createPreSyncSnapshot).not.toHaveBeenCalled();
    expect(fixture.snapshots.verifySnapshot).toHaveBeenCalledWith(SNAPSHOT_ID);
    expect(fixture.transport.adoptCurrentSpace).toHaveBeenCalledTimes(1);
    expect(fixture.sync.setupFirstSpace).not.toHaveBeenCalled();
  });

  it('retains migration state after a network failure and resumes on the next load', async () => {
    const fixture = createFixture(
      registrationInstallation({ spaceId: SPACE_ID, currentKeyEpoch: 4 }),
    );
    fixture.transport.adoptCurrentSpace
      .mockRejectedValueOnce(new DomainError('sync.remote_operation_failed', 'Нет соединения.'))
      .mockResolvedValueOnce({ spaceId: SPACE_ID, currentKeyEpoch: 4 });

    await expect(fixture.service.setPasswordAndAdopt(PASSWORD)).rejects.toMatchObject({
      code: 'sync.remote_operation_failed',
    });
    expect(fixture.installations.value?.accountSetupState).toBe('account_migration_pending');
    expect(fixture.installations.value?.accountMigrationSnapshotId).toBe(SNAPSHOT_ID);

    await expect(fixture.service.load()).resolves.toMatchObject({ state: 'ready' });
    expect(fixture.transport.adoptCurrentSpace).toHaveBeenCalledTimes(2);
    expect(fixture.snapshots.createPreSyncSnapshot).toHaveBeenCalledTimes(1);
  });

  it('confirms recovery and marks the account ready', async () => {
    const fixture = createFixture({
      ...migrationInstallation(),
      accountSetupState: 'recovery_confirmation_pending',
      setupState: 'recovery_unconfirmed',
    });

    await expect(fixture.service.confirmRecoverySaved()).resolves.toMatchObject({ state: 'ready' });
    expect(fixture.sync.confirmRecoverySaved).toHaveBeenCalledOnce();
    expect(fixture.installations.value).toMatchObject({
      setupState: 'configured',
      accountSetupState: 'ready',
      accountMigrationSnapshotId: null,
    });
  });

  it('signs an untrusted device into recovery state without changing local sync identity', async () => {
    const initial = localInstallation();
    const fixture = createFixture(initial);

    await expect(fixture.service.signIn(EMAIL, PASSWORD)).resolves.toMatchObject({
      state: 'recovery_confirmation_pending',
      email: EMAIL,
    });
    expect(fixture.installations.value).toMatchObject({
      deviceId: DEVICE_ID,
      publicKey: initial.publicKey,
      spaceId: null,
      currentKeyEpoch: null,
      accountUserId: USER_ID,
      accountSessionId: SESSION_ID,
    });
  });

  it('keeps space and key metadata unchanged across password reset and update', async () => {
    const initial = readyInstallation();
    const fixture = createFixture(initial);

    await fixture.service.requestPasswordReset(' PERSON@Example.COM ');
    await fixture.service.updatePassword('another secure password');

    expect(fixture.auth.requestPasswordReset).toHaveBeenCalledWith(' PERSON@Example.COM ');
    expect(fixture.installations.value).toMatchObject({
      spaceId: SPACE_ID,
      currentKeyEpoch: 4,
      publicKey: initial.publicKey,
      snapshotId: initial.snapshotId,
      accountSetupState: 'ready',
    });
    expect(JSON.stringify(fixture.installations.savedStates)).not.toContain(
      'another secure password',
    );
  });

  it('does not persist or expose recovery material when delegating device recovery', async () => {
    const fixture = createFixture({
      ...localInstallation(),
      accountSetupState: 'recovery_confirmation_pending',
      accountUserId: USER_ID,
      accountSessionId: SESSION_ID,
      accountEmail: EMAIL,
    });
    fixture.sync.recover.mockRejectedValue(
      new DomainError('sync.recovery_failed', 'Восстановление не выполнено.'),
    );

    const error = await fixture.service.recoverDevice(RECOVERY).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'sync.recovery_failed' });
    expect(JSON.stringify(error)).not.toContain(RECOVERY);
    expect(JSON.stringify(fixture.installations.savedStates)).not.toContain(RECOVERY);
  });
});

function createFixture(initial: SyncInstallation) {
  const installations = new MemoryInstallationRepository(initial);
  const permanentSession = session();
  const auth = {
    current: vi.fn(async () => permanentSession),
    ensureAnonymous: vi.fn(async () => session({ anonymous: true, email: null, verified: false })),
    beginRegistration: vi.fn(async () =>
      session({ anonymous: true, email: EMAIL, verified: false }),
    ),
    resendVerification: vi.fn(async () => undefined),
    verifyEmail: vi.fn(async () => permanentSession),
    setPassword: vi.fn(async () => permanentSession),
    signIn: vi.fn(async () => permanentSession),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => permanentSession),
    signOutCurrent: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } satisfies AccountAuth;
  const snapshots = {
    createPreSyncSnapshot: vi.fn(async () => ({
      snapshotId: SNAPSHOT_ID,
      createdAt: TIMESTAMP,
      databaseName: 'lifeos',
      databaseVersion: 26,
      recordCount: 1,
      sha256: 'verified',
    })),
    verifySnapshot: vi.fn(async () => ({
      valid: true,
      reason: 'ok' as const,
      snapshot: null,
    })),
  } satisfies SnapshotService;
  const loadOverview = vi.fn(async () =>
    syncOverview(installations.value!, connectionFor(installations.value!)),
  );
  const sync = {
    loadOverview,
    setupFirstSpace: vi.fn<SyncApplication['setupFirstSpace']>(async () => {
      throw new Error('Unexpected first-space setup.');
    }),
    confirmRecoverySaved: vi.fn(async () => {
      const updated = {
        ...installations.value!,
        setupState: 'configured' as const,
        recoveryConfirmedAt: TIMESTAMP,
      };
      await installations.save(updated);
      return syncOverview(updated, 'online');
    }),
    exportRecoveryMaterial: vi.fn(async () => RECOVERY),
    createPairingInvitation: vi.fn(),
    cancelPairingInvitation: vi.fn(),
    fulfillPendingPairings: vi.fn(),
    claimPairingPayload: vi.fn(),
    completePendingPairing: vi.fn(),
    recover: vi.fn(),
    revokeDevice: vi.fn(async () => syncOverview(installations.value!, 'online')),
    retryPendingRotation: vi.fn(),
    updateDeviceName: vi.fn(),
    pilotStatus: vi.fn(() => ({
      state: 'idle' as const,
      pendingCount: 2,
      conflictCount: 1,
      lastSuccessfulSyncAt: null,
    })),
    subscribePilotStatus: vi.fn(() => () => undefined),
    syncPilotNow: vi.fn(async () => ({
      pending: 0,
      conflicts: 0,
      quarantined: 0,
      lastSequence: 0,
    })),
    notifyPilotMutation: vi.fn(),
    close: vi.fn(async () => undefined),
  } satisfies SyncApplication;
  const transport = {
    adoptCurrentSpace: vi.fn<SyncTrustTransport['adoptCurrentSpace']>(async () => ({
      spaceId: SPACE_ID,
      currentKeyEpoch: 4,
    })),
    revokeCurrentDevice: vi.fn(async () => undefined),
  };
  const service = new AccountSyncService({
    auth,
    installations,
    snapshots,
    sync,
    transport,
    crypto: { deleteDeviceSecrets: vi.fn(async () => undefined) },
    recovery: {} as never,
    localData: { purge: vi.fn(async () => undefined) },
    now: () => new Date(TIMESTAMP),
  });
  return { service, auth, installations, snapshots, sync, transport };
}

class MemoryInstallationRepository implements SyncInstallationRepository {
  public readonly savedStates: SyncInstallation[] = [];
  public constructor(public value: SyncInstallation | null) {}
  public async find(): Promise<SyncInstallation | null> {
    return this.value;
  }
  public async save(installation: SyncInstallation): Promise<void> {
    this.value = structuredClone(installation);
    this.savedStates.push(structuredClone(installation));
  }
}

function localInstallation(): SyncInstallation {
  return {
    deviceId: DEVICE_ID,
    deviceName: 'Windows PC',
    platform: 'windows',
    publicKey: 'public-key',
    createdAt: TIMESTAMP,
    spaceId: null,
    membershipStatus: null,
    currentKeyEpoch: null,
    recoveryConfirmedAt: null,
    snapshotId: null,
    setupState: 'not_configured',
    pendingRevokedDeviceId: null,
    updatedAt: TIMESTAMP,
    accountSetupState: 'local_anonymous',
    accountUserId: null,
    accountSessionId: null,
    accountEmail: null,
    accountMigrationSnapshotId: null,
  };
}

function registrationInstallation(override: Partial<SyncInstallation> = {}): SyncInstallation {
  return {
    ...localInstallation(),
    setupState: override.spaceId === undefined ? 'not_configured' : 'configured',
    membershipStatus: override.spaceId === undefined ? null : 'active',
    recoveryConfirmedAt: override.spaceId === undefined ? null : TIMESTAMP,
    accountSetupState: 'email_verification_pending',
    accountUserId: USER_ID,
    accountSessionId: SESSION_ID,
    accountEmail: EMAIL,
    ...override,
  };
}

function migrationInstallation(): SyncInstallation {
  return {
    ...registrationInstallation({ spaceId: SPACE_ID, currentKeyEpoch: 4 }),
    accountSetupState: 'account_migration_pending',
    accountMigrationSnapshotId: SNAPSHOT_ID,
  };
}

function readyInstallation(): SyncInstallation {
  return {
    ...migrationInstallation(),
    accountSetupState: 'ready',
    accountMigrationSnapshotId: null,
  };
}

function session(
  override: { anonymous?: boolean; email?: string | null; verified?: boolean } = {},
): AccountSession {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    email: override.email === undefined ? EMAIL : override.email,
    emailVerified: override.verified ?? true,
    isAnonymous: override.anonymous ?? false,
  };
}

function syncOverview(
  installation: SyncInstallation,
  connection: SyncOverview['connection'],
  devices: readonly CachedSyncDevice[] = [],
): SyncOverview {
  return { installation, devices, connection, warning: null };
}

function connectionFor(installation: SyncInstallation): SyncOverview['connection'] {
  return installation.spaceId === null ? 'local' : 'online';
}
