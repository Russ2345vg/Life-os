import { describe, expect, it, vi } from 'vitest';
import type { SnapshotService } from './SnapshotService';
import { SyncApplicationService, type SyncApplicationDependencies } from './SyncApplicationService';
import type { AccountAuth } from './account/AccountAuth';
import type {
  CachedSyncDevice,
  SyncDeviceCacheRepository,
} from './ports/SyncDeviceCacheRepository';
import type { SyncCryptoService } from './ports/SyncCryptoService';
import type {
  SyncInstallation,
  SyncInstallationRepository,
} from './ports/SyncInstallationRepository';
import type { SyncTrustTransport } from './ports/SyncTrustTransport';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_DEVICE_ID = '10000000-0000-4000-8000-000000000002';
const SPACE_ID = '20000000-0000-4000-8000-000000000001';
const INVITE_ID = '30000000-0000-4000-8000-000000000001';
const ACCOUNT_USER_ID = '40000000-0000-4000-8000-000000000001';
const ACCOUNT_SESSION_ID = '50000000-0000-4000-8000-000000000001';
const TIMESTAMP = '2026-09-04T00:00:00.000Z';

describe('SyncApplicationService', () => {
  it('creates one stable local device identity without network and reuses it', async () => {
    const fixture = createFixture();
    const service = new SyncApplicationService(fixture.dependencies);

    const first = await service.loadOverview();
    const second = await service.loadOverview();

    expect(first.installation.deviceId).toBe(DEVICE_ID);
    expect(second.installation).toEqual(first.installation);
    expect(fixture.crypto.ensureDeviceIdentity).toHaveBeenNthCalledWith(1, DEVICE_ID, true);
    expect(fixture.crypto.ensureDeviceIdentity).toHaveBeenNthCalledWith(2, DEVICE_ID, false);
    expect(fixture.auth.ensureAnonymous).not.toHaveBeenCalled();
    expect(fixture.transport.listDevices).not.toHaveBeenCalled();
  });

  it('requires a verified pre-sync snapshot and explicit recovery confirmation', async () => {
    const fixture = createFixture();
    const service = new SyncApplicationService(fixture.dependencies);

    const setup = await service.setupFirstSpace();

    expect(fixture.snapshot.createPreSyncSnapshot).toHaveBeenCalledOnce();
    expect(fixture.snapshot.verifySnapshot).toHaveBeenCalledWith('snapshot-1');
    expect(setup.recoveryMaterial).toBe('LIFEOS-RECOVERY-V1:synthetic');
    expect(setup.overview.installation.setupState).toBe('recovery_unconfirmed');
    expect(setup.overview.installation.recoveryConfirmedAt).toBeNull();

    const confirmed = await service.confirmRecoverySaved();
    expect(confirmed.installation.setupState).toBe('configured');
    expect(confirmed.installation.recoveryConfirmedAt).toBe(TIMESTAMP);
    expect(confirmed.installation.snapshotId).toBe('snapshot-1');
  });

  it('reuses the verified migration snapshot during account first-space setup', async () => {
    const initial: SyncInstallation = {
      ...baseInstallation(),
      accountSetupState: 'account_migration_pending',
      accountUserId: ACCOUNT_USER_ID,
      accountSessionId: ACCOUNT_SESSION_ID,
      accountEmail: 'person@example.com',
      accountMigrationSnapshotId: 'snapshot-1',
    };
    const fixture = createFixture(initial);
    vi.mocked(fixture.auth.current).mockResolvedValue(accountSession());
    const service = new SyncApplicationService(fixture.dependencies);

    await service.setupFirstSpace();

    expect(fixture.snapshot.createPreSyncSnapshot).not.toHaveBeenCalled();
    expect(fixture.snapshot.verifySnapshot).toHaveBeenCalledWith('snapshot-1');
    expect(fixture.auth.ensureAnonymous).not.toHaveBeenCalled();
  });

  it('keeps a claimed device pending until local envelope decryption and acknowledgement', async () => {
    const fixture = createFixture(pendingInstallation());
    fixture.fetchPendingEnvelope.mockResolvedValue({
      metadata: {
        protocolVersion: 1,
        purpose: 'pairing',
        spaceId: SPACE_ID,
        recipientDeviceId: DEVICE_ID,
        keyEpoch: 1,
      },
      senderPublicKey: encoded(32, 1),
      ciphertext: encoded(32, 2),
      nonce: encoded(24, 3),
    });
    const service = new SyncApplicationService(fixture.dependencies);

    await expect(service.completePendingPairing()).resolves.toBe(true);

    expect(fixture.crypto.unwrapAndStoreKeyRing).toHaveBeenCalledOnce();
    expect(fixture.transport.acknowledgePairing).toHaveBeenCalledOnce();
    expect(fixture.installation.value?.membershipStatus).toBe('active');
    expect(fixture.installation.value?.setupState).toBe('configured');
  });

  it('persists rotation pending before envelopes and finalizes only after all recipients', async () => {
    const fixture = createFixture(configuredInstallation());
    fixture.revokeDeviceAndAdvanceEpoch.mockResolvedValue({
      newKeyEpoch: 2,
      recipients: [{ deviceId: DEVICE_ID, publicKey: encoded(32, 1) }],
    });
    const service = new SyncApplicationService(fixture.dependencies);

    const overview = await service.revokeDevice(SECOND_DEVICE_ID);

    expect(fixture.installation.savedStates.map((state) => state.setupState)).toContain(
      'rotation_pending',
    );
    expect(fixture.crypto.prepareRotation).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      senderDeviceId: DEVICE_ID,
      nextEpoch: 2,
      recipients: [{ deviceId: DEVICE_ID, publicKey: encoded(32, 1) }],
    });
    expect(fixture.transport.publishKeyEnvelope).toHaveBeenCalledOnce();
    expect(fixture.transport.finalizeKeyEpochRotation).toHaveBeenCalledOnce();
    expect(overview.installation.setupState).toBe('configured');
    expect(overview.installation.currentKeyEpoch).toBe(2);
    expect(overview.installation.pendingRevokedDeviceId).toBeNull();
  });

  it('does not revoke a device when this installation lacks recovery material for rotation', async () => {
    const fixture = createFixture(configuredInstallation());
    vi.mocked(fixture.crypto.requireRecoveryMaterial).mockRejectedValue(
      new Error('Recovery material is unavailable for rotation.'),
    );
    const service = new SyncApplicationService(fixture.dependencies);

    await expect(service.revokeDevice(SECOND_DEVICE_ID)).rejects.toThrow(
      'Recovery material is unavailable for rotation.',
    );

    expect(fixture.revokeDeviceAndAdvanceEpoch).not.toHaveBeenCalled();
    expect(fixture.installation.value?.setupState).toBe('configured');
  });

  it('decrypts server device names locally and updates only encrypted name fields', async () => {
    const fixture = createFixture(configuredInstallation());
    fixture.listDevices.mockResolvedValue([
      {
        deviceId: DEVICE_ID,
        spaceId: SPACE_ID,
        encryptedName: encoded(32, 2),
        encryptedNameNonce: encoded(24, 3),
        encryptedNameKeyEpoch: 1,
        displayName: 'Windows устройство',
        platform: 'windows',
        publicKey: encoded(32, 1),
        status: 'active',
        createdAt: TIMESTAMP,
        activatedAt: TIMESTAMP,
        lastSeenAt: null,
        revokedAt: null,
        updatedAt: TIMESTAMP,
      },
    ]);
    const service = new SyncApplicationService(fixture.dependencies);

    const loaded = await service.loadOverview();
    const renamed = await service.updateDeviceName('  Рабочий ноутбук  ');

    expect(loaded.devices[0]?.displayName).toBe('Расшифрованное устройство');
    expect(fixture.crypto.decryptDeviceName).toHaveBeenCalledWith(
      recoveryEnvelope(1, 'device_name'),
    );
    expect(fixture.transport.updateMyDeviceName).toHaveBeenCalledWith({
      ciphertext: encoded(32, 2),
      nonce: encoded(24, 3),
      keyEpoch: 1,
    });
    expect(renamed.installation.deviceName).toBe('Рабочий ноутбук');
    expect(renamed.installation.deviceId).toBe(DEVICE_ID);
  });

  it('installs a newer server epoch envelope locally before reporting online state', async () => {
    const fixture = createFixture(configuredInstallation());
    fixture.fetchMyRotationEnvelope.mockResolvedValue({
      currentKeyEpoch: 2,
      envelope: {
        metadata: {
          protocolVersion: 1,
          purpose: 'rotation',
          spaceId: SPACE_ID,
          recipientDeviceId: DEVICE_ID,
          keyEpoch: 2,
        },
        senderPublicKey: encoded(32, 1),
        ciphertext: encoded(32, 2),
        nonce: encoded(24, 3),
      },
    });
    const service = new SyncApplicationService(fixture.dependencies);

    const overview = await service.loadOverview();

    expect(fixture.crypto.unwrapAndStoreKeyRing).toHaveBeenCalledOnce();
    expect(overview.installation.currentKeyEpoch).toBe(2);
    expect(fixture.installation.value?.currentKeyEpoch).toBe(2);
  });

  it('repairs an acknowledged pairing when secure key storage succeeded before local metadata', async () => {
    const fixture = createFixture({
      ...pendingInstallation(),
      membershipStatus: 'active',
    });
    const service = new SyncApplicationService(fixture.dependencies);

    const overview = await service.loadOverview();
    await expect(service.createPairingInvitation()).resolves.toBeDefined();

    expect(fixture.crypto.exportRecoveryMaterial).toHaveBeenCalledWith(SPACE_ID);
    expect(overview.installation.setupState).toBe('configured');
    expect(fixture.installation.value?.setupState).toBe('configured');
  });

  it('re-enrolls a configured revoked installation through recovery without clearing local data', async () => {
    const fixture = createFixture({
      ...configuredInstallation(),
      platform: 'android',
      currentKeyEpoch: 2,
    });
    const service = new SyncApplicationService(fixture.dependencies);

    const overview = await service.recover('LIFEOS-RECOVERY-V1:synthetic');

    expect(fixture.snapshot.createPreSyncSnapshot).toHaveBeenCalledOnce();
    expect(fixture.snapshot.verifySnapshot).toHaveBeenCalledWith('snapshot-1');
    expect(fixture.auth.ensureAnonymous).toHaveBeenCalledOnce();
    expect(fixture.crypto.ensureDeviceIdentity).toHaveBeenCalledWith(SECOND_DEVICE_ID, true);
    expect(fixture.transport.beginRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: SECOND_DEVICE_ID, platform: 'android' }),
    );
    expect(fixture.transport.completeRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: SECOND_DEVICE_ID }),
    );
    expect(fixture.installation.savedStates).toContainEqual(
      expect.objectContaining({
        deviceId: SECOND_DEVICE_ID,
        spaceId: null,
        membershipStatus: null,
        snapshotId: 'snapshot-1',
        setupState: 'not_configured',
      }),
    );
    expect(overview.installation).toEqual(
      expect.objectContaining({
        deviceId: SECOND_DEVICE_ID,
        spaceId: SPACE_ID,
        membershipStatus: 'active',
        currentKeyEpoch: 1,
        snapshotId: 'snapshot-1',
        setupState: 'configured',
      }),
    );
  });

  it('keeps the current technical identity when the required re-enrollment snapshot is invalid', async () => {
    const fixture = createFixture(configuredInstallation());
    vi.mocked(fixture.snapshot.verifySnapshot).mockResolvedValue({
      valid: false,
      reason: 'checksum_mismatch',
      snapshot: null,
    });
    const service = new SyncApplicationService(fixture.dependencies);

    await expect(service.recover('LIFEOS-RECOVERY-V1:synthetic')).rejects.toThrow(
      'Pre-sync local snapshot verification failed.',
    );

    expect(fixture.auth.ensureAnonymous).not.toHaveBeenCalled();
    expect(fixture.transport.beginRecovery).not.toHaveBeenCalled();
    expect(fixture.installation.value?.deviceId).toBe(DEVICE_ID);
  });

  it('keeps the signed-in account session while replacing only the recovered device identity', async () => {
    const fixture = createFixture({
      ...configuredInstallation(),
      accountSetupState: 'recovery_confirmation_pending',
      accountUserId: ACCOUNT_USER_ID,
      accountSessionId: ACCOUNT_SESSION_ID,
      accountEmail: 'person@example.com',
    });
    vi.mocked(fixture.auth.current).mockResolvedValue(accountSession());
    const service = new SyncApplicationService(fixture.dependencies);

    const overview = await service.recover('LIFEOS-RECOVERY-V1:synthetic');

    expect(fixture.auth.current).toHaveBeenCalledOnce();
    expect(fixture.auth.ensureAnonymous).not.toHaveBeenCalled();
    expect(overview.installation).toMatchObject({
      deviceId: SECOND_DEVICE_ID,
      accountUserId: ACCOUNT_USER_ID,
      accountSessionId: ACCOUNT_SESSION_ID,
      accountEmail: 'person@example.com',
    });
  });
});

function createFixture(initial: SyncInstallation | null = null) {
  const installation = new MemoryInstallationRepository(initial);
  const cache = new MemoryDeviceCacheRepository();
  const auth: AccountAuth = {
    current: vi.fn(async () => null),
    ensureAnonymous: vi.fn(async () => ({
      userId: DEVICE_ID,
      sessionId: INVITE_ID,
      email: null,
      emailVerified: false,
      isAnonymous: true,
    })),
    beginRegistration: vi.fn(),
    resendVerification: vi.fn(),
    verifyEmail: vi.fn(),
    setPassword: vi.fn(),
    signIn: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    signOutCurrent: vi.fn(),
    close: vi.fn(async () => undefined),
  };
  const crypto: SyncCryptoService = {
    ensureDeviceIdentity: vi.fn(async () => ({ publicKey: encoded(32, 1) })),
    prepareFirstSpace: vi.fn(async () => ({
      publicKey: encoded(32, 1),
      encryptedDeviceName: encoded(32, 2),
      encryptedDeviceNameNonce: encoded(24, 3),
      recoveryAuthVerifier: encoded(32, 4),
      recoveryEnvelope: recoveryEnvelope(1),
      recoveryMaterial: 'LIFEOS-RECOVERY-V1:synthetic',
    })),
    exportRecoveryMaterial: vi.fn(async () => 'LIFEOS-RECOVERY-V1:synthetic'),
    requireRecoveryMaterial: vi.fn(async () => undefined),
    renderPairingQr: vi.fn(async () => '<svg aria-label="QR"></svg>'),
    wrapKeyRing: vi.fn(async (input: Parameters<SyncCryptoService['wrapKeyRing']>[0]) => ({
      metadata: {
        protocolVersion: 1 as const,
        purpose: input.purpose,
        spaceId: input.spaceId,
        recipientDeviceId: input.recipientDeviceId,
        keyEpoch: input.keyEpoch,
      },
      senderPublicKey: encoded(32, 1),
      ciphertext: encoded(32, 2),
      nonce: encoded(24, 3),
    })),
    unwrapAndStoreKeyRing: vi.fn(async () => undefined),
    prepareRecoveryAuthorization: vi.fn(async () => ({
      spaceId: SPACE_ID,
      authProof: encoded(32, 4),
    })),
    recoverAndStoreKeyRing: vi.fn(async () => undefined),
    encryptDeviceName: vi.fn(async () => recoveryEnvelope(1, 'device_name')),
    decryptDeviceName: vi.fn(async () => 'Расшифрованное устройство'),
    encryptPilotPayload: vi.fn(async ({ metadata }) => ({
      metadata,
      ciphertext: encoded(32, 8),
      nonce: encoded(24, 9),
    })),
    decryptPilotPayload: vi.fn(async () => 'synthetic'),
    encryptLocalSnapshot: vi.fn(async () => ({
      ciphertext: encoded(32, 10),
      nonce: encoded(24, 11),
    })),
    decryptLocalSnapshot: vi.fn(async () => 'synthetic'),
    prepareRotation: vi.fn(async (input: Parameters<SyncCryptoService['prepareRotation']>[0]) => ({
      keyEpoch: input.nextEpoch,
      envelopes: [
        {
          metadata: {
            protocolVersion: 1 as const,
            purpose: 'rotation' as const,
            spaceId: input.spaceId,
            recipientDeviceId: input.recipients[0]?.deviceId ?? DEVICE_ID,
            keyEpoch: input.nextEpoch,
          },
          senderPublicKey: encoded(32, 1),
          ciphertext: encoded(32, 2),
          nonce: encoded(24, 3),
        },
      ],
      recoveryEnvelope: recoveryEnvelope(input.nextEpoch),
    })),
    platform: vi.fn(async () => 'windows' as const),
  };
  const snapshot: SnapshotService = {
    createPreSyncSnapshot: vi.fn(async () => ({
      snapshotId: 'snapshot-1',
      createdAt: TIMESTAMP,
      databaseName: 'lifeos',
      databaseVersion: 20,
      recordCount: 0,
      sha256: 'synthetic',
    })),
    verifySnapshot: vi.fn(async () => ({
      valid: true,
      reason: 'ok' as const,
      snapshot: null,
    })),
  };
  const fetchPendingEnvelope = vi.fn<SyncTrustTransport['fetchPendingEnvelope']>(async () => null);
  const revokeDeviceAndAdvanceEpoch = vi.fn<SyncTrustTransport['revokeDeviceAndAdvanceEpoch']>(
    async () => ({ newKeyEpoch: 2, recipients: [] }),
  );
  const listDevices = vi.fn<SyncTrustTransport['listDevices']>(async () => []);
  const fetchMyRotationEnvelope = vi.fn<SyncTrustTransport['fetchMyRotationEnvelope']>(
    async () => null,
  );
  const transport: SyncTrustTransport = {
    adoptCurrentSpace: vi.fn(async () => ({ spaceId: SPACE_ID, currentKeyEpoch: 1 })),
    revokeCurrentDevice: vi.fn(async () => undefined),
    createFirstSpace: vi.fn(async () => ({ currentKeyEpoch: 1 as const })),
    createPairingInvite: vi.fn(async () => ({
      inviteId: INVITE_ID,
      expiresAt: '2026-09-04T00:05:00.000Z',
    })),
    cancelPairingInvite: vi.fn(async () => undefined),
    claimPairingInvite: vi.fn(async () => ({ spaceId: SPACE_ID, currentKeyEpoch: 1 })),
    listPendingPairingDevices: vi.fn(async () => []),
    publishKeyEnvelope: vi.fn(async () => undefined),
    fetchPendingEnvelope,
    acknowledgePairing: vi.fn(async () => undefined),
    beginRecovery: vi.fn(async () => ({
      currentKeyEpoch: 1,
      recoveryEnvelope: recoveryEnvelope(1),
    })),
    completeRecovery: vi.fn(async () => undefined),
    listDevices,
    fetchMyRotationEnvelope,
    revokeDeviceAndAdvanceEpoch,
    finalizeKeyEpochRotation: vi.fn(async () => undefined),
    updateMyDeviceName: vi.fn(async () => undefined),
  };
  const ids = initial === null ? [DEVICE_ID, SPACE_ID] : [SECOND_DEVICE_ID];
  const dependencies: SyncApplicationDependencies = {
    auth,
    crypto,
    installationRepository: installation,
    deviceCacheRepository: cache,
    snapshotService: snapshot,
    transport,
    projectRef: 'oytsyvmlkngsmpevbbct',
    createId: () => ids.shift() ?? SECOND_DEVICE_ID,
    now: () => new Date(TIMESTAMP),
  };
  return {
    dependencies,
    installation,
    cache,
    auth,
    crypto,
    snapshot,
    transport,
    fetchPendingEnvelope,
    revokeDeviceAndAdvanceEpoch,
    listDevices,
    fetchMyRotationEnvelope,
  };
}

class MemoryInstallationRepository implements SyncInstallationRepository {
  public readonly savedStates: SyncInstallation[] = [];
  public constructor(public value: SyncInstallation | null) {}
  public async find() {
    return this.value;
  }
  public async save(value: SyncInstallation) {
    this.value = value;
    this.savedStates.push(value);
  }
}

class MemoryDeviceCacheRepository implements SyncDeviceCacheRepository {
  private devices: readonly CachedSyncDevice[] = [];
  public async list() {
    return this.devices;
  }
  public async replaceForSpace(_spaceId: string, devices: readonly CachedSyncDevice[]) {
    this.devices = devices;
  }
}

function baseInstallation(): SyncInstallation {
  return {
    deviceId: DEVICE_ID,
    deviceName: 'Windows устройство',
    platform: 'windows',
    publicKey: encoded(32, 1),
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

function pendingInstallation(): SyncInstallation {
  return {
    ...baseInstallation(),
    spaceId: SPACE_ID,
    membershipStatus: 'pending',
    currentKeyEpoch: 1,
  };
}

function configuredInstallation(): SyncInstallation {
  return {
    ...baseInstallation(),
    spaceId: SPACE_ID,
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: TIMESTAMP,
    setupState: 'configured',
  };
}

function recoveryEnvelope(keyEpoch: number, purpose: 'recovery' | 'device_name' = 'recovery') {
  return {
    metadata: {
      protocolVersion: 1 as const,
      purpose,
      spaceId: SPACE_ID,
      recipientDeviceId: purpose === 'recovery' ? SPACE_ID : DEVICE_ID,
      keyEpoch,
    },
    ciphertext: encoded(32, 2),
    nonce: encoded(24, 3),
  };
}

function accountSession() {
  return {
    userId: ACCOUNT_USER_ID,
    sessionId: ACCOUNT_SESSION_ID,
    email: 'person@example.com',
    emailVerified: true,
    isAnonymous: false,
  } as const;
}

function encoded(length: number, value: number): string {
  let binary = '';
  for (const byte of new Uint8Array(length).fill(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
