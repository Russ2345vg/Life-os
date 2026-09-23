import { describe, expect, it, vi } from 'vitest';
import type { SnapshotService } from '../SnapshotService';
import type { SyncApplication, SyncOverview } from '../SyncApplicationService';
import type { SyncCryptoService } from '../ports/SyncCryptoService';
import type {
  SyncInstallation,
  SyncInstallationRepository,
} from '../ports/SyncInstallationRepository';
import type { AccountAuth, AccountSession } from './AccountAuth';
import { AccountSyncService } from './AccountSyncService';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const SPACE_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';
const SESSION_ID = '40000000-0000-4000-8000-000000000001';
const SNAPSHOT_ID = '50000000-0000-4000-8000-000000000001';
const EMAIL = 'person@example.com';
const RECOVERY = 'LIFEOS-RECOVERY-V1:secret-material';
const NOW = '2026-09-22T11:00:00.000Z';

describe('AccountSyncService recovery convergence', () => {
  it('keeps password-only sign-in pending and does not pull encrypted data', async () => {
    const fixture = recoveryFixture(localInstallation());

    await expect(fixture.service.signIn(EMAIL, 'correct horse battery')).resolves.toMatchObject({
      state: 'recovery_confirmation_pending',
    });

    expect(fixture.sync.recover).not.toHaveBeenCalled();
    expect(fixture.sync.syncPilotNow).not.toHaveBeenCalled();
  });

  it('becomes ready only after recovery activation and a durable first pull', async () => {
    const fixture = recoveryFixture(pendingInstallation());
    fixture.sync.recover.mockImplementation(async () => {
      const active = activeInstallation();
      await fixture.installations.save(active);
      return overview(active);
    });
    fixture.sync.syncPilotNow.mockResolvedValue({
      pending: 0,
      conflicts: 1,
      quarantined: 0,
      lastSequence: 12,
    });

    await expect(fixture.service.recoverDevice(RECOVERY)).resolves.toMatchObject({
      state: 'ready',
      conflicts: 1,
    });

    expect(fixture.sync.recover).toHaveBeenCalledWith(RECOVERY);
    expect(fixture.sync.syncPilotNow).toHaveBeenCalledOnce();
    expect(fixture.crypto.deleteDeviceSecrets).not.toHaveBeenCalled();
    expect(fixture.installations.value).toMatchObject({
      membershipStatus: 'active',
      accountSetupState: 'ready',
    });
    expect(JSON.stringify(fixture.installations.savedStates)).not.toContain(RECOVERY);
  });

  it('resumes convergence after key unwrap without registering another device', async () => {
    const fixture = recoveryFixture(activeInstallation());
    fixture.sync.syncPilotNow.mockResolvedValue({
      pending: 0,
      conflicts: 0,
      quarantined: 0,
      lastSequence: 12,
    });

    await expect(fixture.service.load()).resolves.toMatchObject({ state: 'ready' });

    expect(fixture.sync.recover).not.toHaveBeenCalled();
    expect(fixture.sync.syncPilotNow).toHaveBeenCalledOnce();
    expect(fixture.installations.value?.accountSetupState).toBe('ready');
  });

  it.each([
    { pending: 1, conflicts: 0, quarantined: 0, lastSequence: 12 },
    { pending: 0, conflicts: 0, quarantined: 1, lastSequence: 12 },
    { pending: 0, conflicts: 0, quarantined: 0, lastSequence: null },
  ])('preserves device trust when first convergence is incomplete %#', async (report) => {
    const fixture = recoveryFixture(pendingInstallation());
    fixture.sync.recover.mockImplementation(async () => {
      const active = activeInstallation();
      await fixture.installations.save(active);
      return overview(active);
    });
    fixture.sync.syncPilotNow.mockResolvedValue(report);

    const error = await fixture.service.recoverDevice(RECOVERY).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'account.convergence_incomplete' });
    expect(JSON.stringify(error)).not.toContain(RECOVERY);
    expect(fixture.crypto.deleteDeviceSecrets).not.toHaveBeenCalled();
    expect(fixture.installations.value).toMatchObject({
      membershipStatus: 'active',
      setupState: 'configured',
      accountSetupState: 'recovery_confirmation_pending',
      snapshotId: SNAPSHOT_ID,
    });
  });
});

function recoveryFixture(initial: SyncInstallation) {
  const installations = new MemoryInstallationRepository(initial);
  const auth = {
    current: vi.fn(async () => accountSession()),
    ensureAnonymous: vi.fn(async () => accountSession()),
    beginRegistration: vi.fn(async () => accountSession()),
    resendVerification: vi.fn(async () => undefined),
    verifyEmail: vi.fn(async () => accountSession()),
    setPassword: vi.fn(async () => accountSession()),
    signIn: vi.fn(async () => accountSession()),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => accountSession()),
    signOutCurrent: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } satisfies AccountAuth;
  const sync = {
    loadOverview: vi.fn(async () => overview(installations.value!)),
    setupFirstSpace: vi.fn<SyncApplication['setupFirstSpace']>(),
    confirmRecoverySaved: vi.fn<SyncApplication['confirmRecoverySaved']>(),
    exportRecoveryMaterial: vi.fn<SyncApplication['exportRecoveryMaterial']>(),
    createPairingInvitation: vi.fn<SyncApplication['createPairingInvitation']>(),
    cancelPairingInvitation: vi.fn<SyncApplication['cancelPairingInvitation']>(),
    fulfillPendingPairings: vi.fn<SyncApplication['fulfillPendingPairings']>(),
    claimPairingPayload: vi.fn<SyncApplication['claimPairingPayload']>(),
    completePendingPairing: vi.fn<SyncApplication['completePendingPairing']>(),
    recover: vi.fn<SyncApplication['recover']>(),
    revokeDevice: vi.fn<SyncApplication['revokeDevice']>(),
    retryPendingRotation: vi.fn<SyncApplication['retryPendingRotation']>(),
    updateDeviceName: vi.fn<SyncApplication['updateDeviceName']>(),
    pilotStatus: vi.fn(() => ({
      state: 'idle' as const,
      pendingCount: 0,
      conflictCount: 0,
      lastSuccessfulSyncAt: null,
    })),
    subscribePilotStatus: vi.fn(() => () => undefined),
    syncPilotNow: vi.fn<SyncApplication['syncPilotNow']>(),
    notifyPilotMutation: vi.fn(),
    close: vi.fn(async () => undefined),
  } satisfies SyncApplication;
  const crypto = {
    deleteDeviceSecrets: vi.fn(async () => undefined),
  } as unknown as SyncCryptoService;
  const snapshots = {
    createPreSyncSnapshot: vi.fn(),
    verifySnapshot: vi.fn(),
  } as unknown as SnapshotService;
  const service = new AccountSyncService({
    auth,
    installations,
    snapshots,
    sync,
    transport: { adoptCurrentSpace: vi.fn(), revokeCurrentDevice: vi.fn() },
    crypto,
    recovery: {} as never,
    localData: { purge: vi.fn(async () => undefined) },
    now: () => new Date(NOW),
  });
  return { service, installations, sync, crypto };
}

class MemoryInstallationRepository implements SyncInstallationRepository {
  public readonly savedStates: SyncInstallation[] = [];
  public constructor(public value: SyncInstallation | null) {}
  public async find() {
    return this.value;
  }
  public async save(value: SyncInstallation) {
    this.value = structuredClone(value);
    this.savedStates.push(structuredClone(value));
  }
}

function localInstallation(): SyncInstallation {
  return {
    deviceId: DEVICE_ID,
    deviceName: 'Windows PC',
    platform: 'windows',
    publicKey: 'public-key',
    createdAt: NOW,
    spaceId: null,
    membershipStatus: null,
    currentKeyEpoch: null,
    recoveryConfirmedAt: null,
    snapshotId: SNAPSHOT_ID,
    setupState: 'not_configured',
    pendingRevokedDeviceId: null,
    updatedAt: NOW,
    accountSetupState: 'local_anonymous',
    accountUserId: null,
    accountSessionId: null,
    accountEmail: null,
    accountMigrationSnapshotId: null,
  };
}

function pendingInstallation(): SyncInstallation {
  return {
    ...localInstallation(),
    accountSetupState: 'recovery_confirmation_pending',
    accountUserId: USER_ID,
    accountSessionId: SESSION_ID,
    accountEmail: EMAIL,
  };
}

function activeInstallation(): SyncInstallation {
  return {
    ...pendingInstallation(),
    spaceId: SPACE_ID,
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: NOW,
    setupState: 'configured',
  };
}

function accountSession(): AccountSession {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    email: EMAIL,
    emailVerified: true,
    isAnonymous: false,
  };
}

function overview(installation: SyncInstallation): SyncOverview {
  return {
    installation,
    devices: [],
    connection: installation.spaceId === null ? 'local' : 'online',
    warning: null,
  };
}
