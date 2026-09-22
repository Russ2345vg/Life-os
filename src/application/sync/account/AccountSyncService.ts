import { DomainError } from '../../../shared/errors/DomainError';
import type { SnapshotService } from '../SnapshotService';
import type { SyncApplication, SyncOverview } from '../SyncApplicationService';
import type { CachedSyncDevice } from '../ports/SyncDeviceCacheRepository';
import type { SyncCryptoService } from '../ports/SyncCryptoService';
import type {
  AccountSetupState,
  SyncInstallation,
  SyncInstallationRepository,
} from '../ports/SyncInstallationRepository';
import type { SyncTrustTransport } from '../ports/SyncTrustTransport';
import type { PilotSyncRunResult } from '../pilot/PilotSyncCoordinator';
import type { AccountAuth, AccountSession } from './AccountAuth';

export interface AccountOverview {
  readonly state: AccountSetupState;
  readonly email: string | null;
  readonly connection: 'local' | 'online' | 'offline';
  readonly recoveryMaterial: string | null;
  readonly pendingMutations: number;
  readonly conflicts: number;
  readonly devices: readonly CachedSyncDevice[];
}

export interface AccountSync {
  load(): Promise<AccountOverview>;
  beginRegistration(email: string): Promise<AccountOverview>;
  resendVerification(): Promise<void>;
  verifyEmail(token: string): Promise<AccountOverview>;
  setPasswordAndAdopt(password: string): Promise<AccountOverview>;
  confirmRecoverySaved(): Promise<AccountOverview>;
  signIn(email: string, password: string): Promise<AccountOverview>;
  recoverDevice(recoveryMaterial: string): Promise<AccountOverview>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<AccountOverview>;
  syncNow(): Promise<AccountOverview>;
  revokeDevice(deviceId: string): Promise<AccountOverview>;
  signOut(): Promise<void>;
}

export interface AccountSyncDependencies {
  readonly auth: AccountAuth;
  readonly installations: SyncInstallationRepository;
  readonly snapshots: SnapshotService;
  readonly sync: SyncApplication;
  readonly transport: Pick<SyncTrustTransport, 'adoptCurrentSpace'>;
  readonly crypto: Pick<SyncCryptoService, 'deleteDeviceSecrets'>;
  readonly now?: () => Date;
}

export class AccountSyncService implements AccountSync {
  private readonly now: () => Date;

  public constructor(private readonly dependencies: AccountSyncDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public async load(): Promise<AccountOverview> {
    const overview = await this.dependencies.sync.loadOverview();
    if (overview.installation.accountSetupState === 'account_migration_pending') {
      return this.resumeMigration(overview.installation);
    }
    if (
      overview.installation.accountSetupState === 'recovery_confirmation_pending' &&
      overview.installation.membershipStatus === 'active' &&
      overview.installation.setupState === 'configured'
    ) {
      return this.finishRecoveryConvergence(overview);
    }
    return this.present(overview);
  }

  public async beginRegistration(email: string): Promise<AccountOverview> {
    const overview = await this.dependencies.sync.loadOverview();
    if (overview.installation.accountSetupState !== 'local_anonymous') {
      throw invalidTransition('Регистрация аккаунта уже начата.');
    }
    const session = await this.dependencies.auth.beginRegistration(email);
    const updated = await this.saveSession(
      overview.installation,
      session,
      'email_verification_pending',
    );
    return this.present({ ...overview, installation: updated });
  }

  public async resendVerification(): Promise<void> {
    const installation = await this.requireInstallation('email_verification_pending');
    if (installation.accountEmail === null) throw invalidAccountState();
    await this.dependencies.auth.resendVerification(installation.accountEmail);
  }

  public async verifyEmail(token: string): Promise<AccountOverview> {
    const installation = await this.requireInstallation('email_verification_pending');
    if (installation.accountEmail === null) throw invalidAccountState();
    const session = await this.dependencies.auth.verifyEmail(installation.accountEmail, token);
    if (!session.emailVerified) throw invalidAccountState();
    const updated = await this.saveSession(installation, session, 'email_verification_pending');
    return this.present(await this.overviewWith(updated));
  }

  public async setPasswordAndAdopt(password: string): Promise<AccountOverview> {
    const installation = await this.requireInstallation('email_verification_pending');
    const session = requirePermanentSession(await this.dependencies.auth.setPassword(password));
    const snapshot = await this.dependencies.snapshots.createPreSyncSnapshot();
    await this.requireVerifiedSnapshot(snapshot.snapshotId);
    const pending: SyncInstallation = {
      ...installation,
      accountSetupState: 'account_migration_pending',
      accountUserId: session.userId,
      accountSessionId: session.sessionId,
      accountEmail: requireEmail(session),
      accountMigrationSnapshotId: snapshot.snapshotId,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installations.save(pending);
    return this.resumeMigration(pending);
  }

  public async confirmRecoverySaved(): Promise<AccountOverview> {
    await this.requireInstallation('recovery_confirmation_pending');
    const overview = await this.dependencies.sync.confirmRecoverySaved();
    const updated: SyncInstallation = {
      ...overview.installation,
      accountSetupState: 'ready',
      accountMigrationSnapshotId: null,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installations.save(updated);
    return this.present({ ...overview, installation: updated });
  }

  public async signIn(email: string, password: string): Promise<AccountOverview> {
    const overview = await this.dependencies.sync.loadOverview();
    const session = requirePermanentSession(await this.dependencies.auth.signIn(email, password));
    const updated = await this.saveSession(
      overview.installation,
      session,
      'recovery_confirmation_pending',
    );
    return this.present({ ...overview, installation: updated, connection: 'online' });
  }

  public async recoverDevice(recoveryMaterial: string): Promise<AccountOverview> {
    const installation = await this.requireInstallation('recovery_confirmation_pending');
    const session = requirePermanentSession(await this.requireCurrentSession(installation));
    const overview = await this.dependencies.sync.recover(recoveryMaterial);
    const recovered = await this.saveSession(
      overview.installation,
      session,
      'recovery_confirmation_pending',
    );
    return this.finishRecoveryConvergence({ ...overview, installation: recovered });
  }

  public async requestPasswordReset(email: string): Promise<void> {
    await this.dependencies.auth.requestPasswordReset(email);
  }

  public async updatePassword(password: string): Promise<AccountOverview> {
    const installation = await this.requireInstallation();
    if (installation.accountSetupState === 'local_anonymous') throw invalidAccountState();
    const session = requirePermanentSession(await this.dependencies.auth.updatePassword(password));
    const updated = await this.saveSession(installation, session, installation.accountSetupState);
    return this.present(await this.overviewWith(updated));
  }

  public async syncNow(): Promise<AccountOverview> {
    await this.dependencies.sync.syncPilotNow();
    return this.load();
  }

  public async revokeDevice(deviceId: string): Promise<AccountOverview> {
    return this.present(await this.dependencies.sync.revokeDevice(deviceId));
  }

  public async signOut(): Promise<void> {
    await this.dependencies.auth.signOutCurrent();
  }

  private async resumeMigration(installation: SyncInstallation): Promise<AccountOverview> {
    await this.requireCurrentSession(installation);
    if (installation.accountMigrationSnapshotId === null) throw invalidAccountState();
    await this.requireVerifiedSnapshot(installation.accountMigrationSnapshotId);

    let migrated: SyncInstallation;
    let recoveryMaterial: string | null = null;
    if (installation.spaceId === null) {
      const setup = await this.dependencies.sync.setupFirstSpace();
      migrated = setup.overview.installation;
      recoveryMaterial = setup.recoveryMaterial;
    } else {
      if (installation.currentKeyEpoch === null) throw invalidAccountState();
      const adopted = await this.dependencies.transport.adoptCurrentSpace(installation.deviceId);
      if (
        adopted.spaceId !== installation.spaceId ||
        adopted.currentKeyEpoch !== installation.currentKeyEpoch
      ) {
        throw new DomainError(
          'account.adoption_mismatch',
          'Сервер вернул другое пространство синхронизации.',
        );
      }
      migrated = installation;
    }

    const report = await this.dependencies.sync.syncPilotNow();
    requireConverged(report);
    const accountSetupState =
      migrated.setupState === 'recovery_unconfirmed' ? 'recovery_confirmation_pending' : 'ready';
    const completed: SyncInstallation = {
      ...migrated,
      accountSetupState,
      accountUserId: installation.accountUserId,
      accountSessionId: installation.accountSessionId,
      accountEmail: installation.accountEmail,
      accountMigrationSnapshotId: null,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installations.save(completed);
    const overview = await this.overviewWith(completed);
    return this.present(overview, recoveryMaterial, report);
  }

  private async finishRecoveryConvergence(overview: SyncOverview): Promise<AccountOverview> {
    const installation = overview.installation;
    if (installation.spaceId === null || installation.currentKeyEpoch === null) {
      throw invalidAccountState();
    }
    const report = await this.dependencies.sync.syncPilotNow();
    try {
      requireConverged(report);
    } catch (error) {
      await this.dependencies.crypto.deleteDeviceSecrets(
        installation.deviceId,
        installation.spaceId,
      );
      await this.dependencies.installations.save({
        ...installation,
        membershipStatus: 'pending',
        recoveryConfirmedAt: null,
        setupState: 'not_configured',
        accountSetupState: 'recovery_confirmation_pending',
        updatedAt: this.now().toISOString(),
      });
      throw error;
    }
    const ready: SyncInstallation = {
      ...installation,
      accountSetupState: 'ready',
      accountMigrationSnapshotId: null,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installations.save(ready);
    return this.present({ ...overview, installation: ready }, null, report);
  }

  private async requireVerifiedSnapshot(snapshotId: string): Promise<void> {
    const verification = await this.dependencies.snapshots.verifySnapshot(snapshotId);
    if (!verification.valid) {
      throw new DomainError(
        'account.snapshot_invalid',
        'Не удалось проверить локальную резервную копию.',
      );
    }
  }

  private async requireCurrentSession(installation: SyncInstallation): Promise<AccountSession> {
    const session = await this.dependencies.auth.current();
    if (
      session === null ||
      session.userId !== installation.accountUserId ||
      session.sessionId !== installation.accountSessionId ||
      session.email !== installation.accountEmail
    ) {
      throw invalidAccountState();
    }
    return session;
  }

  private async requireInstallation(expectedState?: AccountSetupState): Promise<SyncInstallation> {
    const installation = await this.dependencies.installations.find();
    if (
      installation === null ||
      (expectedState !== undefined && installation.accountSetupState !== expectedState)
    ) {
      throw invalidAccountState();
    }
    return installation;
  }

  private async saveSession(
    installation: SyncInstallation,
    session: AccountSession,
    accountSetupState: AccountSetupState,
  ): Promise<SyncInstallation> {
    const updated: SyncInstallation = {
      ...installation,
      accountSetupState,
      accountUserId: session.userId,
      accountSessionId: session.sessionId,
      accountEmail: requireEmail(session),
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installations.save(updated);
    return updated;
  }

  private async overviewWith(installation: SyncInstallation): Promise<SyncOverview> {
    const overview = await this.dependencies.sync.loadOverview();
    return { ...overview, installation };
  }

  private present(
    overview: SyncOverview,
    recoveryMaterial: string | null = null,
    report?: PilotSyncRunResult,
  ): AccountOverview {
    const pilot = this.dependencies.sync.pilotStatus();
    return {
      state: overview.installation.accountSetupState,
      email: overview.installation.accountEmail,
      connection: overview.connection,
      recoveryMaterial,
      pendingMutations: report?.pending ?? pilot.pendingCount,
      conflicts: report?.conflicts ?? pilot.conflictCount,
      devices: overview.devices,
    };
  }
}

function requirePermanentSession(session: AccountSession): AccountSession {
  if (session.isAnonymous || !session.emailVerified || session.email === null) {
    throw invalidAccountState();
  }
  return session;
}

function requireEmail(session: AccountSession): string {
  if (session.email === null) throw invalidAccountState();
  return session.email;
}

function invalidTransition(message: string): DomainError {
  return new DomainError('account.transition_invalid', message);
}

function invalidAccountState(): DomainError {
  return new DomainError('account.state_invalid', 'Состояние аккаунта повреждено или устарело.');
}

function requireConverged(report: PilotSyncRunResult): void {
  if (report.pending !== 0 || report.quarantined !== 0 || report.lastSequence === null) {
    throw new DomainError(
      'account.convergence_incomplete',
      'Первичная синхронизация не завершена. Повторите попытку.',
    );
  }
}
