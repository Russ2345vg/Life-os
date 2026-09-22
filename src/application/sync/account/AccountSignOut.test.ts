import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../../shared/errors/DomainError';
import type { SyncRecovery, RecoverySnapshot } from '../recovery/SyncRecovery';
import type { SyncApplication } from '../SyncApplicationService';
import type { SyncCryptoService } from '../ports/SyncCryptoService';
import type {
  SyncInstallation,
  SyncInstallationRepository,
} from '../ports/SyncInstallationRepository';
import type { AccountLocalData } from './AccountLocalData';
import type { AccountAuth } from './AccountAuth';
import { AccountSyncService } from './AccountSyncService';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const SPACE_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';
const SESSION_ID = '40000000-0000-4000-8000-000000000001';
const SNAPSHOT_ID = '50000000-0000-4000-8000-000000000001';
const SIGN_OUT_SNAPSHOT_ID = '60000000-0000-4000-8000-000000000001';
const NOW = '2026-09-22T12:00:00.000Z';

describe('AccountSyncService safe sign-out', () => {
  it('purges only after sync, cloud backup, revoke, auth sign-out and native secret deletion', async () => {
    const fixture = signOutFixture();

    await fixture.service.signOut();

    expect(fixture.order).toEqual([
      'persist:sign_out_pending',
      'sync',
      'snapshot:create',
      'persist:sign_out_pending',
      'snapshot:verify-cloud',
      'revoke',
      'persist:sign_out_pending',
      'auth:sign-out',
      'secrets:delete',
      'local:purge',
    ]);
    expect(fixture.crypto.deleteDeviceSecrets).toHaveBeenCalledWith(DEVICE_ID, SPACE_ID);
  });

  it.each([
    ['pending mutations', 'sync'],
    ['backup verification', 'backup'],
    ['device revoke', 'revoke'],
    ['auth sign-out', 'auth'],
  ] as const)('retains readable local data when %s fails', async (_label, failure) => {
    const fixture = signOutFixture(failure);

    await expect(fixture.service.signOut()).rejects.toBeDefined();

    expect(fixture.localData.purge).not.toHaveBeenCalled();
    if (failure !== 'auth') expect(fixture.crypto.deleteDeviceSecrets).not.toHaveBeenCalled();
    expect(fixture.installations.value).not.toBeNull();
    expect(fixture.installations.value?.accountSetupState).toBe('sign_out_pending');
  });

  it('resumes after auth interruption without revoking or recreating the verified snapshot', async () => {
    const fixture = signOutFixture('auth');

    await expect(fixture.service.signOut()).rejects.toBeDefined();
    fixture.auth.signOutCurrent.mockResolvedValue(undefined);
    await fixture.service.signOut();

    expect(fixture.transport.revokeCurrentDevice).toHaveBeenCalledTimes(1);
    expect(fixture.recovery.createSnapshot).toHaveBeenCalledTimes(1);
    expect(fixture.recovery.ensureCloudVerified).toHaveBeenCalledTimes(2);
    expect(fixture.localData.purge).toHaveBeenCalledOnce();
  });
});

function signOutFixture(failure?: 'sync' | 'backup' | 'revoke' | 'auth') {
  const order: string[] = [];
  const installations = new MemoryInstallationRepository(readyInstallation(), order);
  const auth = {
    current: vi.fn(),
    ensureAnonymous: vi.fn(),
    beginRegistration: vi.fn(),
    resendVerification: vi.fn(),
    verifyEmail: vi.fn(),
    setPassword: vi.fn(),
    signIn: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    signOutCurrent: vi.fn(async () => {
      order.push('auth:sign-out');
      if (failure === 'auth') throw new DomainError('account.auth_unavailable', 'Недоступно.');
    }),
    close: vi.fn(),
  } satisfies AccountAuth;
  const sync = {
    syncPilotNow: vi.fn(async () => {
      order.push('sync');
      return {
        pending: failure === 'sync' ? 1 : 0,
        conflicts: 0,
        quarantined: 0,
        lastSequence: 12,
      };
    }),
    pilotStatus: vi.fn(() => ({
      state: 'idle' as const,
      pendingCount: 0,
      conflictCount: 0,
      lastSuccessfulSyncAt: NOW,
    })),
  } as unknown as SyncApplication;
  const snapshot = signOutSnapshot();
  let snapshotCreated = false;
  const recovery = {
    listSnapshots: vi.fn(async () =>
      snapshotCreated ? ([snapshot] as readonly RecoverySnapshot[]) : [],
    ),
    createSnapshot: vi.fn(async () => {
      order.push('snapshot:create');
      snapshotCreated = true;
      return snapshot;
    }),
    ensureCloudVerified: vi.fn(async () => {
      order.push('snapshot:verify-cloud');
      if (failure === 'backup') {
        throw new DomainError('sync.backup_not_verified', 'Копия не подтверждена.');
      }
      return { ...snapshot, cloudVerifiedAt: NOW };
    }),
  } as unknown as SyncRecovery;
  const transport = {
    adoptCurrentSpace: vi.fn(),
    revokeCurrentDevice: vi.fn(async () => {
      order.push('revoke');
      if (failure === 'revoke') throw new Error('revoke failed');
    }),
  };
  const crypto = {
    deleteDeviceSecrets: vi.fn(async () => {
      order.push('secrets:delete');
    }),
  } as unknown as SyncCryptoService;
  const localData = {
    purge: vi.fn(async () => {
      order.push('local:purge');
    }),
  } satisfies AccountLocalData;
  const service = new AccountSyncService({
    auth,
    installations,
    snapshots: {} as never,
    sync,
    transport,
    crypto,
    recovery,
    localData,
    now: () => new Date(NOW),
  });
  return { service, order, installations, auth, sync, recovery, transport, crypto, localData };
}

class MemoryInstallationRepository implements SyncInstallationRepository {
  public constructor(
    public value: SyncInstallation | null,
    private readonly order: string[],
  ) {}
  public async find() {
    return this.value;
  }
  public async save(value: SyncInstallation) {
    this.value = structuredClone(value);
    this.order.push(`persist:${value.accountSetupState}`);
  }
}

function readyInstallation(): SyncInstallation {
  return {
    deviceId: DEVICE_ID,
    deviceName: 'Windows PC',
    platform: 'windows',
    publicKey: 'public-key',
    createdAt: NOW,
    spaceId: SPACE_ID,
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: NOW,
    snapshotId: SNAPSHOT_ID,
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: NOW,
    accountSetupState: 'ready',
    accountUserId: USER_ID,
    accountSessionId: SESSION_ID,
    accountEmail: 'person@example.com',
    accountMigrationSnapshotId: null,
  };
}

function signOutSnapshot(): RecoverySnapshot {
  return {
    snapshotId: SIGN_OUT_SNAPSHOT_ID,
    kind: 'pre-sign-out',
    spaceId: SPACE_ID,
    createdAt: NOW,
    metadata: {
      protocolVersion: 1,
      purpose: 'snapshot',
      spaceId: SPACE_ID,
      objectId: SIGN_OUT_SNAPSHOT_ID,
      keyEpoch: 1,
      blobVersion: 1,
      snapshotKind: 'pre-sign-out',
      schemaVersion: 1,
    },
    encryptedBlob: 'ciphertext',
    sha256: 'hash',
    verifiedAt: NOW,
    cloudVerifiedAt: null,
    retainedUntil: '2026-12-15T12:00:00.000Z',
    nextAttemptAt: NOW,
    retryCount: 0,
  };
}
