import type { SnapshotService } from './SnapshotService';
import type { SyncStatusSource } from './SyncStatus';
import type { SyncRecovery } from './recovery/SyncRecovery';
import {
  createPairingSecret,
  parsePairingPayload,
  serializePairingPayload,
} from './PairingPayload';
import type {
  CachedSyncDevice,
  SyncDeviceCacheRepository,
} from './ports/SyncDeviceCacheRepository';
import type {
  SyncCryptoEnvelope,
  SyncCryptoService,
  SyncRecoveryEnvelope,
} from './ports/SyncCryptoService';
import type {
  SyncInstallation,
  SyncInstallationRepository,
  SyncPlatform,
} from './ports/SyncInstallationRepository';
import type { TechnicalSyncAuth } from './ports/TechnicalSyncAuth';
import type { SyncTrustTransport } from './ports/SyncTrustTransport';
import type { PilotSyncCoordinator, PilotSyncStatus } from './pilot/PilotSyncCoordinator';

export type SyncConnectionState = 'local' | 'online' | 'offline';

export interface SyncOverview {
  readonly installation: SyncInstallation;
  readonly devices: readonly CachedSyncDevice[];
  readonly connection: SyncConnectionState;
  readonly warning: string | null;
}

export interface SyncPairingInvitation {
  readonly inviteId: string;
  readonly expiresAt: string;
  readonly payload: string;
  readonly qrSvg: string;
}

export interface SyncApplication {
  readonly statusSource?: SyncStatusSource | undefined;
  readonly recovery?: SyncRecovery | undefined;
  loadOverview(): Promise<SyncOverview>;
  setupFirstSpace(): Promise<{
    readonly overview: SyncOverview;
    readonly recoveryMaterial: string;
  }>;
  confirmRecoverySaved(): Promise<SyncOverview>;
  exportRecoveryMaterial(): Promise<string>;
  createPairingInvitation(): Promise<SyncPairingInvitation>;
  cancelPairingInvitation(inviteId: string): Promise<void>;
  fulfillPendingPairings(): Promise<number>;
  claimPairingPayload(payload: string): Promise<SyncOverview>;
  completePendingPairing(): Promise<boolean>;
  recover(recoveryMaterial: string): Promise<SyncOverview>;
  revokeDevice(deviceId: string): Promise<SyncOverview>;
  retryPendingRotation(): Promise<SyncOverview>;
  updateDeviceName(deviceName: string): Promise<SyncOverview>;
  pilotStatus(): PilotSyncStatus;
  subscribePilotStatus(listener: (status: PilotSyncStatus) => void): () => void;
  syncPilotNow(): Promise<void>;
  notifyPilotMutation(): void;
  close(): Promise<void>;
}

export interface SyncApplicationDependencies {
  readonly statusSource?: SyncStatusSource;
  readonly recovery?: SyncRecovery;
  readonly auth: TechnicalSyncAuth;
  readonly crypto: SyncCryptoService;
  readonly installationRepository: SyncInstallationRepository;
  readonly deviceCacheRepository: SyncDeviceCacheRepository;
  readonly snapshotService: SnapshotService;
  readonly transport: SyncTrustTransport;
  readonly projectRef: string;
  readonly createId: () => string;
  readonly now?: () => Date;
  readonly random?: Crypto;
  readonly pilotCoordinator?: PilotSyncCoordinator;
  readonly pilotLifecycle?: { close(): void };
}

export class SyncApplicationService implements SyncApplication {
  public get statusSource(): SyncStatusSource | undefined {
    return this.dependencies.statusSource;
  }
  public get recovery(): SyncRecovery | undefined {
    return this.dependencies.recovery;
  }
  private readonly now: () => Date;
  private readonly random: Crypto;

  public constructor(private readonly dependencies: SyncApplicationDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.random = dependencies.random ?? globalThis.crypto;
  }

  public async loadOverview(): Promise<SyncOverview> {
    let installation = await this.ensureInstallation();
    if (installation.spaceId === null || installation.membershipStatus !== 'active') {
      return { installation, devices: [], connection: 'local', warning: null };
    }
    if (installation.currentKeyEpoch === null) {
      throw new Error('Active Sync installation has no key epoch.');
    }
    const spaceId = installation.spaceId;
    const localKeyEpoch = installation.currentKeyEpoch;
    try {
      await this.dependencies.auth.ensureIdentity();
      const rotation = await this.dependencies.transport.fetchMyRotationEnvelope(localKeyEpoch);
      if (rotation !== null) {
        await this.dependencies.crypto.unwrapAndStoreKeyRing(
          installation.deviceId,
          rotation.envelope,
        );
        installation = {
          ...installation,
          currentKeyEpoch: rotation.currentKeyEpoch,
          updatedAt: this.now().toISOString(),
        };
        await this.dependencies.installationRepository.save(installation);
      }
      const encryptedDevices = await this.dependencies.transport.listDevices(spaceId);
      const devices = await Promise.all(
        encryptedDevices.map(async (device) => ({
          ...device,
          displayName:
            device.encryptedName === null ||
            device.encryptedNameNonce === null ||
            device.encryptedNameKeyEpoch === null
              ? device.displayName
              : await this.dependencies.crypto.decryptDeviceName({
                  metadata: {
                    protocolVersion: 1,
                    purpose: 'device_name',
                    spaceId: device.spaceId,
                    recipientDeviceId: device.deviceId,
                    keyEpoch: device.encryptedNameKeyEpoch,
                  },
                  ciphertext: device.encryptedName,
                  nonce: device.encryptedNameNonce,
                }),
        })),
      );
      if (installation.setupState === 'not_configured') {
        await this.dependencies.crypto.exportRecoveryMaterial(spaceId);
        installation = {
          ...installation,
          setupState: 'configured',
          recoveryConfirmedAt: installation.recoveryConfirmedAt ?? this.now().toISOString(),
          updatedAt: this.now().toISOString(),
        };
        await this.dependencies.installationRepository.save(installation);
      }
      await this.dependencies.deviceCacheRepository.replaceForSpace(spaceId, devices);
      return { installation, devices, connection: 'online', warning: null };
    } catch {
      const devices = await this.dependencies.deviceCacheRepository.list(spaceId);
      return {
        installation,
        devices,
        connection: 'offline',
        warning: 'Нет соединения. Показано последнее сохранённое состояние устройств.',
      };
    }
  }

  public async setupFirstSpace() {
    const installation = await this.ensureInstallation();
    requireNotConfigured(installation);
    await this.dependencies.auth.ensureIdentity();
    const snapshot = await this.dependencies.snapshotService.createPreSyncSnapshot();
    const verification = await this.dependencies.snapshotService.verifySnapshot(
      snapshot.snapshotId,
    );
    if (!verification.valid) throw new Error('Pre-sync local snapshot verification failed.');
    const spaceId = this.dependencies.createId();
    const prepared = await this.dependencies.crypto.prepareFirstSpace({
      deviceId: installation.deviceId,
      spaceId,
      deviceName: installation.deviceName,
    });
    const result = await this.dependencies.transport.createFirstSpace({
      spaceId,
      deviceId: installation.deviceId,
      publicKey: prepared.publicKey,
      encryptedDeviceName: prepared.encryptedDeviceName,
      encryptedDeviceNameNonce: prepared.encryptedDeviceNameNonce,
      platform: installation.platform,
      recoveryAuthVerifier: prepared.recoveryAuthVerifier,
      recoveryEnvelope: prepared.recoveryEnvelope,
    });
    const updated: SyncInstallation = {
      ...installation,
      publicKey: prepared.publicKey,
      spaceId,
      membershipStatus: 'active',
      currentKeyEpoch: result.currentKeyEpoch,
      snapshotId: snapshot.snapshotId,
      setupState: 'recovery_unconfirmed',
      pendingRevokedDeviceId: null,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(updated);
    return {
      overview: {
        installation: updated,
        devices: [],
        connection: 'online' as const,
        warning: null,
      },
      recoveryMaterial: prepared.recoveryMaterial,
    };
  }

  public async confirmRecoverySaved(): Promise<SyncOverview> {
    const installation = await this.requireInstallation();
    if (installation.setupState !== 'recovery_unconfirmed') {
      throw new Error('Recovery confirmation is not expected.');
    }
    const updated: SyncInstallation = {
      ...installation,
      recoveryConfirmedAt: this.now().toISOString(),
      setupState: 'configured',
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(updated);
    return { installation: updated, devices: [], connection: 'online', warning: null };
  }

  public async exportRecoveryMaterial(): Promise<string> {
    const installation = await this.requireActiveInstallation();
    return this.dependencies.crypto.exportRecoveryMaterial(installation.spaceId);
  }

  public async updateDeviceName(deviceName: string): Promise<SyncOverview> {
    const installation = await this.requireActiveInstallation();
    const normalized = deviceName.trim();
    if (normalized.length === 0 || normalized.length > 64) {
      throw new Error('Имя устройства должно содержать от 1 до 64 символов.');
    }
    const envelope = await this.dependencies.crypto.encryptDeviceName({
      spaceId: installation.spaceId,
      deviceId: installation.deviceId,
      keyEpoch: installation.currentKeyEpoch,
      deviceName: normalized,
    });
    await this.dependencies.transport.updateMyDeviceName({
      ciphertext: envelope.ciphertext,
      nonce: envelope.nonce,
      keyEpoch: envelope.metadata.keyEpoch,
    });
    await this.dependencies.installationRepository.save({
      ...installation,
      deviceName: normalized,
      updatedAt: this.now().toISOString(),
    });
    return this.loadOverview();
  }

  public async createPairingInvitation(): Promise<SyncPairingInvitation> {
    const installation = await this.requireConfiguredInstallation();
    await this.dependencies.auth.ensureIdentity();
    const secret = await createPairingSecret(this.random);
    const invitation = await this.dependencies.transport.createPairingInvite(secret.secretHashHex);
    const payload = serializePairingPayload({
      protocol: 'lifeos-sync-pair-v1',
      projectRef: this.dependencies.projectRef,
      inviteId: invitation.inviteId,
      secret: secret.secret,
      trustedDeviceId: installation.deviceId,
      expiresAt: invitation.expiresAt,
    });
    return {
      ...invitation,
      payload,
      qrSvg: await this.dependencies.crypto.renderPairingQr(payload),
    };
  }

  public async cancelPairingInvitation(inviteId: string): Promise<void> {
    await this.dependencies.auth.ensureIdentity();
    await this.dependencies.transport.cancelPairingInvite(inviteId);
  }

  public async fulfillPendingPairings(): Promise<number> {
    const installation = await this.requireConfiguredInstallation();
    await this.dependencies.auth.ensureIdentity();
    const devices = await this.dependencies.transport.listPendingPairingDevices();
    for (const device of devices) {
      const envelope = await this.dependencies.crypto.wrapKeyRing({
        spaceId: installation.spaceId,
        senderDeviceId: installation.deviceId,
        recipientDeviceId: device.deviceId,
        recipientPublicKey: device.publicKey,
        keyEpoch: installation.currentKeyEpoch,
        purpose: 'pairing',
      });
      await this.dependencies.transport.publishKeyEnvelope(envelope);
    }
    return devices.length;
  }

  public async claimPairingPayload(payload: string): Promise<SyncOverview> {
    const invitation = parsePairingPayload(payload, this.dependencies.projectRef, this.now());
    const installation = await this.ensureInstallation();
    requireNotConfigured(installation);
    await this.dependencies.auth.ensureIdentity();
    const identity = await this.dependencies.crypto.ensureDeviceIdentity(
      installation.deviceId,
      false,
    );
    const claim = await this.dependencies.transport.claimPairingInvite({
      inviteId: invitation.inviteId,
      secretHex: invitation.secret,
      deviceId: installation.deviceId,
      publicKey: identity.publicKey,
      platform: installation.platform,
    });
    const updated: SyncInstallation = {
      ...installation,
      publicKey: identity.publicKey,
      spaceId: claim.spaceId,
      membershipStatus: 'pending',
      currentKeyEpoch: claim.currentKeyEpoch,
      setupState: 'not_configured',
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(updated);
    return { installation: updated, devices: [], connection: 'online', warning: null };
  }

  public async completePendingPairing(): Promise<boolean> {
    const installation = await this.requireInstallation();
    if (
      installation.membershipStatus !== 'pending' ||
      installation.spaceId === null ||
      installation.currentKeyEpoch === null
    ) {
      throw new Error('This device is not waiting for a pairing envelope.');
    }
    await this.dependencies.auth.ensureIdentity();
    const envelope = await this.dependencies.transport.fetchPendingEnvelope();
    if (envelope === null) return false;
    await this.dependencies.crypto.unwrapAndStoreKeyRing(installation.deviceId, envelope);
    const encryptedName = await this.dependencies.crypto.encryptDeviceName({
      spaceId: installation.spaceId,
      deviceId: installation.deviceId,
      keyEpoch: installation.currentKeyEpoch,
      deviceName: installation.deviceName,
    });
    await this.dependencies.transport.acknowledgePairing({
      deviceId: installation.deviceId,
      envelopeSha256Hex: await envelopeDigest(envelope, this.random),
      encryptedDeviceName: encryptedName.ciphertext,
      encryptedDeviceNameNonce: encryptedName.nonce,
    });
    const updated: SyncInstallation = {
      ...installation,
      membershipStatus: 'active',
      setupState: 'configured',
      recoveryConfirmedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(updated);
    return true;
  }

  public async recover(recoveryMaterial: string): Promise<SyncOverview> {
    let installation = await this.ensureInstallation();
    const authorization =
      await this.dependencies.crypto.prepareRecoveryAuthorization(recoveryMaterial);
    if (installation.spaceId !== null || installation.membershipStatus !== null) {
      if (
        installation.setupState !== 'configured' ||
        installation.spaceId === null ||
        installation.spaceId !== authorization.spaceId
      ) {
        throw new Error('Recovery key does not match this Sync installation.');
      }
      const snapshot = await this.dependencies.snapshotService.createPreSyncSnapshot();
      const verification = await this.dependencies.snapshotService.verifySnapshot(
        snapshot.snapshotId,
      );
      if (!verification.valid) {
        throw new Error('Pre-sync local snapshot verification failed.');
      }
      const replacementDeviceId = this.dependencies.createId();
      const replacementIdentity = await this.dependencies.crypto.ensureDeviceIdentity(
        replacementDeviceId,
        true,
      );
      await this.dependencies.auth.replaceIdentity();
      installation = {
        ...installation,
        deviceId: replacementDeviceId,
        publicKey: replacementIdentity.publicKey,
        spaceId: null,
        membershipStatus: null,
        currentKeyEpoch: null,
        recoveryConfirmedAt: null,
        snapshotId: snapshot.snapshotId,
        setupState: 'not_configured',
        pendingRevokedDeviceId: null,
        updatedAt: this.now().toISOString(),
      };
      await this.dependencies.installationRepository.save(installation);
    } else {
      requireNotConfigured(installation);
      await this.dependencies.auth.ensureIdentity();
    }
    const identity = await this.dependencies.crypto.ensureDeviceIdentity(
      installation.deviceId,
      false,
    );
    const challenge = await this.dependencies.transport.beginRecovery({
      spaceId: authorization.spaceId,
      authProof: authorization.authProof,
      deviceId: installation.deviceId,
      publicKey: identity.publicKey,
      platform: installation.platform,
    });
    await this.dependencies.crypto.recoverAndStoreKeyRing({
      recoveryMaterial,
      envelope: challenge.recoveryEnvelope,
    });
    const encryptedName = await this.dependencies.crypto.encryptDeviceName({
      spaceId: authorization.spaceId,
      deviceId: installation.deviceId,
      keyEpoch: challenge.currentKeyEpoch,
      deviceName: installation.deviceName,
    });
    await this.dependencies.transport.completeRecovery({
      deviceId: installation.deviceId,
      authProof: authorization.authProof,
      recoveryEnvelopeSha256Hex: await recoveryEnvelopeDigest(
        challenge.recoveryEnvelope,
        this.random,
      ),
      encryptedDeviceName: encryptedName.ciphertext,
      encryptedDeviceNameNonce: encryptedName.nonce,
    });
    const updated: SyncInstallation = {
      ...installation,
      publicKey: identity.publicKey,
      spaceId: authorization.spaceId,
      membershipStatus: 'active',
      currentKeyEpoch: challenge.currentKeyEpoch,
      recoveryConfirmedAt: this.now().toISOString(),
      snapshotId: installation.snapshotId,
      setupState: 'configured',
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(updated);
    return { installation: updated, devices: [], connection: 'online', warning: null };
  }

  public async revokeDevice(deviceId: string): Promise<SyncOverview> {
    const installation = await this.requireConfiguredInstallation();
    if (deviceId === installation.deviceId)
      throw new Error('Current active device cannot revoke itself.');
    if (installation.spaceId === null) throw new Error('Sync space is not configured.');
    await this.dependencies.crypto.requireRecoveryMaterial(installation.spaceId);
    return this.rotateAfterRevocation(installation, deviceId);
  }

  public async retryPendingRotation(): Promise<SyncOverview> {
    const installation = await this.requireInstallation();
    if (
      installation.setupState !== 'rotation_pending' ||
      installation.pendingRevokedDeviceId === null
    ) {
      throw new Error('No key rotation is pending.');
    }
    if (installation.spaceId === null) throw new Error('Sync space is not configured.');
    return this.rotateAfterRevocation(installation, installation.pendingRevokedDeviceId);
  }

  public async close(): Promise<void> {
    this.dependencies.pilotLifecycle?.close();
    await this.dependencies.pilotCoordinator?.close();
    await this.dependencies.auth.close();
  }

  public pilotStatus(): PilotSyncStatus {
    return (
      this.dependencies.pilotCoordinator?.status() ?? {
        state: 'idle',
        pendingCount: 0,
        conflictCount: 0,
        lastSuccessfulSyncAt: null,
      }
    );
  }

  public subscribePilotStatus(listener: (status: PilotSyncStatus) => void): () => void {
    if (this.dependencies.pilotCoordinator === undefined) {
      listener(this.pilotStatus());
      return () => undefined;
    }
    return this.dependencies.pilotCoordinator.subscribe(listener);
  }

  public async syncPilotNow(): Promise<void> {
    await this.dependencies.pilotCoordinator?.run();
  }

  public notifyPilotMutation(): void {
    this.dependencies.pilotCoordinator?.trigger();
  }

  private async rotateAfterRevocation(
    installation: SyncInstallation,
    targetDeviceId: string,
  ): Promise<SyncOverview> {
    if (installation.spaceId === null || installation.currentKeyEpoch === null)
      throw new Error('Sync space is not configured.');
    await this.dependencies.auth.ensureIdentity();
    const expectedEpoch =
      installation.setupState === 'rotation_pending'
        ? installation.currentKeyEpoch - 1
        : installation.currentKeyEpoch;
    const revoked = await this.dependencies.transport.revokeDeviceAndAdvanceEpoch(
      targetDeviceId,
      expectedEpoch,
    );
    const pending: SyncInstallation = {
      ...installation,
      currentKeyEpoch: revoked.newKeyEpoch,
      setupState: 'rotation_pending',
      pendingRevokedDeviceId: targetDeviceId,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(pending);
    const rotation = await this.dependencies.crypto.prepareRotation({
      spaceId: installation.spaceId,
      senderDeviceId: installation.deviceId,
      nextEpoch: revoked.newKeyEpoch,
      recipients: revoked.recipients,
    });
    for (const envelope of rotation.envelopes)
      await this.dependencies.transport.publishKeyEnvelope(envelope);
    await this.dependencies.transport.finalizeKeyEpochRotation({
      expectedEpoch: revoked.newKeyEpoch,
      recoveryEnvelope: rotation.recoveryEnvelope,
    });
    const completed: SyncInstallation = {
      ...pending,
      setupState: 'configured',
      pendingRevokedDeviceId: null,
      updatedAt: this.now().toISOString(),
    };
    await this.dependencies.installationRepository.save(completed);
    return this.loadOverview();
  }

  private async ensureInstallation(): Promise<SyncInstallation> {
    const current = await this.dependencies.installationRepository.find();
    if (current !== null) {
      const native = await this.dependencies.crypto.ensureDeviceIdentity(current.deviceId, false);
      if (native.publicKey !== current.publicKey)
        throw new Error('Device identity does not match secure storage.');
      return current;
    }
    const platform = await this.dependencies.crypto.platform();
    const deviceId = this.dependencies.createId();
    const identity = await this.dependencies.crypto.ensureDeviceIdentity(deviceId, true);
    const timestamp = this.now().toISOString();
    const installation: SyncInstallation = {
      deviceId,
      deviceName: defaultDeviceName(platform),
      platform,
      publicKey: identity.publicKey,
      createdAt: timestamp,
      spaceId: null,
      membershipStatus: null,
      currentKeyEpoch: null,
      recoveryConfirmedAt: null,
      snapshotId: null,
      setupState: 'not_configured',
      pendingRevokedDeviceId: null,
      updatedAt: timestamp,
      accountSetupState: 'local_anonymous',
      accountUserId: null,
      accountSessionId: null,
      accountEmail: null,
      accountMigrationSnapshotId: null,
    };
    await this.dependencies.installationRepository.save(installation);
    return installation;
  }

  private async requireInstallation(): Promise<SyncInstallation> {
    const installation = await this.dependencies.installationRepository.find();
    if (installation === null) throw new Error('Sync installation is unavailable.');
    return installation;
  }

  private async requireActiveInstallation(): Promise<
    SyncInstallation & { spaceId: string; currentKeyEpoch: number }
  > {
    const installation = await this.requireInstallation();
    if (
      installation.spaceId === null ||
      installation.currentKeyEpoch === null ||
      installation.membershipStatus !== 'active'
    ) {
      throw new Error('Sync space is not active.');
    }
    return installation as SyncInstallation & { spaceId: string; currentKeyEpoch: number };
  }

  private async requireConfiguredInstallation() {
    const installation = await this.requireActiveInstallation();
    if (installation.setupState !== 'configured') throw new Error('Sync setup is incomplete.');
    return installation;
  }
}

function requireNotConfigured(installation: SyncInstallation): void {
  if (installation.spaceId !== null || installation.membershipStatus !== null) {
    throw new Error('This installation already belongs to a Sync space.');
  }
}

function defaultDeviceName(platform: SyncPlatform): string {
  return platform === 'android' ? 'Android устройство' : 'Windows устройство';
}

async function envelopeDigest(envelope: SyncCryptoEnvelope, crypto: Crypto): Promise<string> {
  return digestCiphertextAndNonce(envelope.ciphertext, envelope.nonce, crypto);
}

async function recoveryEnvelopeDigest(
  envelope: SyncRecoveryEnvelope,
  crypto: Crypto,
): Promise<string> {
  return digestCiphertextAndNonce(envelope.ciphertext, envelope.nonce, crypto);
}

async function digestCiphertextAndNonce(
  ciphertext: string,
  nonce: string,
  crypto: Crypto,
): Promise<string> {
  const first = decodeBase64Url(ciphertext);
  const second = decodeBase64Url(nonce);
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first);
  bytes.set(second, first.length);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
