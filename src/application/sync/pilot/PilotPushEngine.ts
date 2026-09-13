import type { PilotSyncTransport } from '../ports/PilotSyncTransport';
import type {
  PilotCryptoEnvelope,
  PilotCryptoMetadata,
  SyncCryptoService,
} from '../ports/SyncCryptoService';
import type { PilotSyncStore } from '../ports/PilotSyncStore';
import { DomainError } from '../../../shared/errors/DomainError';
import { parsePilotSyncPayload } from './PilotSyncProtocol';

export interface PilotPushResult {
  readonly sent: number;
  readonly failed: number;
}

export class PilotPushEngine {
  public constructor(
    private readonly store: PilotSyncStore,
    private readonly crypto: SyncCryptoService,
    private readonly transport: PilotSyncTransport,
  ) {}

  public async run(): Promise<PilotPushResult> {
    const installation = await this.store.installation();
    if (
      installation?.setupState !== 'configured' ||
      installation.membershipStatus !== 'active' ||
      installation.spaceId === null ||
      installation.currentKeyEpoch === null
    ) {
      return { sent: 0, failed: 0 };
    }
    await this.store.prepareOutboxForInstallation({
      deviceId: installation.deviceId,
      keyEpoch: installation.currentKeyEpoch,
    });
    const leased = await this.store.lease();
    let sent = 0;
    let failed = 0;
    for (const record of leased) {
      let currentRecord = record;
      let rematerialized = false;
      sendAttempt: while (true) {
        let phase: 'crypto' | 'transport' = 'crypto';
        let envelopeIsStale = false;
        try {
          const payload = parsePilotSyncPayload(currentRecord.serializedPayload);
          envelopeIsStale =
            payload.originDeviceId !== installation.deviceId ||
            payload.keyEpoch !== installation.currentKeyEpoch;
          const metadata: PilotCryptoMetadata = {
            protocolVersion: 1,
            purpose: 'pilot_event',
            spaceId: installation.spaceId,
            eventId: currentRecord.eventId,
            objectId: currentRecord.transportObjectId,
            originDeviceId: payload.originDeviceId,
            keyEpoch: payload.keyEpoch,
            operation: currentRecord.operation,
            baseRevision: currentRecord.baseRevision,
            revision: currentRecord.proposedRevision,
            hlcWallTime: currentRecord.hlcWallTime,
            hlcLogical: currentRecord.hlcLogical,
          };
          let envelope: PilotCryptoEnvelope;
          if (currentRecord.encryptedPayload === null || currentRecord.encryptedNonce === null) {
            envelope = await this.crypto.encryptPilotPayload({
              metadata,
              plaintext: currentRecord.serializedPayload,
            });
            await this.store.saveEncrypted(currentRecord.eventId, envelope);
          } else {
            envelope = {
              metadata,
              ciphertext: currentRecord.encryptedPayload,
              nonce: currentRecord.encryptedNonce,
            };
          }
          phase = 'transport';
          const acknowledgement = await this.transport.push(envelope);
          await this.store.acknowledgePush(
            currentRecord.eventId,
            acknowledgement.sequence,
            acknowledgement.isCurrentWinner,
          );
          sent += 1;
          break sendAttempt;
        } catch (error: unknown) {
          let failure = error;
          if (
            phase === 'transport' &&
            !rematerialized &&
            isRejectedOldEnvelope(error, envelopeIsStale)
          ) {
            try {
              currentRecord = await this.store.rematerializeOutboxEvent(currentRecord.eventId, {
                deviceId: installation.deviceId,
                keyEpoch: installation.currentKeyEpoch,
              });
              rematerialized = true;
              continue sendAttempt;
            } catch (rematerializationError: unknown) {
              failure = rematerializationError;
              phase = 'crypto';
            }
          }
          if (phase === 'crypto' || isPermanentTransportError(failure)) {
            await this.store.quarantineOutbox(
              currentRecord.eventId,
              phase === 'crypto' ? 'crypto' : permanentErrorCode(failure),
            );
          } else {
            await this.store.retry(currentRecord.eventId, 'transient');
          }
          failed += 1;
          break sendAttempt;
        }
      }
    }
    return { sent, failed };
  }
}

function isRejectedOldEnvelope(error: unknown, envelopeIsStale: boolean) {
  return (
    error instanceof DomainError && error.code === 'sync.pilot_event_rejected' && envelopeIsStale
  );
}

function isPermanentTransportError(error: unknown): boolean {
  return error instanceof DomainError && error.code !== 'sync.pilot_transport_failed';
}

function permanentErrorCode(error: unknown): string {
  return error instanceof DomainError ? error.code : 'permanent';
}
