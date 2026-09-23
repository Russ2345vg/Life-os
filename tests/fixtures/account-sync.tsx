import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AccountOverview, AccountSync } from '../../src/application';
import type { CachedSyncDevice } from '../../src/application/sync/ports/SyncDeviceCacheRepository';
import { DomainError } from '../../src/shared/errors/DomainError';
import { AccountSyncPage } from '../../src/presentation/planner-v2/AccountSyncPage';
import '../../src/presentation/styles/global.css';
import '../../src/presentation/planner-v2/planner-v2.css';

const EMAIL = 'person@example.com';
const RECOVERY = 'LIFEOS-RECOVERY-V1:fixture-private-material';

class FixtureAccountSync implements AccountSync {
  #overview = localOverview();
  #signOutAttempts = 0;

  public async load(): Promise<AccountOverview> {
    return structuredClone(this.#overview);
  }

  public async beginRegistration(email: string): Promise<AccountOverview> {
    if (email !== EMAIL) {
      throw new DomainError('account.email_invalid', 'Укажите корректный адрес электронной почты.');
    }
    this.#overview = { ...localOverview(), state: 'email_verification_pending', email };
    return this.load();
  }

  public async resendVerification(): Promise<void> {}

  public async verifyEmail(): Promise<AccountOverview> {
    return this.load();
  }

  public async setPasswordAndAdopt(): Promise<AccountOverview> {
    this.#overview = {
      ...localOverview(),
      state: 'recovery_confirmation_pending',
      email: this.#overview.email ?? EMAIL,
      connection: 'online',
      recoveryMaterial: RECOVERY,
    };
    return this.load();
  }

  public async confirmRecoverySaved(): Promise<AccountOverview> {
    this.#overview = readyOverview();
    return this.load();
  }

  public async revealRecoveryMaterial(): Promise<AccountOverview> {
    this.#overview = { ...this.#overview, recoveryMaterial: RECOVERY };
    return this.load();
  }

  public async signIn(email: string): Promise<AccountOverview> {
    this.#overview = {
      ...localOverview(),
      state: 'recovery_confirmation_pending',
      email,
      connection: 'online',
    };
    return this.load();
  }

  public async recoverDevice(): Promise<AccountOverview> {
    this.#overview = readyOverview();
    return this.load();
  }

  public async requestPasswordReset(): Promise<void> {}

  public async updatePassword(): Promise<AccountOverview> {
    return this.load();
  }

  public async syncNow(): Promise<AccountOverview> {
    this.#overview = {
      ...readyOverview(),
      connection: 'offline',
      pendingMutations: 2,
      conflicts: 1,
    };
    return this.load();
  }

  public async revokeDevice(deviceId: string): Promise<AccountOverview> {
    this.#overview = {
      ...this.#overview,
      devices: this.#overview.devices.map((device) =>
        device.deviceId === deviceId
          ? { ...device, status: 'revoked', revokedAt: new Date().toISOString() }
          : device,
      ),
    };
    return this.load();
  }

  public async signOut(): Promise<void> {
    this.#signOutAttempts += 1;
    if (this.#signOutAttempts === 1) {
      throw new DomainError('account.sign_out_blocked', 'Fixture keeps pending changes.');
    }
    this.#overview = localOverview();
  }
}

function localOverview(): AccountOverview {
  return {
    state: 'local_anonymous',
    email: null,
    emailVerified: false,
    connection: 'local',
    recoveryMaterial: null,
    pendingMutations: 0,
    conflicts: 0,
    devices: [],
  };
}

function readyOverview(): AccountOverview {
  return {
    state: 'ready',
    email: EMAIL,
    emailVerified: true,
    connection: 'online',
    recoveryMaterial: null,
    pendingMutations: 0,
    conflicts: 0,
    devices: [device('fixture-windows', 'Ноутбук', 'windows')],
  };
}

function device(
  deviceId: string,
  displayName: string,
  platform: CachedSyncDevice['platform'],
): CachedSyncDevice {
  return {
    deviceId,
    spaceId: 'fixture-space',
    encryptedName: null,
    encryptedNameNonce: null,
    encryptedNameKeyEpoch: null,
    displayName,
    platform,
    publicKey: 'fixture-public-key',
    status: 'active',
    createdAt: '2026-09-22T08:00:00.000Z',
    activatedAt: '2026-09-22T08:00:00.000Z',
    lastSeenAt: '2026-09-22T10:00:00.000Z',
    revokedAt: null,
    updatedAt: '2026-09-22T10:00:00.000Z',
  };
}

const root = document.getElementById('root');
if (root === null) throw new Error('Fixture root is missing.');

createRoot(root).render(
  <StrictMode>
    <div className="planner-v2 account-fixture" style={{ display: 'block', minHeight: '100vh' }}>
      <main className="planner-content">
        <AccountSyncPage service={new FixtureAccountSync()} onBack={() => undefined} />
      </main>
    </div>
  </StrictMode>,
);
